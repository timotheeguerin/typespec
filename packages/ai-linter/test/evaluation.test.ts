import { runAiLinter } from "@typespec/compiler/experimental";
import { createTester } from "@typespec/compiler/testing";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createCopilotEvaluator } from "../src/copilot.js";
import { useDuration } from "../src/rules/use-duration.js";

const model = process.env.TYPESPEC_AI_EVAL_MODEL;
const tester = createTester(resolve(import.meta.dirname, ".."), { libraries: [] });
const instructions = await readFile(
  new URL("../rules/use-duration.instructions.md", import.meta.url),
  "utf8",
);

describe.skipIf(!model)("opt-in duration model evaluation", () => {
  it.each([
    ["Timeout in seconds.", "timeout", "violation"],
    ["Elapsed milliseconds since the request started.", "elapsed", "violation"],
    ["Number of retries.", "retries", "pass"],
    ["Unix timestamp in seconds since the epoch.", "createdAt", "pass"],
    ["Number of packets per second.", "rate", "pass"],
    ["Maximum number of network hops.", "ttl", "pass"],
  ])(
    "%s",
    async (documentation, name, expected) => {
      const { program } = await tester.compile(
        `model Test { @doc("${documentation}") ${name}: int32; }`,
      );
      const provider = await createCopilotEvaluator(model!);
      try {
        const result = await runAiLinter(
          program,
          [
            {
              rule: { ...useDuration, id: "@typespec/ai-linter/use-duration", instructions },
              options: {},
            },
          ],
          provider.evaluate,
          { maxCandidates: 1 },
        );
        expect(result.status).toBe("completed");
        expect(result.abstained).toBe(0);
        expect(result.findings.length).toBe(expected === "violation" ? 1 : 0);
      } finally {
        await provider.dispose();
      }
    },
    90000,
  );
});
