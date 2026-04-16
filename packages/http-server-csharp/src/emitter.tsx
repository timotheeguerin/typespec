import { SourceDirectory } from "@alloy-js/core";
import { createCSharpNamePolicy } from "@alloy-js/csharp";
import { EmitContext } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import {
  Experimental_ComponentOverrides,
  Output,
  writeOutput,
} from "@typespec/emitter-framework";
import { HttpCanonicalizer } from "@typespec/http-canonicalization";
import { createServerScalarOverrides } from "./components/type-expression.jsx";
import { HttpCanonicalizerContext } from "./context/http-canonicalizer-context.js";
import { CSharpServiceEmitterOptions } from "./lib.js";

/**
 * Main function to handle the emission process.
 * @param context - The context for the emission process.
 */
export async function $onEmit(context: EmitContext<CSharpServiceEmitterOptions>) {
  const tk = $(context.program);
  const canonicalizer = new HttpCanonicalizer(tk);
  const scalarOverrides = createServerScalarOverrides(tk);

  const output = (
    <Output program={context.program} namePolicy={createCSharpNamePolicy()}>
      <Experimental_ComponentOverrides overrides={scalarOverrides}>
        <HttpCanonicalizerContext.Provider value={canonicalizer}>
          <SourceDirectory path=".">
            <SourceDirectory path="generated">
              <SourceDirectory path="models">{/* Models and Enums go here */}</SourceDirectory>
              <SourceDirectory path="controllers">{/* Controllers go here */}</SourceDirectory>
            </SourceDirectory>
          </SourceDirectory>
        </HttpCanonicalizerContext.Provider>
      </Experimental_ComponentOverrides>
    </Output>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
