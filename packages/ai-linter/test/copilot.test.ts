import { stat } from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { createCopilotEvaluator } from "../src/copilot.js";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  abort: vi.fn(),
  disconnect: vi.fn(),
  options: [] as { baseDirectory: string; mode: string }[],
}));
vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: class {
    constructor(options: { baseDirectory: string; mode: string }) {
      mocks.options.push(options);
    }
    start = mocks.start;
    stop = mocks.stop;
    async createSession() {
      return { sendAndWait: mocks.send, abort: mocks.abort, disconnect: mocks.disconnect };
    }
  },
}));

const request = {
  ruleId: "test/rule",
  revision: "1",
  instructions: "Assess duration.",
  tools: ["view"] as const,
  candidate: { id: "@query/1", name: "Test", kind: "Model" as const, origin: "project" },
  context: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.options.length = 0;
  mocks.start.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue([]);
  mocks.abort.mockResolvedValue(undefined);
  mocks.disconnect.mockResolvedValue(undefined);
});

it("owns and cleans up an isolated runtime without retaining session data", async () => {
  mocks.send.mockResolvedValue({ data: { content: '{"verdict":"pass"}' } });
  const provider = await createCopilotEvaluator("test");
  const directory = mocks.options[0].baseDirectory;
  expect(mocks.options[0].mode).toBe("empty");
  expect((await stat(directory)).isDirectory()).toBe(true);
  try {
    expect(await provider.evaluate(request, () => undefined, new AbortController().signal)).toBe(
      '{"verdict":"pass"}',
    );
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  } finally {
    await provider.dispose();
  }
  expect(mocks.stop).toHaveBeenCalledOnce();
  await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves inference and disconnect failures while still cleaning up", async () => {
  mocks.send.mockRejectedValue(new Error("Provider refused"));
  mocks.disconnect.mockRejectedValue(new Error("Disconnect failed"));
  const provider = await createCopilotEvaluator("test");
  try {
    await expect(
      provider.evaluate(request, () => undefined, new AbortController().signal),
    ).rejects.toThrow("Provider refused; Disconnect failed");
  } finally {
    await provider.dispose();
  }
});

it("cleans up after startup failure", async () => {
  mocks.start.mockRejectedValue(new Error("Runtime unavailable"));
  await expect(createCopilotEvaluator("test")).rejects.toThrow("Runtime unavailable");
  expect(mocks.stop).toHaveBeenCalledOnce();
  await expect(stat(mocks.options[0].baseDirectory)).rejects.toMatchObject({ code: "ENOENT" });
});
