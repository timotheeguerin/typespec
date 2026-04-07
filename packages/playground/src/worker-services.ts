/**
 * Registers Monaco language providers for TypeSpec that delegate to a web worker.
 *
 * This is the worker-based equivalent of `registerMonacoLanguage()` in `services.ts`.
 * All LSP operations are proxied to the worker via Monaco's `createWebWorker` infrastructure.
 */
import { TypeSpecLanguageConfiguration } from "@typespec/compiler";
import * as monaco from "monaco-editor";
import { DocumentHighlightKind, type WorkspaceEdit } from "vscode-languageserver";
import { LspToMonaco } from "./lsp/lsp-to-monaco.js";
import type {
  SerializedCodeFixRef,
  SerializedDiagnostic,
  TypeSpecWorkerApi,
  WorkerInitResult,
} from "./worker/protocol.js";

/** Diagnostics from the last worker compilation, for the code action provider. */
let _workerDiagnostics: readonly SerializedDiagnostic[] = [];
let _workerProxy: TypeSpecWorkerApi | undefined;

/**
 * Update the diagnostics used by the worker-mode code action provider.
 * Call this after each compilation.
 */
export function updateWorkerDiagnostics(
  proxy: TypeSpecWorkerApi,
  diagnostics: readonly SerializedDiagnostic[],
) {
  _workerDiagnostics = diagnostics;
  _workerProxy = proxy;
}

function getIndentAction(
  value: "none" | "indent" | "indentOutdent" | "outdent",
): monaco.languages.IndentAction {
  switch (value) {
    case "none":
      return monaco.languages.IndentAction.None;
    case "indent":
      return monaco.languages.IndentAction.Indent;
    case "indentOutdent":
      return monaco.languages.IndentAction.IndentOutdent;
    case "outdent":
      return monaco.languages.IndentAction.Outdent;
  }
}

function getTypeSpecLanguageConfiguration(): monaco.languages.LanguageConfiguration {
  return {
    ...(TypeSpecLanguageConfiguration as any),
    onEnterRules: TypeSpecLanguageConfiguration.onEnterRules.map((rule) => {
      return {
        beforeText: new RegExp(rule.beforeText.pattern),
        previousLineText:
          "previousLineText" in rule ? new RegExp(rule.previousLineText.pattern) : undefined,
        action: {
          indentAction: getIndentAction(rule.action.indent),
          appendText: "appendText" in rule.action ? rule.action.appendText : undefined,
          removeText: "removeText" in rule.action ? rule.action.removeText : undefined,
        },
      };
    }),
  };
}

