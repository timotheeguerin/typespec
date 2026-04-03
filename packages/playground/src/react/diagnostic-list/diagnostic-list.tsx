import { mergeClasses } from "@fluentui/react-components";
import {
  getSourceLocation,
  type Diagnostic,
  type DiagnosticTarget,
  type NoTarget,
} from "@typespec/compiler";
import { memo, useCallback, type FunctionComponent } from "react";
import type { SerializedDiagnostic } from "../../workers/types.js";
import style from "./diagnostic-list.module.css";

export interface DiagnosticListProps {
  readonly diagnostics: readonly Diagnostic[];
  readonly onDiagnosticSelected?: (diagnostic: Diagnostic) => void;
}

export const DiagnosticList: FunctionComponent<DiagnosticListProps> = ({
  diagnostics,
  onDiagnosticSelected,
}) => {
  const handleItemSelected = useCallback(
    (diagnostic: Diagnostic) => {
      onDiagnosticSelected?.(diagnostic);
    },
    [onDiagnosticSelected],
  );
  if (diagnostics.length === 0) {
    return <div className={style["list"]}>No errors</div>;
  }
  return (
    <div className={style["list"]}>
      {diagnostics.map((x, i) => {
        return <DiagnosticItem key={i} diagnostic={x} onItemSelected={handleItemSelected} />;
      })}
    </div>
  );
};

// ── Serialized Diagnostic List (for worker results) ──

export interface SerializedDiagnosticListProps {
  readonly diagnostics: readonly SerializedDiagnostic[];
  readonly onDiagnosticSelected?: (diagnostic: SerializedDiagnostic) => void;
}

export const SerializedDiagnosticList: FunctionComponent<SerializedDiagnosticListProps> = ({
  diagnostics,
  onDiagnosticSelected,
}) => {
  const handleItemSelected = useCallback(
    (diagnostic: SerializedDiagnostic) => {
      onDiagnosticSelected?.(diagnostic);
    },
    [onDiagnosticSelected],
  );
  if (diagnostics.length === 0) {
    return <div className={style["list"]}>No errors</div>;
  }
  return (
    <div className={style["list"]}>
      {diagnostics.map((x, i) => {
        return (
          <SerializedDiagnosticItem key={i} diagnostic={x} onItemSelected={handleItemSelected} />
        );
      })}
    </div>
  );
};

interface DiagnosticItemProps {
  readonly diagnostic: Diagnostic;
  readonly onItemSelected: (diagnostic: Diagnostic) => void;
}

const DiagnosticItem: FunctionComponent<DiagnosticItemProps> = ({ diagnostic, onItemSelected }) => {
  const handleClick = useCallback(() => {
    onItemSelected(diagnostic);
  }, [diagnostic, onItemSelected]);
  return (
    <div tabIndex={0} className={style["item"]} onClick={handleClick}>
      <div
        className={mergeClasses(
          (style["item-severity"],
          style[diagnostic.severity === "error" ? "item--error" : "item--warning"]),
        )}
      >
        {diagnostic.severity}
      </div>
      <div className={style["item-code"]}>{diagnostic.code}</div>
      <div className={style["item-message"]}>{diagnostic.message}</div>
      <div className={style["item-loc"]}>
        <DiagnosticTargetLink target={diagnostic.target} />
      </div>
    </div>
  );
};

const DiagnosticTargetLink = memo(({ target }: { target: DiagnosticTarget | typeof NoTarget }) => {
  if (target === undefined) {
    return (
      <span title="Diagnostic didn't report a target. This is a bug on the emitter.">
        No target
      </span>
    );
  }
  if (typeof target === "symbol") {
    return <span></span>;
  }
  const location = getSourceLocation(target);

  const file = location.file.path === "/test/main.tsp" ? "" : `${location.file.path}:`;
  const { line, character } = location.file.getLineAndCharacterOfPosition(location.pos);
  return (
    <span>
      {file}
      {line + 1}:{character + 1}
    </span>
  );
});

// ── Serialized Diagnostic Item (for worker results) ──

interface SerializedDiagnosticItemProps {
  readonly diagnostic: SerializedDiagnostic;
  readonly onItemSelected: (diagnostic: SerializedDiagnostic) => void;
}

const SerializedDiagnosticItem: FunctionComponent<SerializedDiagnosticItemProps> = ({
  diagnostic,
  onItemSelected,
}) => {
  const handleClick = useCallback(() => {
    onItemSelected(diagnostic);
  }, [diagnostic, onItemSelected]);
  return (
    <div tabIndex={0} className={style["item"]} onClick={handleClick}>
      <div
        className={mergeClasses(
          (style["item-severity"],
          style[diagnostic.severity === "error" ? "item--error" : "item--warning"]),
        )}
      >
        {diagnostic.severity}
      </div>
      <div className={style["item-code"]}>{diagnostic.code}</div>
      <div className={style["item-message"]}>{diagnostic.message}</div>
      <div className={style["item-loc"]}>
        {diagnostic.target ? (
          <span>
            {diagnostic.target.file === "/test/main.tsp" ? "" : `${diagnostic.target.file}:`}
            {diagnostic.target.startLine + 1}:{diagnostic.target.startColumn + 1}
          </span>
        ) : (
          <span>No target</span>
        )}
      </div>
    </div>
  );
};
