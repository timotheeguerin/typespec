import type { Program } from "@typespec/compiler";
import type { ReactNode } from "react";
import type { SerializedDiagnostic } from "../worker/protocol.js";

export type CompilationCrashed = {
  readonly internalCompilerError: any;
};

export type CompileResult = {
  /**
   * The compiler Program object. Only available in main-thread compilation mode.
   * Not available in worker mode since Program cannot cross the worker boundary.
   */
  readonly program?: Program;

  /** Diagnostics from the compilation, serialized for display. */
  readonly diagnostics: readonly SerializedDiagnostic[];

  /** Map from relative output path to file content. */
  readonly outputFiles: Record<string, string>;
};
export type CompilationState = CompileResult | CompilationCrashed;

export type EmitterOptions = Record<string, Record<string, unknown>>;

export interface OutputViewerProps {
  /**
   * The compiler Program object. May be undefined in worker mode.
   */
  readonly program?: Program;
  /** Map from relative output path to file content. */
  readonly outputFiles: Record<string, string>;
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
