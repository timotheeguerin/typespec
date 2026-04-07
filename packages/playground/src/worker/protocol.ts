import type { CompilerOptions } from "@typespec/compiler";
import type {
  CompletionList,
  CompletionParams,
  DefinitionParams,
  DocumentFormattingParams,
  DocumentHighlight,
  DocumentHighlightParams,
  FoldingRange,
  FoldingRangeParams,
  Hover,
  HoverParams,
  Location,
  PrepareRenameParams,
  Range,
  ReferenceParams,
  RenameParams,
  SemanticTokens,
  SemanticTokensParams,
  SignatureHelp,
  SignatureHelpParams,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import type { LibraryImportOptions } from "../core.js";

// ---------------------------------------------------------------------------
// Serialized types – safe to cross the worker boundary via postMessage
// ---------------------------------------------------------------------------

/** Source location serialized as plain numbers (no AST node references). */
export interface SerializedSourceLocation {
  file: string;
  /** 0-based line */
  startLine: number;
  /** 0-based character offset */
  startCharacter: number;
  /** 0-based line */
  endLine: number;
  /** 0-based character offset */
  endCharacter: number;
}

/** A reference to a code-fix that lives in the worker. The main thread can
 *  request resolution by sending the `index` back. */
export interface SerializedCodeFixRef {
  index: number;
  label: string;
}

/** Diagnostic stripped of all non-serializable compiler internals. */
export interface SerializedDiagnostic {
  severity: "error" | "warning";
  code?: string;
  message: string;
  location?: SerializedSourceLocation;
  codefixes?: SerializedCodeFixRef[];
}

/** Result of a successful compilation. */
export interface SerializedCompileResult {
  readonly diagnostics: SerializedDiagnostic[];
  /** Map from relative output path to file content. */
  readonly outputFiles: Record<string, string>;
}

/** Union returned from a compile request. */
export type CompileResponse = SerializedCompileResult | { internalCompilerError: string };

// ---------------------------------------------------------------------------
// Worker API — interface of the object proxied by Monaco's createWebWorker
// ---------------------------------------------------------------------------

/** Initialization parameters passed to the worker. */
export interface WorkerInitParams {
  libraries: readonly string[];
  importConfig?: LibraryImportOptions;
}

/** Capabilities returned after initialization. */
export interface WorkerInitResult {
  completionTriggerCharacters?: string[];
  completionCommitCharacters?: string[];
}

/** Compile request parameters. */
export interface CompileParams {
  content: string;
  emitter: string;
  options: CompilerOptions;
}

/** Resolved code-fix edits. */
export interface ResolvedCodeFixEdits {
  edits: Array<{ range: Range; newText: string; file: string }>;
}

/**
 * The public API surface exposed by the TypeSpec worker.
 *
 * Monaco's `createWebWorker<T>` transparently proxies all method calls on this
 * interface through postMessage, handling serialization and request/response
 * matching automatically.
 *
 * All parameters and return values **must** be structured-cloneable.
 */
export interface TypeSpecWorkerApi {
  // -- Lifecycle ----------------------------------------------------------
  initialize(params: WorkerInitParams): Promise<WorkerInitResult>;

  // -- Compilation --------------------------------------------------------
  compile(params: CompileParams): Promise<CompileResponse>;
  resolveCodeFix(codefixIndex: number): Promise<ResolvedCodeFixEdits>;

  // -- LSP methods --------------------------------------------------------
  doComplete(params: CompletionParams): Promise<CompletionList>;
  doHover(params: HoverParams): Promise<Hover>;
  doDefinition(params: DefinitionParams): Promise<Location[]>;
  doReferences(params: ReferenceParams): Promise<Location[]>;
  doPrepareRename(params: PrepareRenameParams): Promise<Range | undefined>;
  doRename(params: RenameParams): Promise<WorkspaceEdit>;
  doFormat(params: DocumentFormattingParams): Promise<TextEdit[]>;
  doFoldingRanges(params: FoldingRangeParams): Promise<FoldingRange[]>;
  doDocumentHighlight(params: DocumentHighlightParams): Promise<DocumentHighlight[]>;
  doSignatureHelp(params: SignatureHelpParams): Promise<SignatureHelp | undefined>;
  doSemanticTokens(params: SemanticTokensParams): Promise<SemanticTokens>;
}
