import type { Diagnostic } from "@typespec/compiler";
import type { FunctionComponent, MouseEventHandler } from "react";
import type { SerializedDiagnostic } from "../../workers/types.js";
import { DiagnosticList, SerializedDiagnosticList } from "../diagnostic-list/diagnostic-list.js";
import { hasProgram, isCrashed, isWorkerResult, type CompilationState } from "../types.js";
import { ProblemPaneHeader } from "./header.js";
import style from "./problem-pane.module.css";

export interface ProblemPaneProps {
  readonly collapsed: boolean;
  readonly compilationState: CompilationState | undefined;
  readonly onHeaderClick?: MouseEventHandler<HTMLDivElement>;
  readonly onDiagnosticSelected?: (diagnostic: Diagnostic) => void;
  readonly onSerializedDiagnosticSelected?: (diagnostic: SerializedDiagnostic) => void;
}
export const ProblemPane: FunctionComponent<ProblemPaneProps> = ({
  collapsed,
  compilationState,
  onHeaderClick,
  onDiagnosticSelected,
  onSerializedDiagnosticSelected,
}) => {
  return (
    <div className={style["problem-pane"]}>
      <ProblemPaneHeader
        compilationState={compilationState}
        onClick={onHeaderClick}
        collaped={collapsed}
      />
      <div className={style["problem-content"]} aria-hidden={collapsed}>
        <ProblemPaneContent
          compilationState={compilationState}
          onDiagnosticSelected={onDiagnosticSelected}
          onSerializedDiagnosticSelected={onSerializedDiagnosticSelected}
        />
      </div>
    </div>
  );
};

interface ProblemPaneContentProps {
  readonly compilationState: CompilationState | undefined;
  readonly onDiagnosticSelected?: (diagnostic: Diagnostic) => void;
  readonly onSerializedDiagnosticSelected?: (diagnostic: SerializedDiagnostic) => void;
}
const ProblemPaneContent: FunctionComponent<ProblemPaneContentProps> = ({
  compilationState,
  onDiagnosticSelected,
  onSerializedDiagnosticSelected,
}) => {
  if (compilationState === undefined) {
    return <></>;
  }
  if (isCrashed(compilationState)) {
    return (
      <pre className={style["internal-compiler-error"]}>
        {String(compilationState.internalCompilerError)}
      </pre>
    );
  }

  if (hasProgram(compilationState)) {
    const diagnostics = compilationState.program.diagnostics;
    return diagnostics.length === 0 ? (
      <div className={style["no-problems"]}> No problems</div>
    ) : (
      <DiagnosticList diagnostics={diagnostics} onDiagnosticSelected={onDiagnosticSelected} />
    );
  }

  if (isWorkerResult(compilationState)) {
    return compilationState.diagnostics.length === 0 ? (
      <div className={style["no-problems"]}> No problems</div>
    ) : (
      <SerializedDiagnosticList
        diagnostics={compilationState.diagnostics}
        onDiagnosticSelected={onSerializedDiagnosticSelected}
      />
    );
  }

  return <></>;
};
