import type { AiLintReport } from "@typespec/compiler/experimental";
import { resolve } from "node:path";
import {
  CancellationTokenSource,
  commands,
  Diagnostic,
  DiagnosticSeverity,
  languages,
  Range,
  Uri,
  window,
  workspace,
  type ExtensionContext,
  type TextDocument,
} from "vscode";
import { tspLanguageClient } from "./extension-context.js";
import { clearAiLintModel, selectAiLintModel } from "./lm/ai-lint-model.js";
import logger from "./log/logger.js";

export function registerAiLint(context: Pick<ExtensionContext, "subscriptions">): void {
  const diagnostics = languages.createDiagnosticCollection("TypeSpec AI");
  const status = window.createStatusBarItem();
  status.command = "typespec.aiLint.run";
  let enabled = false;
  let generation = 0;
  let active: CancellationTokenSource | undefined;
  let activeKey: string | undefined;
  let lastRun: string | undefined;

  function invalidate() {
    generation++;
    active?.cancel();
    diagnostics.clear();
    lastRun = undefined;
    if (enabled) status.text = "TypeSpec AI: pending save";
  }

  async function run(document: TextDocument | undefined) {
    if (!enabled || !document || document.languageId !== "typespec") return;
    const client = tspLanguageClient;
    if (!client) throw new Error("TypeSpec language server is not running.");
    const key = `${document.uri}:${generation}`;
    if (lastRun === key || activeKey === key) return;
    active?.cancel();
    const cancellation = new CancellationTokenSource();
    active = cancellation;
    activeKey = key;
    const version = generation;
    status.text = "TypeSpec AI: running";
    try {
      const report: AiLintReport = await client.runAiLint(
        document.uri.toString(),
        cancellation.token,
      );
      if (cancellation.token.isCancellationRequested || version !== generation) return;
      diagnostics.clear();
      const grouped = new Map<string, Diagnostic[]>();
      for (const finding of report.findings) {
        const location = finding.location;
        const uri = Uri.file(resolve(report.projectRoot, location.path)).toString();
        const diagnostic = new Diagnostic(
          new Range(
            location.line - 1,
            location.column - 1,
            location.endLine - 1,
            location.endColumn - 1,
          ),
          finding.message,
          DiagnosticSeverity.Warning,
        );
        diagnostic.code = finding.ruleId;
        diagnostic.source = "TypeSpec AI";
        const entries = grouped.get(uri) ?? [];
        entries.push(diagnostic);
        grouped.set(uri, entries);
      }
      for (const [uri, entries] of grouped) diagnostics.set(Uri.parse(uri), entries);
      status.text = `TypeSpec AI: ${report.status} (${report.findings.length} findings, ${report.abstained} abstentions)`;
      if (report.status === "completed") lastRun = key;
      if (report.errors.length) {
        logger.error("TypeSpec AI lint did not complete.", report.errors, { showPopup: true });
      }
    } catch (error) {
      if (cancellation.token.isCancellationRequested || version !== generation) return;
      throw error;
    } finally {
      cancellation.dispose();
      if (active === cancellation) {
        active = undefined;
        activeKey = undefined;
      }
    }
  }

  async function runAndReport(document: TextDocument | undefined) {
    try {
      await run(document);
    } catch (error) {
      status.text = "TypeSpec AI: unavailable";
      logger.error("TypeSpec AI lint could not complete.", [error], { showPopup: true });
    }
  }

  context.subscriptions.push(
    diagnostics,
    status,
    {
      dispose: () => {
        active?.cancel();
        active?.dispose();
        clearAiLintModel();
      },
    },
    commands.registerCommand("typespec.aiLint.enable", async () => {
      try {
        if (!workspace.isTrusted) throw new Error("AI lint requires a trusted workspace.");
        if (!(await selectAiLintModel())) return;
        invalidate();
        enabled = true;
        status.text = "TypeSpec AI: enabled";
        status.show();
        await runAndReport(window.activeTextEditor?.document);
      } catch (error) {
        logger.error("Unable to enable TypeSpec AI lint.", [error], { showPopup: true });
      }
    }),
    commands.registerCommand("typespec.aiLint.disable", () => {
      enabled = false;
      invalidate();
      clearAiLintModel();
      status.hide();
    }),
    commands.registerCommand("typespec.aiLint.run", async () => {
      if (!enabled) {
        await commands.executeCommand("typespec.aiLint.enable");
      } else {
        lastRun = undefined;
        activeKey = undefined;
        await runAndReport(window.activeTextEditor?.document);
      }
    }),
    workspace.onDidSaveTextDocument((document) => {
      void runAndReport(document);
    }),
    workspace.onDidChangeTextDocument((event) => {
      if (
        event.document.languageId === "typespec" ||
        event.document.uri.path.endsWith("tspconfig.yaml")
      )
        invalidate();
    }),
    workspace.onDidCloseTextDocument(invalidate),
    workspace.onDidChangeWorkspaceFolders(invalidate),
    workspace.onDidChangeConfiguration(invalidate),
  );
  const watcher = workspace.createFileSystemWatcher("**/*.{tsp,yaml,json,js,mjs,cjs,md}");
  const changed = (uri: Uri) => {
    // Open TypeSpec buffers already invalidate on edits; a save notification must not cancel its own run.
    if (
      !workspace.textDocuments.some(
        (document) =>
          document.languageId === "typespec" && document.uri.toString() === uri.toString(),
      )
    )
      invalidate();
  };
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(changed),
    watcher.onDidCreate(changed),
    watcher.onDidDelete(invalidate),
  );
}
