/* eslint-disable no-console */
import { formatDiagnostic, resolvePath } from "@typespec/compiler";
import { getAiLinterRules, runAiLinter } from "@typespec/compiler/experimental";
import { compileWithLocalCompiler } from "@typespec/tspq";
import yargs from "yargs";
import { createCopilotEvaluator } from "./copilot.js";
import { exitCode, githubAnnotation } from "./report.js";

export async function runAiLintCli(
  argv: string[],
  createProvider: typeof createCopilotEvaluator = createCopilotEvaluator,
): Promise<void> {
  await yargs(argv)
    .scriptName("tsp-ai-lint")
    .strict()
    .help()
    .command(
      "$0 [entrypoint]",
      "Run configured AI rules without running emitters.",
      (cmd) =>
        cmd
          .positional("entrypoint", { type: "string", default: "." })
          .option("config", { type: "string" })
          .option("model", { type: "string", demandOption: true })
          .option("format", {
            choices: ["text", "json", "github"] as const,
            default: "text" as const,
          })
          .option("annotation-level", {
            choices: ["warning", "error"] as const,
            default: "warning" as const,
          })
          .option("max-candidates", { type: "number", default: 100 }),
      async (args) => {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        process.once("SIGINT", cancel);
        let provider: Awaited<ReturnType<typeof createCopilotEvaluator>> | undefined;
        try {
          const program = await compileWithLocalCompiler(
            resolvePath(process.cwd(), args.entrypoint),
            args.config,
          );
          for (const diagnostic of program.diagnostics) console.error(formatDiagnostic(diagnostic));
          if (program.hasError()) throw new Error("AI lint requires successful compilation.");
          const rules = getAiLinterRules(program);
          if (rules.length === 0)
            throw new Error(
              "No AI rules are enabled. Configure linter.extends or linter.enable in tspconfig.yaml.",
            );
          provider = await createProvider(args.model);
          const { diagnostics: _, ...result } = await runAiLinter(
            program,
            rules,
            provider.evaluate,
            {
              signal: controller.signal,
              maxCandidates: args.maxCandidates,
            },
          );
          const report = {
            ...result,
            projectRoot: program.projectRoot,
            provider: "copilot",
            model: args.model,
          };
          const completedProvider = provider;
          provider = undefined;
          await completedProvider.dispose();
          if (args.format === "json") console.log(JSON.stringify(report));
          else {
            for (const finding of report.findings)
              console.log(
                args.format === "github"
                  ? githubAnnotation(finding, program.projectRoot, args.annotationLevel)
                  : `${finding.location.path}:${finding.location.line}:${finding.location.column} - warning ${finding.ruleId}: ${finding.message}`,
              );
            console.error(
              `AI lint ${report.status}: ${report.findings.length} findings, ${report.abstained} abstentions, ${report.evaluated}/${report.candidates} evaluated, ${report.suppressed} suppressed.`,
            );
            for (const error of report.errors) console.error(error);
          }
          process.exitCode = exitCode(report);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (args.format === "json")
            console.log(JSON.stringify({ status: "failed", findings: [], errors: [message] }));
          else console.error(message);
          process.exitCode = 2;
        } finally {
          process.removeListener("SIGINT", cancel);
          await provider?.dispose();
        }
      },
    )
    .parseAsync();
}
