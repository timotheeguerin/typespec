import { describe, expect, it, vi } from "vitest";
import { createLinter, resolveLinterDefinition } from "../../src/core/linter.js";
import { runAiLinter } from "../../src/experimental/ai-linter.js";
import { createTypeQuery } from "../../src/experimental/type-query.js";
import type { AiLinterRuleDefinition } from "../../src/index.js";
import { Tester } from "../tester.js";

const rule: AiLinterRuleDefinition = {
  name: "duration",
  revision: "1",
  severity: "warning",
  description: "Use duration.",
  messages: { default: "Use duration." },
  instructions: "Identify elapsed time, not counts.",
  create(context) {
    return {
      modelProperty(property) {
        context.addCandidate({ target: property });
      },
    };
  },
};

async function setup(code = `model Test { timeout: int32; }`) {
  const { program } = await Tester.compile(code);
  const definition = resolveLinterDefinition("test", { rules: [], aiRules: [rule] });
  const linter = createLinter(program, async () => ({ linter: definition }));
  expect(await linter.extendRuleSet({ enable: { "test/duration": true } })).toEqual([]);
  return { program, linter, rules: linter.getAiRules() };
}

describe("AI lint execution", () => {
  it("does not run AI during ordinary linting or enable it in all", async () => {
    const create = vi.fn(rule.create);
    const definition = resolveLinterDefinition("test", {
      rules: [],
      aiRules: [{ ...rule, create }],
    });
    expect(definition.ruleSets.all).toBeUndefined();
    const { program } = await Tester.compile(`model Test { timeout: int32; }`);
    const linter = createLinter(program, async () => ({ linter: definition }));
    await linter.extendRuleSet({ enable: { "test/duration": true } });
    expect((await linter.lint()).diagnostics).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("reports grounded diagnostics without mutating the program", async () => {
    const { program, rules } = await setup();
    const result = await runAiLinter(program, rules, async (request) => ({
      verdict: "violation",
      reason: "Elapsed seconds.",
      evidence: [request.candidate.id],
    }));
    expect(result.status).toBe("completed");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe("test/duration");
    expect(program.diagnostics).toEqual([]);
  });

  it("rejects invented evidence and provider failures", async () => {
    const { program, rules } = await setup();
    const result = await runAiLinter(program, rules, async () => ({
      verdict: "violation",
      reason: "Elapsed seconds.",
      evidence: ["invented"],
    }));
    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual([]);
    expect(result.errors[0]).toContain("evidence");
    const failed = await runAiLinter(program, rules, async () => {
      throw new Error("Provider unavailable");
    });
    expect(failed.status).toBe("failed");
    expect(failed.errors).toContain("Provider unavailable");
  });

  it("preserves abstentions and cancellation", async () => {
    const { program, rules } = await setup();
    const result = await runAiLinter(program, rules, async () => ({
      verdict: "abstain",
      reason: "Insufficient evidence.",
      evidence: [],
    }));
    expect(result.abstained).toBe(1);
    const controller = new AbortController();
    controller.abort();
    const evaluate = vi.fn();
    const cancelled = await runAiLinter(program, rules, evaluate, { signal: controller.signal });
    expect(cancelled.status).toBe("cancelled");
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("honors suppression without modifying suppression tracking", async () => {
    const { program, rules } = await setup(
      `model Test { #suppress "test/duration" "intentional wire type"\ntimeout: int32; }`,
    );
    const evaluate = vi.fn();
    const result = await runAiLinter(program, rules, evaluate);
    expect(result.diagnostics).toEqual([]);
    expect(result.suppressed).toBe(1);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("reports candidate budget exhaustion instead of a clean partial result", async () => {
    const { program, rules } = await setup("model Test { first: int32; second: int32; }");
    const evaluate = vi.fn(async () => ({ verdict: "pass", reason: "A count.", evidence: [] }));
    const result = await runAiLinter(program, rules, evaluate, { maxCandidates: 1 });
    expect(result.status).toBe("incomplete");
    expect(result.evaluated).toBe(1);
    expect(result.candidates).toBe(2);
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("does not let a provider hide exhausted query budgets", async () => {
    const { program, rules } = await setup();
    const result = await runAiLinter(
      program,
      rules,
      async (request, query) => {
        query({ tool: "view", reference: request.candidate.id });
        expect(() => query({ tool: "view", reference: request.candidate.id })).toThrow("budget");
        return { verdict: "pass", reason: "A count.", evidence: [] };
      },
      { maxQueriesPerCandidate: 1 },
    );
    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("budget");
  });

  it("terminates a provider that does not resolve before the deadline", async () => {
    const { program, rules } = await setup();
    const result = await runAiLinter(program, rules, async () => new Promise(() => {}), {
      timeoutMs: 10,
    });
    expect(result.status).toBe("failed");
    expect(result.evaluated).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it.each([
    undefined,
    {},
    "not JSON",
    { verdict: "violation", reason: "No evidence.", evidence: [] },
    { verdict: "pass", reason: "", evidence: [] },
  ])("rejects invalid provider output (%j)", async (output) => {
    const { program, rules } = await setup();
    const result = await runAiLinter(program, rules, async () => output);
    expect(result.status).toBe("failed");
    expect(result.findings).toEqual([]);
  });
});

describe("type query sessions", () => {
  it("preserves explicit enum member values", async () => {
    const { program } = await Tester.compile(`enum State { Ready: 1, Done: "finished" }`);
    const query = createTypeQuery(program);
    expect(query.view("State.Ready").details?.value).toBe(1);
    expect(query.view("State.Done").details?.value).toBe("finished");
  });

  it("includes property documentation and exact source ranges", async () => {
    const { program } = await Tester.compile(
      `model Test { @doc("Elapsed seconds") timeout: int32; }`,
    );
    const query = createTypeQuery(program);
    const property = query.view("Test.timeout");
    expect(property.description).toBe("Elapsed seconds");
    expect(property.location?.endColumn).toBeGreaterThan(property.location!.column);
    expect(query.view(property.id).id).toBe(property.id);
  });

  it("makes operation documentation reachable from parameter candidates", async () => {
    const { program } = await Tester.compile(
      `@doc("Wait for the given number of seconds.") op wait(delay: int32): void;`,
    );
    const query = createTypeQuery(program);
    const parameter = query
      .list({ kind: "ModelProperty" })
      .items.find((item) => item.name.endsWith("delay"))!;
    expect(
      query
        .related(parameter.id)
        .some((item) => item.kind === "Operation" && item.description?.includes("seconds")),
    ).toBe(true);
  });

  it("bounds traversal, rejects invalid depth and foreign handles", async () => {
    const { program } = await Tester.compile(`model Test { child: Test; }`);
    const query = createTypeQuery(program);
    expect(() => query.view("Test", { depth: -1 })).toThrow();
    expect(() => query.view("Test", { depth: 100 })).toThrow();
    const view = query.view("Test");
    expect(() => createTypeQuery(program).view(view.id)).toThrow();
    expect(JSON.stringify(query.view("Test", { depth: 2 })).length).toBeLessThan(32768);
  });

  it("paginates without losing entities and exposes configured encodings", async () => {
    const { program } = await Tester.compile(
      `model Test { @encode("seconds", int32) timeout: duration; }`,
    );
    const query = createTypeQuery(program);
    const page = query.list({ limit: 1, kind: "ModelProperty" });
    expect(page.items).toHaveLength(1);
    expect(page.nextOffset).toBeUndefined();
    expect(query.view("Test.timeout").details?.encoding).toEqual({
      encoding: "seconds",
      type: "int32",
    });
    expect(() => query.list({ limit: 101 })).toThrow();
    expect(() => query.list({ offset: -1 })).toThrow();
  });
});
