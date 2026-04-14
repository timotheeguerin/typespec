import { SourceDirectory } from "@alloy-js/core";
import { EmitContext } from "@typespec/compiler";
import { Output, writeOutput } from "@typespec/emitter-framework";
import { CSharpServiceEmitterOptions } from "./lib.js";

/**
 * Main function to handle the emission process.
 * @param context - The context for the emission process.
 */
export async function $onEmit(context: EmitContext<CSharpServiceEmitterOptions>) {
  const output = (
    <Output program={context.program}>
      <SourceDirectory path=".">
        <SourceDirectory path="generated">
          <SourceDirectory path="models">{/* Models and Enums go here */}</SourceDirectory>
          <SourceDirectory path="controllers">{/* Controllers go here */}</SourceDirectory>
        </SourceDirectory>
      </SourceDirectory>
    </Output>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
