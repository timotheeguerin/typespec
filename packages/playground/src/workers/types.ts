import type { CompilerOptions } from "@typespec/compiler";

// ── Worker message protocol ──

/** Messages sent from the main thread to the worker. */
export type WorkerMessage = WorkerInitMessage | WorkerCompileMessage;

export interface WorkerInitMessage {
  readonly type: "init";
  readonly id: number;
}

export interface WorkerCompileMessage {
  readonly type: "compile";
  readonly id: number;
  readonly content: string;
  readonly selectedEmitter: string;
  readonly options: CompilerOptions;
}

/** Messages sent from the worker back to the main thread. */
export type WorkerResponse = WorkerInitResponse | WorkerCompileResponse | WorkerErrorResponse;

export interface WorkerInitResponse {
  readonly type: "init-result";
  readonly id: number;
  readonly success: true;
  readonly libraries: Record<string, { name: string; isEmitter: boolean; packageJson: object }>;
}

export interface WorkerCompileResponse {
  readonly type: "compile-result";
  readonly id: number;
  readonly result: WorkerCompilationResult;
}

export interface WorkerErrorResponse {
  readonly type: "error";
  readonly id: number;
  readonly error: string;
}

// ── Serialized compilation result ──

export interface WorkerCompilationResult {
  readonly outputFiles: Record<string, string>;
  readonly diagnostics: readonly SerializedDiagnostic[];
}

export interface SerializedDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly target: SerializedSourceLocation | undefined;
  readonly codefixes: readonly SerializedCodefix[];
}

export interface SerializedSourceLocation {
  readonly file: string;
  readonly pos: number;
  readonly end: number;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface SerializedCodefix {
  readonly label: string;
  readonly edits: readonly SerializedTextEdit[];
}

export interface SerializedTextEdit {
  readonly file: string;
  readonly range: SerializedRange;
  readonly text: string;
}

export interface SerializedRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}
