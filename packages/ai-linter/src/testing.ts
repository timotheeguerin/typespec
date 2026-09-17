import type { AiEvaluator } from "@typespec/compiler/experimental";

/** A deterministic provider for rule/host tests. It never accesses a model. */
export function createTestEvaluator(verdict: "violation" | "pass" | "abstain"): AiEvaluator {
  return async (request) => ({
    verdict,
    reason: "Deterministic test verdict.",
    evidence: verdict === "violation" ? [request.candidate.id] : [],
  });
}
