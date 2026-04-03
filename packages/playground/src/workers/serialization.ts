import type { Diagnostic, DiagnosticTarget, NoTarget, Program } from "@typespec/compiler";
import type {
  SerializedCodefix,
  SerializedDiagnostic,
  SerializedRange,
  SerializedSourceLocation,
  SerializedTextEdit,
  WorkerCompilationResult,
} from "./types.js";

/**
 * Serialize diagnostics from a compiled program into a transferable format.
 */
export async function serializeCompilationResult(
  compiler: typeof import("@typespec/compiler"),
  program: Program,
  outputFiles: Record<string, string>,
): Promise<WorkerCompilationResult> {
  const diagnostics = await Promise.all(
    program.diagnostics.map((d) => serializeDiagnostic(compiler, d)),
  );
  return { outputFiles, diagnostics };
}

async function serializeDiagnostic(
  compiler: typeof import("@typespec/compiler"),
  diagnostic: Diagnostic,
): Promise<SerializedDiagnostic> {
  const target = serializeTarget(compiler, diagnostic.target);
  const codefixes = await serializeCodefixes(compiler, diagnostic);
  return {
    severity: diagnostic.severity,
    code: typeof diagnostic.code === "string" ? diagnostic.code : String(diagnostic.code),
    message: diagnostic.message,
    target,
    codefixes,
  };
}

function serializeTarget(
  compiler: typeof import("@typespec/compiler"),
  target: DiagnosticTarget | typeof NoTarget,
): SerializedSourceLocation | undefined {
  if (target === undefined || typeof target === "symbol") {
    return undefined;
  }
  const location = compiler.getSourceLocation(target, { locateId: true });
  if (!location) {
    return undefined;
  }
  const start = location.file.getLineAndCharacterOfPosition(location.pos);
  const end = location.file.getLineAndCharacterOfPosition(location.end);
  return {
    file: location.file.path,
    pos: location.pos,
    end: location.end,
    startLine: start.line,
    startColumn: start.character,
    endLine: end.line,
    endColumn: end.character,
  };
}

async function serializeCodefixes(
  compiler: typeof import("@typespec/compiler"),
  diagnostic: Diagnostic,
): Promise<SerializedCodefix[]> {
  if (!diagnostic.codefixes?.length) {
    return [];
  }
  const result: SerializedCodefix[] = [];
  for (const fix of diagnostic.codefixes) {
    try {
      const edits = await compiler.resolveCodeFix(fix);
      const serializedEdits: SerializedTextEdit[] = edits.map((edit) => {
        const start = edit.file.getLineAndCharacterOfPosition(edit.pos);
        const endPos =
          edit.kind === "insert-text"
            ? edit.pos
            : (edit as { pos: number; end: number }).end;
        const end = edit.file.getLineAndCharacterOfPosition(endPos);
        const range: SerializedRange = {
          startLine: start.line,
          startColumn: start.character,
          endLine: end.line,
          endColumn: end.character,
        };
        return {
          file: edit.file.path,
          range,
          text: edit.text,
        };
      });
      result.push({ label: fix.label, edits: serializedEdits });
    } catch {
      // Skip codefixes that fail to resolve
    }
  }
  return result;
}
