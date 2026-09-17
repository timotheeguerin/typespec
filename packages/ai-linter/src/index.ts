import { createTypeSpecLibrary, defineLinter } from "@typespec/compiler";
import { useDuration } from "./rules/use-duration.js";

export { createAiRule, getAiLinterRules, runAiLinter } from "@typespec/compiler/experimental";
export type {
  AiEvaluationRequest,
  AiEvaluator,
  AiLintResult,
} from "@typespec/compiler/experimental";
export { useDuration };

export const $lib = createTypeSpecLibrary({
  name: "@typespec/ai-linter",
  diagnostics: {},
});

export const $linter = defineLinter({
  rules: [],
  aiRules: [useDuration],
  ruleSets: {
    recommended: {
      enable: { "@typespec/ai-linter/use-duration": true },
    },
  },
});
