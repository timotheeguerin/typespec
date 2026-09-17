import { beforeEach, expect, it, vi } from "vitest";
import { LanguageModelTextPart, LanguageModelToolCallPart } from "vscode";
import { clearAiLintModel, evaluateAiLint, selectAiLintModel } from "../../src/lm/ai-lint-model.js";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  pick: vi.fn(),
  send: vi.fn(),
}));
vi.mock("vscode", () => {
  class TextPart {
    constructor(public value: string) {}
  }
  class ToolCall {
    constructor(
      public callId: string,
      public name: string,
      public input: unknown,
    ) {}
  }
  class ToolResult {
    constructor(
      public callId: string,
      public content: unknown,
    ) {}
  }
  const message = (content: unknown) => ({
    content: typeof content === "string" ? [new TextPart(content)] : content,
  });
  return {
    LanguageModelTextPart: TextPart,
    LanguageModelToolCallPart: ToolCall,
    LanguageModelToolResultPart: ToolResult,
    LanguageModelChatMessage: { User: message, Assistant: message },
    lm: { selectChatModels: mocks.select },
    window: { showQuickPick: mocks.pick },
  };
});

const request = {
  ruleId: "test/rule",
  revision: "1",
  instructions: "Assess duration.",
  tools: ["view"] as const,
  candidate: { id: "@query/1", name: "Test", kind: "Model" as const, origin: "project" },
  context: [],
};
const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
const model = {
  name: "Test",
  vendor: "test",
  maxInputTokens: 10000,
  sendRequest: mocks.send,
  countTokens: async () => 10,
};

beforeEach(() => {
  clearAiLintModel();
  vi.clearAllMocks();
  mocks.select.mockResolvedValue([model]);
  mocks.pick.mockResolvedValue({ model });
});

it("does not select models or request consent during evaluation", async () => {
  await expect(evaluateAiLint(request, vi.fn(), token)).rejects.toThrow("Enable");
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it("handles bounded graph tools and then returns the model verdict", async () => {
  await selectAiLintModel();
  mocks.send
    .mockResolvedValueOnce({
      stream: (async function* () {
        yield new LanguageModelToolCallPart("call1", "view", { reference: "@query/1" });
      })(),
    })
    .mockResolvedValueOnce({
      stream: (async function* () {
        yield new LanguageModelTextPart('{"verdict":"pass","reason":"A count.","evidence":[]}');
      })(),
    });
  const query = vi.fn(async () => ({ id: "@query/1", description: "Count." }));
  expect(await evaluateAiLint(request, query, token)).toContain('"verdict":"pass"');
  expect(query).toHaveBeenCalledWith({ tool: "view", reference: "@query/1" });
  expect(mocks.send).toHaveBeenCalledTimes(2);
});

it("surfaces provider failures and cancellation", async () => {
  await selectAiLintModel();
  mocks.send.mockRejectedValue(new Error("Quota exhausted"));
  await expect(evaluateAiLint(request, vi.fn(), token)).rejects.toThrow("Quota");
  await expect(
    evaluateAiLint(request, vi.fn(), { ...token, isCancellationRequested: true }),
  ).rejects.toThrow("cancelled");
});
