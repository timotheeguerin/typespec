import { mergeClasses } from "@fluentui/react-components";
import { ChevronDown16Regular, ErrorCircle16Filled, Warning16Filled } from "@fluentui/react-icons";
import { memo, type MouseEventHandler, type ReactNode } from "react";
import { hasProgram, isCrashed, isWorkerResult, type CompilationState } from "../types.js";
import style from "./header.module.css";

export interface ProblemPaneHeaderProps {
  compilationState: CompilationState | undefined;
  onClick?: MouseEventHandler<HTMLDivElement>;
  collaped: boolean;
}

export const ProblemPaneHeader = memo(({ compilationState, ...props }: ProblemPaneHeaderProps) => {
  const noProblem = (
    <Container status="none" {...props}>
      No problems
    </Container>
  );
  if (compilationState === undefined) {
    return noProblem;
  }
  if (isCrashed(compilationState)) {
    return (
      <Container status="error" {...props}>
        <ErrorCircle16Filled /> Internal Compiler Error
      </Container>
    );
  }

  // Get diagnostics from either main-thread or worker result
  let errorCount = 0;
  let warningCount = 0;
  if (hasProgram(compilationState)) {
    for (const d of compilationState.program.diagnostics) {
      if (d.severity === "error") errorCount++;
      else warningCount++;
    }
  } else if (isWorkerResult(compilationState)) {
    for (const d of compilationState.diagnostics) {
      if (d.severity === "error") errorCount++;
      else warningCount++;
    }
  }

  if (errorCount === 0 && warningCount === 0) {
    return noProblem;
  }
  return (
    <Container status={errorCount > 0 ? "error" : "warning"} {...props}>
      {errorCount > 0 ? (
        <>
          <ErrorCircle16Filled className={style["error-icon"]} /> {errorCount} errors
        </>
      ) : null}
      {warningCount > 0 ? (
        <>
          <Warning16Filled className={style["warning-icon"]} /> {warningCount} warnings
        </>
      ) : null}
    </Container>
  );
});

interface ContainerProps {
  collaped: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  children?: ReactNode;
  className?: string;
  status: "error" | "warning" | "none";
}

const Container = ({ children, className, status, onClick, collaped }: ContainerProps) => {
  return (
    <div
      role="button"
      tabIndex={onClick === undefined ? undefined : 0}
      className={mergeClasses(
        style["header"],
        status === "error" && style["header--error"],
        status === "warning" && style["header--warning"],
        className,
      )}
      onClick={onClick}
      onKeyDown={(evt) => (evt.code === "Enter" || evt.code === "Space") && onClick?.(evt as any)}
    >
      <div className={style["header-content"]}>{children}</div>
      <ChevronDown16Regular
        className={mergeClasses(
          style["header-chevron"],
          collaped && style["header-chevron--collapsed"],
        )}
      />
    </div>
  );
};
