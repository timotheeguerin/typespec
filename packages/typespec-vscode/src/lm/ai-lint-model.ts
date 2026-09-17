import type { AiEvaluationRequest, AiQueryCall } from "@typespec/compiler/experimental";
import {
  LanguageModelChatMessage,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
  lm,
  window,
  type CancellationToken,
  type LanguageModelChat,
} from "vscode";

let selectedModel: LanguageModelChat | undefined;

export async function selectAiLintModel(): Promise<boolean> {
  const models = await lm.selectChatModels();
  if (models.length === 0) throw new Error("No language model is available for TypeSpec AI lint.");
  const selected = await window.showQuickPick(
    models.map((model) => ({
      label: model.name,
      description: model.vendor,
      model,
    })),
    { title: "Select a model for TypeSpec AI lint" },
  );
  if (!selected) return false;
  selectedModel = selected.model;
  return true;
}

export function clearAiLintModel() {
  selectedModel = undefined;
}

export async function evaluateAiLint(
  request: AiEvaluationRequest,
  query: (call: AiQueryCall) => Promise<unknown>,
  token: CancellationToken,
): Promise<string> {
  const model = selectedModel;
  if (!model) throw new Error("Enable TypeSpec AI lint and select a model first.");
  const messages = [
    LanguageModelChatMessage.User(request.instructions),
    LanguageModelChatMessage.User(
      JSON.stringify({ candidate: request.candidate, context: request.context }),
    ),
  ];
  const tools = request.tools.map((name) => ({
    name,
    description: `Read ${name === "view" ? "details about" : "entities related to"} a supplied graph handle.`,
    inputSchema: {
      type: "object",
      properties: { reference: { type: "string" } },
      required: ["reference"],
      additionalProperties: false,
    },
  }));
  for (let turn = 0; turn < 10; turn++) {
    if (token.isCancellationRequested) throw new Error("AI lint cancelled.");
    if (
      (await model.countTokens(
        messages
          .map((message) =>
            message.content
              .map((part) =>
                part instanceof LanguageModelTextPart ? part.value : JSON.stringify(part),
              )
              .join(""),
          )
          .join("\n"),
        token,
      )) > model.maxInputTokens
    )
      throw new Error("AI lint context exceeds the selected model's input limit.");
    const response = await model.sendRequest(messages, { tools }, token);
    const parts: (LanguageModelTextPart | LanguageModelToolCallPart)[] = [];
    let text = "";
    let toolCalls = 0;
    for await (const part of response.stream) {
      if (part instanceof LanguageModelTextPart) {
        text += part.value;
        if (text.length > 32768) throw new Error("AI lint response exceeds output limit.");
        parts.push(part);
      } else if (part instanceof LanguageModelToolCallPart) {
        if (++toolCalls > 8 || JSON.stringify(part.input).length > 32768) {
          throw new Error("AI lint tool-call output exceeds limits.");
        }
        parts.push(part);
      }
    }
    const calls = parts.filter((part) => part instanceof LanguageModelToolCallPart);
    if (!calls.length) return text;
    messages.push(LanguageModelChatMessage.Assistant(parts));
    for (const call of calls) {
      const input: unknown = call.input;
      if (
        (call.name !== "view" && call.name !== "related") ||
        !input ||
        typeof input !== "object" ||
        !("reference" in input) ||
        typeof input.reference !== "string"
      )
        throw new Error("Invalid AI graph tool call.");
      const result = await query({ tool: call.name, reference: input.reference });
      messages.push(
        LanguageModelChatMessage.User([
          new LanguageModelToolResultPart(call.callId, [
            new LanguageModelTextPart(JSON.stringify(result)),
          ]),
        ]),
      );
    }
  }
  throw new Error("AI lint model turn limit exceeded.");
}
