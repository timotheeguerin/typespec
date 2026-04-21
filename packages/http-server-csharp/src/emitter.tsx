import { Show, SourceDirectory } from "@alloy-js/core";
import { createCSharpNamePolicy, Namespace } from "@alloy-js/csharp";
import type { EmitContext, Interface } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import { Experimental_ComponentOverrides, Output } from "@typespec/emitter-framework";
import {
  HttpCanonicalizer,
  type OperationHttpCanonicalization,
} from "@typespec/http-canonicalization";
import { Enums } from "./components/enums.jsx";
import {
  Models,
  preAssignAnonymousResponseNames,
  resetAnonymousModels,
} from "./components/models/index.jsx";
import { Csproj } from "./components/project/csproj.jsx";
import { AppSettings, LaunchSettings } from "./components/project/launch-settings.jsx";
import { ProgramCs } from "./components/project/program.jsx";
import { ControllersAndInterfaces } from "./components/render-root.jsx";
import { Documentation } from "./components/scaffolding/documentation.jsx";
import { MockHelpers, MockImplementations } from "./components/scaffolding/mock-scaffolding.jsx";
import { JsonConverters } from "./components/serialization/json-converters.jsx";
import { createServerScalarOverrides } from "./components/type-expression.jsx";
import { EmitterOptions } from "./context/emitter-options-context.js";
import { HttpCanonicalizerContext } from "./context/http-canonicalizer-context.js";
import { reportEmitterDiagnostics } from "./diagnostics.js";
import { CSharpServiceEmitterOptions } from "./lib.js";
import { resolveOpenApiPath, writeOutputWithOverwrite } from "./output-writer.js";
import { getServiceInterfaces, getServiceNamespaceName } from "./service-discovery.js";
import { getFreePort } from "./utils/port.js";

/**
 * Main function to handle the emission process.
 * @param context - The context for the emission process.
 */
export async function $onEmit(context: EmitContext<CSharpServiceEmitterOptions>) {
  resetAnonymousModels();
  const tk = $(context.program);
  const canonicalizer = new HttpCanonicalizer(tk);
  const scalarOverrides = createServerScalarOverrides(tk);
  const options = context.options;
  const serviceName = getServiceNamespaceName(context.program) ?? "ServiceProject";
  const projectName = options["project-name"] ?? "ServiceProject";
  const collectionType = options["collection-type"] ?? "array";
  const emitMocks =
    options["emit-mocks"] === "mocks-only" || options["emit-mocks"] === "mocks-and-project-files";
  const emitProjectFiles = options["emit-mocks"] === "mocks-and-project-files";
  const useSwaggerUI = options["use-swaggerui"] ?? false;

  // Resolve OpenAPI path for SwaggerUI
  let openApiPath: string | undefined = options["openapi-path"];
  if (!openApiPath && useSwaggerUI) {
    openApiPath = await resolveOpenApiPath(context);
  }
  const effectiveUseSwaggerUI = useSwaggerUI && !!openApiPath;

  // Collect interface names for mock registration
  const interfaces = getServiceInterfaces(context.program);
  const interfaceNames = interfaces.map((iface) => iface.name);
  const interfaceRegistrations = interfaces.map((iface) => `I${iface.name}, ${iface.name}`);

  // Pre-compute canonical ops for all interfaces (used by mock scaffolding and diagnostics)
  const canonicalOpsMap = canonicalizeAllInterfaces(canonicalizer, interfaces);

  // Pre-assign contextual names to anonymous response models before diagnostic pre-pass
  preAssignAnonymousResponseNames(interfaces);

  // Report diagnostic warnings (pre-pass before rendering)
  reportEmitterDiagnostics(context.program, interfaces, canonicalOpsMap);

  // Resolve ports for project files
  let httpPort = options["http-port"] ?? 5000;
  let httpsPort = options["https-port"] ?? 7000;
  if (emitProjectFiles) {
    if (!options["http-port"]) {
      httpPort = await getFreePort(5000, 5999);
    }
    if (!options["https-port"]) {
      httpsPort = await getFreePort(7000, 7999);
    }
  }

  const output = (
    <Output program={context.program} namePolicy={createCSharpNamePolicy()}>
      <Experimental_ComponentOverrides overrides={scalarOverrides}>
        <EmitterOptions.Provider value={{ collectionType, serviceNamespace: serviceName }}>
          <HttpCanonicalizerContext.Provider value={canonicalizer}>
            <SourceDirectory path=".">
              <Namespace name={serviceName}>
                <SourceDirectory path="generated">
                  <SourceDirectory path="models">
                    <Models />
                    <Enums />
                  </SourceDirectory>
                  <ControllersAndInterfaces />
                </SourceDirectory>
                <ProgramCs
                  hasMocks={emitMocks}
                  useSwaggerUI={effectiveUseSwaggerUI}
                  openApiPath={openApiPath}
                />
                <Show when={emitMocks}>
                  <MockImplementations interfaces={interfaces} canonicalOpsMap={canonicalOpsMap} />
                </Show>
                <Show when={emitProjectFiles}>
                  <Csproj projectName={projectName} useSwaggerUI={useSwaggerUI} />
                  <LaunchSettings httpPort={httpPort} httpsPort={httpsPort} />
                  <AppSettings />
                </Show>
                <Documentation
                  interfaceNames={emitMocks ? interfaceNames : []}
                  useSwaggerUI={useSwaggerUI}
                />
              </Namespace>
              <SourceDirectory path="generated">
                <JsonConverters />
              </SourceDirectory>
              <Show when={emitMocks}>
                <MockHelpers interfaceRegistrations={interfaceRegistrations} />
              </Show>
            </SourceDirectory>
          </HttpCanonicalizerContext.Provider>
        </EmitterOptions.Provider>
      </Experimental_ComponentOverrides>
    </Output>
  );

  const overwrite = options.overwrite ?? false;
  await writeOutputWithOverwrite(context.program, output, context.emitterOutputDir, overwrite);
}

/**
 * Canonicalize all operations for each interface, skipping any that fail.
 */
export function canonicalizeAllInterfaces(
  canonicalizer: HttpCanonicalizer,
  interfaces: Interface[],
): Map<string, OperationHttpCanonicalization[]> {
  const result = new Map<string, OperationHttpCanonicalization[]>();
  for (const iface of interfaces) {
    const ops: OperationHttpCanonicalization[] = [];
    for (const [, op] of iface.operations) {
      try {
        ops.push(canonicalizer.canonicalize(op) as OperationHttpCanonicalization);
      } catch {
        // Skip operations that can't be canonicalized
      }
    }
    result.set(iface.name, ops);
  }
  return result;
}
