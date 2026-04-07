/**
 * Web Worker entry point for the TypeSpec playground.
 *
 * Uses Monaco's built-in worker infrastructure (`initialize` from
 * `monaco-editor/esm/vs/editor/editor.worker`).  Monaco automatically:
 *   - syncs editor models to the worker (accessible via `ctx.getMirrorModels()`)
 *   - proxies all method calls on the returned object through postMessage
 *   - handles request/response matching and serialization
 *
 * The main thread creates this worker with `monaco.editor.createWebWorker<TypeSpecWorkerApi>(…)`.
 */

import type { Diagnostic, ServerHost } from "@typespec/compiler";
import { type IWorkerContext, initialize } from "monaco-editor/esm/vs/editor/editor.worker.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { createBrowserHost, resolveVirtualPath } from "../browser-host.js";
import type { BrowserHost } from "../types.js";
import type {
  CompileParams,
  CompileResponse,
  ResolvedCodeFixEdits,
  SerializedCodeFixRef,
  SerializedCompileResult,
  SerializedDiagnostic,
  SerializedSourceLocation,
  TypeSpecWorkerApi,
  WorkerInitParams,
  WorkerInitResult,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Worker service — the proxy target for Monaco's createWebWorker
// ---------------------------------------------------------------------------

/**
 * Implements {@link TypeSpecWorkerApi}.  An instance of this class is returned
 * from the Monaco `initialize()` factory and all its public methods become
 * available to the main thread via the `MonacoWebWorker<T>` proxy.
 */
class TypeSpecWorkerService implements TypeSpecWorkerApi {
  #ctx: IWorkerContext;
  #host: BrowserHost | undefined;
  #server: import("@typespec/compiler").Server | undefined;

  /** Documents known to the language server, keyed by URI string. */
  #documents = new Map<string, TextDocument>();
  /** Last-seen version per URI, used to detect changes in mirror models. */
  #documentVersions = new Map<string, number>();

  /** Code-fixes from the most recent compilation (kept in worker memory). */
  #lastCodefixes: Array<{ fix: any; compiler: typeof import("@typespec/compiler") }> = [];

  constructor(ctx: IWorkerContext) {
    this.#ctx = ctx;
  }

  // -- Lifecycle -----------------------------------------------------------

  async initialize(params: WorkerInitParams): Promise<WorkerInitResult> {
    this.#host = await createBrowserHost(params.libraries, params.importConfig);

    const serverHost: ServerHost = {
      compilerHost: this.#host,
      getOpenDocumentByURL: (url: string) => this.#documents.get(url),
      sendDiagnostics() {},
      log(log) {
        // eslint-disable-next-line no-console
        if (log.level === "error") console.error(log);
        // eslint-disable-next-line no-console
        else if (log.level === "warning") console.warn(log);
      },
      applyEdit() {
        return Promise.resolve({ applied: false });
      },
    };

    const { createServer } = this.#host.compiler;
    this.#server = createServer(serverHost);

    const lsConfig = await this.#server.initialize({
      capabilities: {},
      processId: 1,
      workspaceFolders: [],
      rootUri: "inmemory://",
    });
    this.#server.initialized({});

    return {
      completionTriggerCharacters:
        lsConfig.capabilities.completionProvider?.triggerCharacters ?? [],
      completionCommitCharacters:
        lsConfig.capabilities.completionProvider?.allCommitCharacters ?? [],
    };
  }

  // -- Compilation ---------------------------------------------------------

  async compile(params: CompileParams): Promise<CompileResponse> {
    if (!this.#host) throw new Error("Worker not initialized");
    this.#lastCodefixes = [];

    const { content, emitter, options } = params;
    await this.#host.writeFile("main.tsp", content);
    await this.#emptyOutputDir();

    try {
      const typespecCompiler = this.#host.compiler;
      const outputDir = resolveVirtualPath("tsp-output");
      const program = await typespecCompiler.compile(this.#host, resolveVirtualPath("main.tsp"), {
        ...options,
        options: {
          ...options.options,
          [emitter]: {
            ...options.options?.[emitter],
            "emitter-output-dir": outputDir,
          },
        },
        outputDir,
        emit: emitter ? [emitter] : [],
      });

      const diagnostics = program.diagnostics.map((d) =>
        this.#serializeDiagnostic(typespecCompiler, d),
      );
      const outputFiles = await this.#readOutputFiles();
      return { diagnostics, outputFiles } satisfies SerializedCompileResult;
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error("Internal compiler error", error);
      return { internalCompilerError: error?.message ?? String(error) };
    }
  }

  async resolveCodeFix(codefixIndex: number): Promise<ResolvedCodeFixEdits> {
    const entry = this.#lastCodefixes[codefixIndex];
    if (!entry) throw new Error(`No codefix at index ${codefixIndex}`);

    const edits = await entry.compiler.resolveCodeFix(entry.fix);
    return {
      edits: edits.map((edit) => {
        const start = edit.file.getLineAndCharacterOfPosition(edit.pos);
        if (edit.kind === "insert-text") {
          return {
            range: {
              start: { line: start.line, character: start.character },
              end: { line: start.line, character: start.character },
            },
            newText: edit.text,
            file: edit.file.path,
          };
        } else {
          const end = edit.file.getLineAndCharacterOfPosition(edit.end);
          return {
            range: {
              start: { line: start.line, character: start.character },
              end: { line: end.line, character: end.character },
            },
            newText: edit.text,
            file: edit.file.path,
          };
        }
      }),
    };
  }

  // -- LSP methods ---------------------------------------------------------

  async doComplete(params: any) {
    this.#syncDocuments();
    return this.#server!.complete(params);
  }

  async doHover(params: any) {
    this.#syncDocuments();
    return this.#server!.getHover(params);
  }

  async doDefinition(params: any) {
    this.#syncDocuments();
    return this.#server!.gotoDefinition(params);
  }

  async doReferences(params: any) {
    this.#syncDocuments();
    return this.#server!.findReferences(params);
  }

  async doPrepareRename(params: any) {
    this.#syncDocuments();
    return this.#server!.prepareRename(params);
  }

  async doRename(params: any) {
    this.#syncDocuments();
    return this.#server!.rename(params);
  }

  async doFormat(params: any) {
    this.#syncDocuments();
    return this.#server!.formatDocument(params);
  }

  async doFoldingRanges(params: any) {
    this.#syncDocuments();
    return this.#server!.getFoldingRanges(params);
  }

  async doDocumentHighlight(params: any) {
    this.#syncDocuments();
    return this.#server!.findDocumentHighlight(params);
  }

  async doSignatureHelp(params: any) {
    this.#syncDocuments();
    return this.#server!.getSignatureHelp(params);
  }

  async doSemanticTokens(params: any) {
    this.#syncDocuments();
    return this.#server!.buildSemanticTokens(params);
  }

  // -- Private helpers -----------------------------------------------------

  /**
   * Sync Monaco mirror models → language server.
   *
   * Monaco automatically mirrors editor models to the worker. Before each LSP
   * call we check for new or changed models and notify the language server.
   */
  #syncDocuments(): void {
    for (const model of this.#ctx.getMirrorModels()) {
      const uri = model.uri.toString();
      const version = model.version;
      const lastVersion = this.#documentVersions.get(uri);

      if (lastVersion !== version) {
        const doc = TextDocument.create(uri, "typespec", version, model.getValue());
        this.#documents.set(uri, doc);
        this.#documentVersions.set(uri, version);

        if (this.#server) {
          if (lastVersion === undefined) {
            this.#server.documentOpened({ document: doc });
          } else {
            this.#server.checkChange({ document: doc });
          }
        }
      }
    }
  }

  #serializeDiagnostic(
    compiler: typeof import("@typespec/compiler"),
    diag: Diagnostic,
  ): SerializedDiagnostic {
    let location: SerializedSourceLocation | undefined;
    const loc = compiler.getSourceLocation(diag.target, { locateId: true });
    if (loc) {
      const start = loc.file.getLineAndCharacterOfPosition(loc.pos);
      const end = loc.file.getLineAndCharacterOfPosition(loc.end);
      location = {
        file: loc.file.path,
        startLine: start.line,
        startCharacter: start.character,
        endLine: end.line,
        endCharacter: end.character,
      };
    }

    let codefixes: SerializedCodeFixRef[] | undefined;
    if (diag.codefixes?.length) {
      codefixes = diag.codefixes.map((fix) => {
        const cfIndex = this.#lastCodefixes.length;
        this.#lastCodefixes.push({ fix, compiler });
        return { index: cfIndex, label: fix.label };
      });
    }

    return {
      severity: diag.severity,
      code: typeof diag.code === "string" ? diag.code : undefined,
      message: diag.message,
      location,
      codefixes,
    };
  }

  async #emptyOutputDir(): Promise<void> {
    if (!this.#host) return;
    try {
      const dirs = await this.#host.readDir("./tsp-output");
      for (const file of dirs) {
        await this.#host.rm("./tsp-output/" + file, { recursive: true });
      }
    } catch {
      // Directory may not exist yet
    }
  }

  async #readOutputFiles(): Promise<Record<string, string>> {
    if (!this.#host) return {};
    const outputDir = resolveVirtualPath("tsp-output");
    const files: Record<string, string> = {};

    const addFiles = async (dir: string) => {
      const items = await this.#host!.readDir(outputDir + dir);
      for (const item of items) {
        const itemPath = `${dir}/${item}`;
        if ((await this.#host!.stat(outputDir + itemPath)).isDirectory()) {
          await addFiles(itemPath);
        } else {
          const relativePath = dir === "" ? item : `${dir}/${item}`;
          const sf = await this.#host!.readFile(outputDir + itemPath);
          files[relativePath] = sf.text;
        }
      }
    };

    try {
      await addFiles("");
    } catch {
      // Output dir may not exist
    }
    return files;
  }
}

// ---------------------------------------------------------------------------
// Monaco worker bootstrap
// ---------------------------------------------------------------------------

initialize((ctx: IWorkerContext) => {
  return new TypeSpecWorkerService(ctx);
});
