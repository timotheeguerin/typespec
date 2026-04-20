import { For, SourceDirectory } from "@alloy-js/core";
import { createCSharpNamePolicy, Namespace } from "@alloy-js/csharp";
import { EmitContext, Interface, isStdNamespace } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import {
  Experimental_ComponentOverrides,
  Output,
  useTsp,
  writeOutput,
} from "@typespec/emitter-framework";
import {
  HttpCanonicalizer,
  type OperationHttpCanonicalization,
} from "@typespec/http-canonicalization";
import { Controller } from "./components/controllers.jsx";
import { CSharpFile } from "./components/csharp-file.jsx";
import { Enums } from "./components/enums.jsx";
import { BusinessLogicInterface } from "./components/interfaces.jsx";
import { Models } from "./components/models.jsx";
import { Csproj } from "./components/project/csproj.jsx";
import {
  AppSettings,
  LaunchSettings,
} from "./components/project/launch-settings.jsx";
import { ProgramCs } from "./components/project/program.jsx";
import { Documentation } from "./components/scaffolding/documentation.jsx";
import { MockScaffolding } from "./components/scaffolding/mock-scaffolding.jsx";
import { JsonConverters } from "./components/serialization/json-converters.jsx";
import { createServerScalarOverrides } from "./components/type-expression.jsx";
import { HttpCanonicalizerContext } from "./context/http-canonicalizer-context.js";
import { CSharpServiceEmitterOptions } from "./lib.js";
import { getFreePort } from "./utils/port.js";

/**
 * Collects all interfaces from the service namespace(s).
 */
function getServiceInterfaces(program: ReturnType<typeof useTsp>["$"]["program"]): Interface[] {
  const interfaces: Interface[] = [];
  const globalNs = program.getGlobalNamespaceType();

  function collectFromNamespace(ns: any): void {
    for (const iface of ns.interfaces?.values() ?? []) {
      if (iface.name && !interfaces.includes(iface)) {
        interfaces.push(iface);
      }
    }
    for (const childNs of ns.namespaces?.values() ?? []) {
      if (isStdNamespace(childNs)) continue;
      collectFromNamespace(childNs);
    }
  }

  for (const ns of globalNs.namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    collectFromNamespace(ns);
  }
  return interfaces;
}

/**
 * Gets the service namespace name from the program.
 */
function getServiceNamespaceName(
  program: ReturnType<typeof useTsp>["$"]["program"],
): string | undefined {
  const globalNs = program.getGlobalNamespaceType();
  for (const ns of globalNs.namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    return ns.name;
  }
  return undefined;
}

/**
 * Component that renders controllers and their corresponding business logic interfaces.
 */
function ControllersAndInterfaces(): any {
  const { $ } = useTsp();
  const canonicalizer = useHttpCanonicalizerFromContext();
  const interfaces = getServiceInterfaces($.program);

  // Canonicalize all operations for each interface
  const interfaceOps = interfaces.map((iface) => {
    const ops: OperationHttpCanonicalization[] = [];
    for (const [, op] of iface.operations) {
      try {
        const canonical = canonicalizer.canonicalize(op) as OperationHttpCanonicalization;
        ops.push(canonical);
      } catch {
        // Skip operations that can't be canonicalized
      }
    }
    return { iface, ops };
  });

  return (
    <>
      <SourceDirectory path="operations">
        <For each={interfaceOps}>
          {({ iface }) => (
            <CSharpFile path={`I${iface.name}.cs`}>
              <BusinessLogicInterface type={iface} />
            </CSharpFile>
          )}
        </For>
      </SourceDirectory>
      <SourceDirectory path="controllers">
        <Namespace name="Controllers">
          <For each={interfaceOps}>
            {({ iface, ops }) => (
              <CSharpFile
                path={`${iface.name}Controller.cs`}
                using={[
                  "System",
                  "System.Net",
                  "System.Threading.Tasks",
                  "System.Text.Json",
                  "System.Text.Json.Serialization",
                  "Microsoft.AspNetCore.Mvc",
                ]}
              >
                <Controller type={iface} operations={ops} />
              </CSharpFile>
            )}
          </For>
        </Namespace>
      </SourceDirectory>
    </>
  );
}

function useHttpCanonicalizerFromContext(): HttpCanonicalizer {
  const { $ } = useTsp();
  return new HttpCanonicalizer($);
}

/**
 * Main function to handle the emission process.
 * @param context - The context for the emission process.
 */
export async function $onEmit(context: EmitContext<CSharpServiceEmitterOptions>) {
  const tk = $(context.program);
  const canonicalizer = new HttpCanonicalizer(tk);
  const scalarOverrides = createServerScalarOverrides(tk);
  const options = context.options;
  const serviceName = getServiceNamespaceName(context.program) ?? "ServiceProject";
  const projectName = options["project-name"] ?? "ServiceProject";
  const emitMocks =
    options["emit-mocks"] === "mocks-only" || options["emit-mocks"] === "mocks-and-project-files";
  const emitProjectFiles =
    options["emit-mocks"] === "mocks-and-project-files";
  const useSwaggerUI = options["use-swaggerui"] ?? false;

  // Collect interface names for mock registration
  const interfaces = getServiceInterfaces(context.program);
  const interfaceNames = interfaces.map((iface) => iface.name);
  const interfaceRegistrations = interfaces.map((iface) => `I${iface.name}, Mock${iface.name}`);

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
        <HttpCanonicalizerContext.Provider value={canonicalizer}>
          <Namespace name={serviceName}>
            <SourceDirectory path=".">
              <SourceDirectory path="generated">
                <SourceDirectory path="models">
                  <Models />
                  <Enums />
                </SourceDirectory>
                <ControllersAndInterfaces />
                <JsonConverters />
              </SourceDirectory>
              <ProgramCs hasMocks={emitMocks} />
              {emitMocks && (
                <MockScaffolding
                  interfaceRegistrations={interfaceRegistrations}
                  interfaces={interfaces}
                />
              )}
              {emitProjectFiles && (
                <>
                  <Csproj projectName={projectName} useSwaggerUI={useSwaggerUI} />
                  <LaunchSettings httpPort={httpPort} httpsPort={httpsPort} />
                  <AppSettings />
                </>
              )}
              <Documentation
                interfaceNames={emitMocks ? interfaceNames : []}
                useSwaggerUI={useSwaggerUI}
              />
            </SourceDirectory>
          </Namespace>
        </HttpCanonicalizerContext.Provider>
      </Experimental_ComponentOverrides>
    </Output>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
