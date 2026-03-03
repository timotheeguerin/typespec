/* eslint-disable no-console */
import { bundleTypeSpecLibrary } from "@typespec/bundler";
import { NodeHost, logDiagnostics, resolvePath } from "@typespec/compiler";
import pc from "picocolors";
import yargs from "yargs";
import { generateExternSignatures } from "./gen-extern-signatures/gen-extern-signatures.js";
import { generateLibraryDocs } from "./ref-doc/experimental.js";

try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("source-map-support/register.js");
} catch {
  // package only present in dev.
}

function logExperimentalWarning(type: "log" | "error") {
  const log =
    type === "error"
      ? (message: string) => console.error(pc.red(message))
      : (message: string) => console.log(pc.yellow(message));
  log("-".repeat(100));
  log(
    `tspd (TypeSpec Library Developer Cli) is experimental and might be ${pc.bold(
      "BREAKING",
    )} between versions.`,
  );
  if (type === "error") {
    log(`Add "--enable-experimental" flag to acknowledge this and continue.`);
  }
  log("-".repeat(100));
}

async function main() {
  console.log(`TypeSpec Developer Tools\n`);

  await yargs(process.argv.slice(2))
    .scriptName("tspd")
    .help()
    .strict()
    .parserConfiguration({
      "greedy-arrays": false,
      "boolean-negation": false,
    })
    .option("debug", {
      type: "boolean",
      description: "Output debug log messages.",
      default: false,
    })
    .option("pretty", {
      type: "boolean",
      description:
        "Enable color and formatting in TypeSpec's output to make compiler errors easier to read.",
      default: true,
    })
    .option("enable-experimental", {
      type: "boolean",
      description: "Acknowledge that the tspd command line is experiemental.",
      default: false,
    })
    .check((args) => {
      if (args["enable-experimental"]) {
        logExperimentalWarning("log");
        return true;
      } else {
        logExperimentalWarning("error");
        process.exit(1);
      }
    })
    .command(
      "doc <entrypoint>",
      "Generate documentation for a TypeSpec library.",
      (cmd) => {
        return cmd
          .positional("entrypoint", {
            description: "Path to the library entrypoint.",
            type: "string",
            demandOption: true,
          })
          .option("output-dir", {
            type: "string",
          })
          .option("skip-js", {
            description: "Skip generating JS API docs.",
            type: "boolean",
          })
          .option("typekits", {
            description: "Generate typekit docs. Currently targeted for use with Astro Starlight.",
            type: "boolean",
          })
          .option("llmstxt", {
            description:
              "Add llmstxt frontmatter to generated docs to aide in generating llms.txt files.",
            type: "boolean",
          });
      },
      async (args) => {
        const resolvedRoot = resolvePath(process.cwd(), args.entrypoint);
        const host = NodeHost;
        const diagnostics = await generateLibraryDocs(
          resolvedRoot,
          args["output-dir"] ?? resolvePath(resolvedRoot, "docs"),
          {
            skipJSApi: args["skip-js"],
            typekits: args["typekits"],
            llmstxt: args["llmstxt"],
          },
        );
        // const diagnostics = await generateExternSignatures(host, resolvedRoot);
        if (diagnostics.length > 0) {
          logDiagnostics(diagnostics, host.logSink);
        }
      },
    )
    .command(
      "gen-extern-signature <entrypoint>",
      "Format given list of TypeSpec files.",
      (cmd) => {
        return cmd.positional("entrypoint", {
          description: "Path to the library entrypoint.",
          type: "string",
          demandOption: true,
        });
      },
      async (args) => {
        const resolvedRoot = resolvePath(process.cwd(), args.entrypoint);
        const host = NodeHost;
        const diagnostics = await generateExternSignatures(host, resolvedRoot);
        if (diagnostics.length > 0) {
          logDiagnostics(diagnostics, host.logSink);
        }
      },
    )
    .command(
      "bundle-contained <entrypoint>",
      "Create a self-contained emitter bundle with singleton dependencies internalized.",
      (cmd) => {
        return cmd
          .positional("entrypoint", {
            description: "Path to the emitter package root.",
            type: "string",
            demandOption: true,
          })
          .option("output-dir", {
            type: "string",
            description:
              "Output directory for the contained bundle. Defaults to dist/contained under the entrypoint.",
          })
          .option("contained-dependencies", {
            type: "array",
            string: true,
            description:
              "Dependency prefixes to bundle in (e.g. @alloy-js/). Auto-detected from package.json if not specified.",
          })
          .option("platform", {
            type: "string",
            choices: ["browser", "node"] as const,
            default: "node",
            description: "Target platform for the bundle.",
          });
      },
      async (args) => {
        const resolvedRoot = resolvePath(process.cwd(), args.entrypoint);
        const outputDir = args["output-dir"] ?? resolvePath(resolvedRoot, "dist/contained");

        // Auto-detect contained dependencies if not specified
        let containedDependencies = args["contained-dependencies"];
        if (!containedDependencies || containedDependencies.length === 0) {
          containedDependencies = await detectContainedDependencies(resolvedRoot);
          if (containedDependencies.length > 0) {
            console.log(
              `Auto-detected contained dependencies: ${containedDependencies.join(", ")}`,
            );
          }
        }

        console.log(`Bundling ${resolvedRoot} → ${outputDir}`);
        console.log(`Platform: ${args.platform}`);
        console.log(`Contained dependencies: ${containedDependencies.join(", ") || "(none)"}`);

        await bundleTypeSpecLibrary(resolvedRoot, outputDir, {
          containedDependencies,
          platform: args.platform as "browser" | "node",
          minify: true,
        });
        console.log(`Bundle created at ${outputDir}`);
      },
    )
    .demandCommand(1, "You must use one of the supported commands.").argv;
}

/** Well-known singleton dependency prefixes that should be contained. */
const wellKnownSingletonPrefixes = ["@alloy-js/"];

/**
 * Auto-detect dependencies that should be contained by looking at the
 * package.json's dependencies for well-known singleton packages.
 */
async function detectContainedDependencies(packageRoot: string): Promise<string[]> {
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const contained: string[] = [];

    for (const prefix of wellKnownSingletonPrefixes) {
      if (Object.keys(allDeps).some((dep) => dep.startsWith(prefix))) {
        contained.push(prefix);
      }
    }

    // If we found singleton deps, also contain emitter-framework and http-client
    // since they re-export alloy-js types
    if (contained.length > 0) {
      if (allDeps["@typespec/emitter-framework"]) {
        contained.push("@typespec/emitter-framework");
      }
      if (allDeps["@typespec/http-client"]) {
        contained.push("@typespec/http-client");
      }
    }

    return contained;
  } catch {
    return [];
  }
}

function internalError(error: unknown): never {
  // NOTE: An expected error, like one thrown for bad input, shouldn't reach
  // here, but be handled somewhere else. If we reach here, it should be
  // considered a bug and therefore we should not suppress the stack trace as
  // that risks losing it in the case of a bug that does not repro easily.

  console.error("Internal error!");
  console.error("File issue at https://github.com/microsoft/typespec");
  console.error();
  console.error(error);

  process.exit(1);
}

process.on("unhandledRejection", (error: unknown) => {
  console.error("Unhandled promise rejection!");
  internalError(error);
});

main().catch(internalError);
