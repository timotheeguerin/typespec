import { Output, SourceDirectory, SourceFile } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { writeOutput } from "@typespec/emitter-framework";

export async function $onEmit(context: EmitContext) {
  await writeOutput(
    <Output>
      <SourceDirectory path="src" />
      <SourceFile path="README.md" filetype="md">
        Hello world!
      </SourceFile>
    </Output>,
    context.emitterOutputDir,
  );
}
