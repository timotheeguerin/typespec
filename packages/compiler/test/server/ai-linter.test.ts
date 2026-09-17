import { expect, it, vi } from "vitest";
import { FileChangeType } from "vscode-languageserver";
import type { AiLinterRuleDefinition } from "../../src/core/types.js";
import type { AiEvaluator } from "../../src/experimental/ai-linter.js";
import { createTestServerHost } from "../../src/testing/test-server-host.js";

async function setup(evaluateAi: AiEvaluator) {
  const host = await createTestServerHost({ evaluateAi });
  const rule: AiLinterRuleDefinition = {
    name: "duration",
    revision: "1",
    severity: "warning",
    description: "Use duration.",
    instructions: "Identify durations.",
    messages: { default: "Use duration." },
    create(context) {
      return {
        modelProperty(target) {
          context.addCandidate({ target });
        },
      };
    },
  };
  host.addJsFile("node_modules/test-rules/index.js", { $linter: { rules: [], aiRules: [rule] } });
  host.addTypeSpecFile(
    "node_modules/test-rules/package.json",
    JSON.stringify({ name: "test-rules", version: "1.0.0", type: "module", main: "index.js" }),
  );
  host.addTypeSpecFile("tspconfig.yaml", "linter:\n  enable:\n    test-rules/duration: true\n");
  const document = host.addOrUpdateDocument("main.tsp", "model Test { timeout: int32; }");
  return { host, document };
}

it("reports missing AI configuration without invoking the provider", async () => {
  const evaluateAi = vi.fn<AiEvaluator>();
  const host = await createTestServerHost({ evaluateAi });
  const document = host.addOrUpdateDocument("main.tsp", "model Test {}");
  await expect(host.server.aiLint(document, new AbortController().signal)).rejects.toThrow(
    "No AI rules",
  );
  expect(evaluateAi).not.toHaveBeenCalled();
});

it("publishes AI reports separately without changing ordinary diagnostics", async () => {
  const evaluate = vi.fn<AiEvaluator>(async (request) => ({
    verdict: "violation",
    reason: "Elapsed time.",
    evidence: [request.candidate.id],
  }));
  const { host, document } = await setup(evaluate);
  await host.server.compile(document, undefined, { mode: "full" });
  expect(evaluate).not.toHaveBeenCalled();
  const report = await host.server.aiLint(document, new AbortController().signal);
  expect(report.errors).toEqual([]);
  expect(report.findings).toHaveLength(1);
  expect(report.findings[0].location.line).toBe(1);
  expect(host.getDiagnostics("main.tsp")).toEqual([]);
});

it("cancels inference when another document changes", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const { host, document } = await setup(async (_, __, signal) => {
    started();
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  });
  const pending = host.server.aiLint(document, new AbortController().signal);
  await ready;
  host.addOrUpdateDocument("other.tsp", "model Other {}");
  const report = await pending;
  expect(report.status).toBe("cancelled");
  expect(report.findings).toEqual([]);
});

it("does not cancel inference on the matching open-file save notification", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { host, document } = await setup(async (request) => {
    started();
    await waiting;
    return { verdict: "violation", reason: "Elapsed time.", evidence: [request.candidate.id] };
  });
  const pending = host.server.aiLint(document, new AbortController().signal);
  await ready;
  host.server.watchedFilesChanged({
    changes: [{ uri: document.uri, type: FileChangeType.Changed }],
  });
  finish();
  expect((await pending).status).toBe("completed");
});
