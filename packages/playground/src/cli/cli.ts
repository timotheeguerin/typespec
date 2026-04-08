/* eslint-disable no-console */
import pc from "picocolors";
import yargs from "yargs";
import { runBuild } from "./build.js";
import { runDev } from "./dev.js";

async function main() {
  console.log(pc.cyan("TypeSpec Playground CLI\n"));

  await yargs(process.argv.slice(2))
    .scriptName("typespec-playground")
    .help()
    .strict()
    .parserConfiguration({
      "greedy-arrays": false,
      "boolean-negation": false,
    })
    .option("emitter", {
      type: "string",
      description: "The emitter package name (e.g. @typespec/openapi3).",
      demandOption: true,
    })
    .option("libraries", {
      type: "array",
      string: true,
      description:
        "Additional TypeSpec libraries to include beyond auto-discovered peer dependencies.",
    })
    .command(
      "dev",
      "Start a development server with hot-reload for the playground.",
      (cmd) => {
        return cmd.option("port", {
          type: "number",
          description: "Port for the dev server.",
          default: 5174,
        });
      },
      async (args) => {
        await runDev({
          emitter: args.emitter,
          port: args.port,
          libraries: args.libraries,
        });
      },
    )
    .command(
      "build",
      "Create a production build of the playground.",
      (cmd) => {
        return cmd.option("output", {
          type: "string",
          description: "Output directory for the build.",
          default: "dist/playground",
        });
      },
      async (args) => {
        await runBuild({
          emitter: args.emitter,
          output: args.output,
          libraries: args.libraries,
        });
      },
    )
    .demandCommand(1, "You must use one of the supported commands.").argv;
}

function internalError(error: unknown): never {
  console.error(pc.red("Internal error!"));
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
