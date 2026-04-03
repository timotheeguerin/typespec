import type { Program } from "@typespec/compiler";
import type { ReactNode } from "react";
import type { SerializedDiagnostic } from "../workers/types.js";

export type CompilationCrashed = {
  readonly internalCompilerError: any;
};

/** Result from main-thread compilation (has live Program). */
export type CompileResult = {
  readonly program: Program;
  readonly outputFiles: string[];
};

/** Result from worker compilation (has serialized data). */
export type WorkerCompileResult = {
  readonly outputFiles: Record<string, string>;
  readonly diagnostics: readonly SerializedDiagnostic[];
};

export type CompilationState = CompileResult | WorkerCompileResult | CompilationCrashed;

/** Type guard: check if result has a live Program */
export function hasProgram(state: CompilationState): state is CompileResult {
  return "program" in state;
}

/** Type guard: check if result is from worker */
export function isWorkerResult(state: CompilationState): state is WorkerCompileResult {
  return "diagnostics" in state && !("program" in state);
}

/** Type guard: check if result is a crash */
export function isCrashed(state: CompilationState): state is CompilationCrashed {
  return "internalCompilerError" in state;
}

export type EmitterOptions = Record<string, Record<string, unknown>>;

export interface OutputViewerProps {
  readonly program: Program;
  /** Files emitted */
  readonly outputFiles: string[];
  /** Current viewer state (for viewers that have internal state) */
  readonly viewerState?: Record<string, any>;
  /** Callback to update viewer state */
  readonly onViewerStateChange?: (state: Record<string, any>) => void;
}

export interface ProgramViewer {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly render: (props: OutputViewerProps) => ReactNode | null;
}

export interface FileOutputViewer {
  readonly key: string;
  readonly label: string;
  readonly render: (props: FileOutputViewerProps) => ReactNode | null;
}

export interface FileOutputViewerProps {
  readonly filename: string;
  readonly content: string;
}
