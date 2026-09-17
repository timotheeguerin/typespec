import type { SessionConfig } from "@github/copilot-sdk";
import type {
  AiEvaluationRequest,
  AiEvaluator,
  AiQueryCall,
} from "@typespec/compiler/experimental";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createCopilotSessionConfig(
  model: string,
  request: AiEvaluationRequest,
  query: (call: AiQueryCall) => unknown,
): SessionConfig {
  return {
    model,
    availableTools: request.tools.map((tool) => `custom:${tool}`),
    tools: request.tools.map((tool) => ({
      name: tool,
      description: `Read ${tool} information for a supplied TypeSpec graph handle.`,
      parameters: {
        type: "object",
        properties: { reference: { type: "string" } },
        required: ["reference"],
        additionalProperties: false,
      },
      skipPermission: true,
      defer: "never",
      handler(input: unknown) {
        if (
          !input ||
          typeof input !== "object" ||
          !("reference" in input) ||
          typeof input.reference !== "string"
        )
          throw new Error("Invalid graph query.");
        return JSON.stringify(query({ tool, reference: input.reference }));
      },
    })),
    onPermissionRequest: () => ({
      kind: "reject",
      feedback: "Only supplied read-only graph tools are allowed.",
    }),
    systemMessage: { mode: "replace", content: request.instructions },
    enableConfigDiscovery: false,
    enableOnDemandInstructionDiscovery: false,
    enableFileHooks: false,
    enableHostGitOperations: false,
    enableSessionStore: false,
    enableSkills: false,
    enableSessionTelemetry: false,
    remoteSession: "off",
    infiniteSessions: { enabled: false },
  };
}

/** Isolated SDK runtime; no ambient repository instructions or host tools. */
export async function createCopilotEvaluator(model: string): Promise<{
  evaluate: AiEvaluator;
  dispose(): Promise<void>;
}> {
  if (!model.trim()) throw new Error("A Copilot model ID is required.");
  const { CopilotClient } = await import("@github/copilot-sdk");
  const directory = await mkdtemp(join(tmpdir(), "typespec-ai-"));
  const client = new CopilotClient({
    mode: "empty",
    baseDirectory: directory,
    workingDirectory: directory,
    gitHubToken:
      process.env.COPILOT_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
    logLevel: "error",
  });
  async function dispose() {
    try {
      const errors = await client.stop();
      if (errors.length) throw new AggregateError(errors, "Copilot runtime did not stop cleanly.");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  try {
    await client.start();
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    dispose,
    async evaluate(request, query, signal) {
      signal.throwIfAborted();
      const session = await client.createSession(createCopilotSessionConfig(model, request, query));
      let abort: Promise<void> | undefined;
      const errors: unknown[] = [];
      let content: string | undefined;
      const cancel = () => {
        abort = session.abort().catch((error: unknown) => {
          errors.push(error);
        });
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        signal.throwIfAborted();
        const response = await session.sendAndWait({
          prompt: JSON.stringify({ candidate: request.candidate, context: request.context }),
        });
        signal.throwIfAborted();
        if (!response) throw new Error("Copilot returned no verdict.");
        content = response.data.content;
      } catch (error) {
        errors.push(error);
      }
      signal.removeEventListener("abort", cancel);
      await abort;
      try {
        await session.disconnect();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) {
        throw new AggregateError(
          errors,
          errors
            .map((error) => (error instanceof Error ? error.message : String(error)))
            .join("; "),
        );
      }
      if (content === undefined) throw new Error("Copilot returned no verdict.");
      return content;
    },
  };
}
