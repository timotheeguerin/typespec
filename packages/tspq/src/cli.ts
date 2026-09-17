/* eslint-disable no-console */
import { formatDiagnostic, resolvePath } from "@typespec/compiler";
import { createTypeQuery } from "@typespec/compiler/experimental";
import yargs from "yargs";
import { compileWithLocalCompiler } from "./compile-with-local-compiler.js";
import { TypePrinter } from "./printer.js";
import { summarizeProgram } from "./summary.js";

async function main() {
  await yargs(process.argv.slice(2))
    .scriptName("tspq")
    .strict()
    .help()
    .option("entrypoint", {
      type: "string",
      default: ".",
      description: "Project entrypoint or directory.",
    })
    .option("config", { type: "string" })
    .option("json", { type: "boolean", default: false })
    .command(
      "summary",
      "Summarize project services and types.",
      () => {},
      async (args) => {
        const program = await load(args.entrypoint, args.config);
        const summary = summarizeProgram(program);
        console.log(args.json ? JSON.stringify(summary) : new TypePrinter().formatSummary(summary));
      },
    )
    .command(
      "view <reference>",
      "Inspect a named type or property.",
      (cmd) =>
        cmd
          .positional("reference", { type: "string", demandOption: true })
          .option("depth", { type: "number", default: 1 }),
      async (args) => {
        const program = await load(args.entrypoint, args.config);
        const view = createTypeQuery(program).view(args.reference, { depth: args.depth });
        console.log(JSON.stringify(view, undefined, args.json ? undefined : 2));
      },
    )
    .command(
      "list",
      "List project entities in bounded pages.",
      (cmd) =>
        cmd
          .option("offset", { type: "number", default: 0 })
          .option("limit", { type: "number", default: 50 }),
      async (args) => {
        const program = await load(args.entrypoint, args.config);
        console.log(
          JSON.stringify(createTypeQuery(program).list({ offset: args.offset, limit: args.limit })),
        );
      },
    )
    .demandCommand(1)
    .parseAsync();
}

async function load(entrypoint: string, config?: string) {
  const program = await compileWithLocalCompiler(resolvePath(process.cwd(), entrypoint), config);
  for (const diagnostic of program.diagnostics) console.error(formatDiagnostic(diagnostic));
  if (program.hasError()) throw new Error("Query aborted because compilation failed.");
  return program;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
