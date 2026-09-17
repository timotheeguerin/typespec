import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runAiLintCli } from "../src/cli.js";
import { createTestEvaluator } from "../src/testing.js";

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

it("runs configured rules with instruction files and emits parseable JSON", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const dispose = vi.fn(async () => {});
  await runAiLintCli(
    [resolve(import.meta.dirname, "fixtures/cli"), "--model", "test", "--format", "json"],
    async () => ({ evaluate: createTestEvaluator("violation"), dispose }),
  );
  expect(output).toHaveBeenCalledTimes(1);
  const report = JSON.parse(output.mock.calls[0][0]);
  expect(report.status).toBe("completed");
  expect(report.findings[0].ruleId).toBe("@typespec/ai-linter/use-duration");
  expect(report.findings[0].location.path).toBe("main.tsp");
  expect(report.findings[0].location.line).toBe(3);
  expect(dispose).toHaveBeenCalledOnce();
  expect(process.exitCode).toBe(1);
});

it("does not report successful completion when the provider fails", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await runAiLintCli(
    [resolve(import.meta.dirname, "fixtures/cli"), "--model", "test", "--format", "json"],
    async () => {
      throw new Error("No credentials");
    },
  );
  const report = JSON.parse(output.mock.calls[0][0]);
  expect(report.status).toBe("failed");
  expect(report.errors).toContain("No credentials");
  expect(process.exitCode).toBe(2);
});
