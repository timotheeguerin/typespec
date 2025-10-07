import { createDiagnosticCollector, err } from "./diagnostics.js";
import { createDiagnostic } from "./messages.js";
import { TypeGraph } from "./program.js";
import { createSourceFile } from "./source-file.js";
import { Diagnostic, Model } from "./types.js";

export function resolveEmitterOptions(
  typeGraph: TypeGraph,
): [Model | undefined, readonly Diagnostic[]] {
  const [root] = typeGraph.resolveTypeReference("EmitterOptions");
  const diagnostics = createDiagnosticCollector();

  if (root === undefined) {
    return [
      undefined,
      [
        createDiagnostic({
          code: "missing-emitter-options",
          target: { file: createSourceFile("", typeGraph.entrypoint), pos: 0, end: 0 },
        }),
      ],
    ];
  }
  if (root.kind !== "Model") {
    return err(
      createDiagnostic({
        code: "emitter-options-not-model",
        target: root,
      }),
    );
  }
  return diagnostics.wrap(root);
}
