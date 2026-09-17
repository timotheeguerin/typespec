import { beforeEach, expect, it, vi } from "vitest";
import { registerAiLint } from "../../src/ai-lint.js";

const mocks = vi.hoisted(() => ({
  commands: new Map<string, () => unknown>(),
  events: new Map<string, (value?: unknown) => unknown>(),
  run: vi.fn(),
  select: vi.fn(),
  clear: vi.fn(),
  set: vi.fn(),
  error: vi.fn(),
  status: { text: "", command: "", show: vi.fn(), hide: vi.fn(), dispose: vi.fn() },
}));

vi.mock("../../src/extension-context.js", () => ({ tspLanguageClient: { runAiLint: mocks.run } }));
vi.mock("../../src/lm/ai-lint-model.js", () => ({
  selectAiLintModel: mocks.select,
  clearAiLintModel: vi.fn(),
}));
vi.mock("../../src/log/logger.js", () => ({ default: { error: mocks.error } }));
vi.mock("vscode", () => {
  const disposable = () => ({ dispose() {} });
  const event = (name: string) => (callback: (value?: unknown) => unknown) => {
    mocks.events.set(name, callback);
    return disposable();
  };
  const uri = { path: "/project/main.tsp", toString: () => "file:///project/main.tsp" };
  const document = { uri, languageId: "typespec" };
  return {
    CancellationTokenSource: class {
      token = { isCancellationRequested: false };
      cancel() {
        this.token.isCancellationRequested = true;
      }
      dispose() {}
    },
    Diagnostic: class {
      constructor(
        public range: unknown,
        public message: string,
      ) {}
    },
    Range: class {},
    DiagnosticSeverity: { Warning: 1 },
    Uri: {
      file: (path: string) => ({ toString: () => `file://${path}` }),
      parse: (value: string) => value,
    },
    languages: {
      createDiagnosticCollection: () => ({ clear: mocks.clear, set: mocks.set, dispose() {} }),
    },
    window: { activeTextEditor: { document }, createStatusBarItem: () => mocks.status },
    commands: {
      registerCommand: (name: string, callback: () => unknown) => {
        mocks.commands.set(name, callback);
        return disposable();
      },
      executeCommand: (name: string) => mocks.commands.get(name)?.(),
    },
    workspace: {
      isTrusted: true,
      textDocuments: [document],
      onDidSaveTextDocument: event("save"),
      onDidChangeTextDocument: event("edit"),
      onDidCloseTextDocument: event("close"),
      onDidChangeWorkspaceFolders: event("workspace"),
      onDidChangeConfiguration: event("configuration"),
      createFileSystemWatcher: () => ({
        onDidChange: event("file"),
        onDidCreate: event("create"),
        onDidDelete: event("delete"),
        dispose() {},
      }),
    },
  };
});

const document = {
  uri: { path: "/project/main.tsp", toString: () => "file:///project/main.tsp" },
  languageId: "typespec",
};
const report = {
  status: "completed",
  projectRoot: "/project",
  findings: [
    {
      ruleId: "test/rule",
      message: "Use duration.",
      location: { path: "main.tsp", line: 1, column: 1, endLine: 1, endColumn: 8 },
    },
  ],
  errors: [],
  abstained: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.commands.clear();
  mocks.events.clear();
  mocks.select.mockResolvedValue(true);
  mocks.run.mockResolvedValue(report);
  registerAiLint({ subscriptions: [] });
});

it("runs only after opt-in and keeps ordinary compiler diagnostics separate", async () => {
  mocks.events.get("save")?.(document);
  expect(mocks.run).not.toHaveBeenCalled();
  await mocks.commands.get("typespec.aiLint.enable")?.();
  expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.set).toHaveBeenCalledTimes(1);
  mocks.events.get("save")?.(document);
  expect(mocks.run).toHaveBeenCalledTimes(1);
});

it("does not invalidate a run for the matching open-file save watcher event", async () => {
  await mocks.commands.get("typespec.aiLint.enable")?.();
  mocks.clear.mockClear();
  mocks.events.get("file")?.(document.uri);
  expect(mocks.clear).not.toHaveBeenCalled();
});

it("drops late results and does not turn cancellation into a provider error", async () => {
  let resolve!: (value: unknown) => void;
  mocks.run.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const run = mocks.commands.get("typespec.aiLint.enable")?.();
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
  mocks.events.get("edit")?.({ document });
  resolve(report);
  await run;
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.error).not.toHaveBeenCalled();
});