function lspPosition(pos: monaco.Position) {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

function lspDocumentArgs(model: monaco.editor.ITextModel) {
  return {
    textDocument: { uri: model.uri.toString() },
  };
}

function lspArgs(model: monaco.editor.ITextModel, pos: monaco.Position) {
  return { ...lspDocumentArgs(model), position: lspPosition(pos) };
}

function monacoLocation(loc: { uri: string; range: any }): monaco.languages.Location {
  return {
    uri: monaco.Uri.parse(loc.uri),
    range: LspToMonaco.range(loc.range),
  };
}

function monacoDocumentHighlightKind(kind: number | undefined) {
  switch (kind) {
    case DocumentHighlightKind.Text:
      return monaco.languages.DocumentHighlightKind.Text;
    case DocumentHighlightKind.Read:
      return monaco.languages.DocumentHighlightKind.Read;
    case DocumentHighlightKind.Write:
      return monaco.languages.DocumentHighlightKind.Write;
    default:
      return undefined;
  }
}

function monacoWorkspaceEdit(edit: WorkspaceEdit): monaco.languages.WorkspaceEdit {
  const edits: monaco.languages.IWorkspaceTextEdit[] = [];
  for (const [uri, changes] of Object.entries(edit.changes ?? {})) {
    const resource = monaco.Uri.parse(uri);
    for (const change of changes) {
      edits.push({ resource, textEdit: LspToMonaco.textEdit(change), versionId: undefined });
    }
  }
  return { edits };
}

/**
 * Resolve a {@link SerializedCodeFixRef} into Monaco workspace edits by calling the worker.
 */
async function resolveWorkerCodeFix(
  proxy: TypeSpecWorkerApi,
  fixRef: SerializedCodeFixRef,
  model: monaco.editor.ITextModel,
): Promise<monaco.languages.IWorkspaceTextEdit[]> {
  const resolved = await proxy.resolveCodeFix(fixRef.index);
  return resolved.edits
    .filter((edit) => edit.file === "/test/main.tsp")
    .map((edit) => ({
      resource: model.uri,
      textEdit: {
        range: {
          startLineNumber: edit.range.start.line + 1,
          startColumn: edit.range.start.character + 1,
          endLineNumber: edit.range.end.line + 1,
          endColumn: edit.range.end.character + 1,
        },
        text: edit.newText,
      },
      versionId: undefined,
    }));
}

/**
 * Convert a serialized diagnostic location to a Monaco range.
 */
function serializedLocationToRange(loc: SerializedDiagnostic["location"]): monaco.IRange {
  if (!loc) {
    return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
  }
  return {
    startLineNumber: loc.startLine + 1,
    startColumn: loc.startCharacter + 1,
    endLineNumber: loc.endLine + 1,
    endColumn: loc.endCharacter + 1,
  };
}

function rangesOverlap(a: monaco.IRange, b: monaco.IRange): boolean {
  if (a.endLineNumber < b.startLineNumber || b.endLineNumber < a.startLineNumber) return false;
  if (a.endLineNumber === b.startLineNumber && a.endColumn < b.startColumn) return false;
  if (b.endLineNumber === a.startLineNumber && b.endColumn < a.startColumn) return false;
  return true;
}

/**
 * Register Monaco language providers for TypeSpec, delegating all LSP operations
 * to the given worker proxy.
 *
 * Call this once after the worker has been initialized.
 */
export function registerMonacoLanguageWorker(
  proxy: TypeSpecWorkerApi,
  initResult: WorkerInitResult,
) {
  monaco.languages.register({ id: "typespec", extensions: [".tsp"] });
  monaco.languages.setLanguageConfiguration("typespec", getTypeSpecLanguageConfiguration());

  // Avoid double-registration
  if ((window as any).registeredServices) return;
  (window as any).registeredServices = true;

  // -- Completion --
  monaco.languages.registerCompletionItemProvider("typespec", {
    triggerCharacters: initResult.completionTriggerCharacters,
    async provideCompletionItems(model, position) {
      const result = await proxy.doComplete(lspArgs(model, position) as any);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];
      for (const item of result.items) {
        let itemRange: monaco.IRange = range;
        let insertText = item.insertText ?? item.label;
        if (item.textEdit && "range" in item.textEdit) {
          itemRange = LspToMonaco.range(item.textEdit.range);
          insertText = item.textEdit.newText;
        }
        suggestions.push({
          label: item.label,
          kind: item.kind as any,
          documentation: item.documentation,
          insertText,
          range: itemRange,
          commitCharacters: item.commitCharacters ?? initResult.completionCommitCharacters,
          tags: item.tags,
        });
      }
      return { suggestions };
    },
  });

  // -- Hover --
  monaco.languages.registerHoverProvider("typespec", {
    async provideHover(model, position) {
      const hover = await proxy.doHover(lspArgs(model, position) as any);
      if (!hover) return null;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (Array.isArray(hover.contents) || typeof hover.contents === "string") {
        throw new Error("MarkedString (deprecated) not supported.");
      }
      return {
        contents: [{ value: (hover.contents as any).value }],
        range: hover.range ? LspToMonaco.range(hover.range) : undefined,
      };
    },
  });

  // -- Definition --
  monaco.languages.registerDefinitionProvider("typespec", {
    async provideDefinition(model, position) {
      const results = await proxy.doDefinition(lspArgs(model, position) as any);
      return results.map(monacoLocation);
    },
  });

  // -- References --
  monaco.languages.registerReferenceProvider("typespec", {
    async provideReferences(model, position, context) {
      const results = await proxy.doReferences({
        ...(lspArgs(model, position) as any),
        context,
      });
      return results.map(monacoLocation);
    },
  });

  // -- Rename --
  monaco.languages.registerRenameProvider("typespec", {
    async resolveRenameLocation(model, position): Promise<monaco.languages.RenameLocation> {
      const result = await proxy.doPrepareRename(lspArgs(model, position) as any);
      if (!result) throw new Error("This element can't be renamed.");
      const text = model.getWordAtPosition(position)?.word;
      if (!text) throw new Error("Failed to obtain word at position.");
      return { text, range: LspToMonaco.range(result) };
    },
    async provideRenameEdits(model, position, newName) {
      const result = await proxy.doRename({ ...(lspArgs(model, position) as any), newName });
      return monacoWorkspaceEdit(result);
    },
  });

  // -- Folding --
  monaco.languages.registerFoldingRangeProvider("typespec", {
    async provideFoldingRanges(model) {
      const ranges = await proxy.doFoldingRanges(lspDocumentArgs(model) as any);
      return ranges.map(LspToMonaco.foldingRange);
    },
  });

  // -- Formatting --
  monaco.languages.registerDocumentFormattingEditProvider("typespec", {
    async provideDocumentFormattingEdits(model, options) {
      const edits = await proxy.doFormat({
        ...(lspDocumentArgs(model) as any),
        options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
      });
      return LspToMonaco.textEdits(edits);
    },
  });

  // -- Document Highlights --
  monaco.languages.registerDocumentHighlightProvider("typespec", {
    async provideDocumentHighlights(model, position) {
      const highlights = await proxy.doDocumentHighlight(lspArgs(model, position) as any);
      return highlights.map((h: any) => ({
        range: LspToMonaco.range(h.range),
        kind: monacoDocumentHighlightKind(h.kind),
      }));
    },
  });

  // -- Signature Help --
  monaco.languages.registerSignatureHelpProvider("typespec", {
    signatureHelpTriggerCharacters: ["(", ",", "<"],
    signatureHelpRetriggerCharacters: [")"],
    async provideSignatureHelp(model, position) {
      const help = await proxy.doSignatureHelp(lspArgs(model, position) as any);
      return { value: LspToMonaco.signatureHelp(help), dispose: () => {} };
    },
  });

  // -- Semantic Tokens --
  monaco.languages.registerDocumentSemanticTokensProvider("typespec", {
    getLegend() {
      // Use a standard legend; the worker returns raw token data.
      return {
        tokenModifiers: [],
        tokenTypes: [
          "comment",
          "keyword",
          "string",
          "number",
          "regexp",
          "operator",
          "type",
          "variable",
          "function",
          "macro",
          "parameter",
          "property",
          "label",
          "plainKeyword",
          "docCommentTag",
        ],
      };
    },
    async provideDocumentSemanticTokens(model) {
      const result = await proxy.doSemanticTokens(lspDocumentArgs(model) as any);
      return {
        resultId: result.resultId,
        data: new Uint32Array(result.data),
      };
    },
    releaseDocumentSemanticTokens() {},
  });

  // -- Code Actions (codefixes from compilation diagnostics) --
  monaco.languages.registerCodeActionProvider("typespec", {
    async provideCodeActions(model, range) {
      if (!_workerProxy) return { actions: [], dispose: () => {} };
      const actions: monaco.languages.CodeAction[] = [];

      for (const diag of _workerDiagnostics) {
        if (!diag.codefixes?.length) continue;
        if (!diag.location || diag.location.file !== "/test/main.tsp") continue;
        const diagRange = serializedLocationToRange(diag.location);
        if (!rangesOverlap(diagRange, range)) continue;

        for (const fixRef of diag.codefixes) {
          const edits = await resolveWorkerCodeFix(_workerProxy, fixRef, model);
          if (edits.length > 0) {
            actions.push({
              title: fixRef.label,
              kind: "quickfix",
              edit: { edits },
            });
          }
        }
      }
      return { actions, dispose: () => {} };
    },
  });

  // -- Themes --
  monaco.editor.defineTheme("typespec", {
    base: "vs",
    inherit: true,
    colors: {},
    rules: [
      { token: "macro", foreground: "#800000" },
      { token: "function", foreground: "#795E26" },
    ],
  });
  monaco.editor.defineTheme("typespec-dark", {
    base: "vs-dark",
    inherit: true,
    colors: {},
    rules: [
      { token: "macro", foreground: "#E06C75" },
      { token: "function", foreground: "#E06C75" },
    ],
  });
}
