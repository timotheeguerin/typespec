import { For, renderAsync, SourceDirectory } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { createCSharpNamePolicy, Namespace } from "@alloy-js/csharp";
import {
  EmitContext,
  emitFile,
  Interface,
  isStdNamespace,
  isTemplateDeclaration,
  joinPaths,
  Model,
  Program,
  resolveCompilerOptions,
  resolvePath,
  type Operation,
  type Namespace as TspNamespace,
} from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import { Experimental_ComponentOverrides, Output, useTsp } from "@typespec/emitter-framework";
import {
  HttpCanonicalizer,
  type OperationHttpCanonicalization,
} from "@typespec/http-canonicalization";
import { Controller } from "./components/controllers.jsx";
import { CSharpFile } from "./components/csharp-file.jsx";
import { Enums } from "./components/enums.jsx";
import { BusinessLogicInterface } from "./components/interfaces.jsx";
import {
  assignAnonymousName,
  Models,
  preAssignAnonymousResponseNames,
  resetAnonymousModels,
} from "./components/models.jsx";
import { Csproj } from "./components/project/csproj.jsx";
import { AppSettings, LaunchSettings } from "./components/project/launch-settings.jsx";
import { ProgramCs } from "./components/project/program.jsx";
import { RequestModels, type RequestModelInfo } from "./components/request-models.jsx";
import { Documentation } from "./components/scaffolding/documentation.jsx";
import { MockHelpers, MockImplementations } from "./components/scaffolding/mock-scaffolding.jsx";
import { JsonConverters } from "./components/serialization/json-converters.jsx";
import { createServerScalarOverrides } from "./components/type-expression.jsx";
import { EmitterOptions, useEmitterOptions } from "./context/emitter-options-context.js";
import { HttpCanonicalizerContext } from "./context/http-canonicalizer-context.js";
import { CSharpServiceEmitterOptions, reportDiagnostic } from "./lib.js";
import { getCSharpIdentifier, isValidCSharpIdentifier, NameCasingType } from "./utils/naming.js";
import { getFreePort } from "./utils/port.js";

/**
 * Collects all interfaces from the service namespace(s).
 * Also creates synthetic interfaces for namespace-level operations
 * (following the old emitter pattern: `${namespaceName}Operations`).
 */
function getServiceInterfaces(program: ReturnType<typeof useTsp>["$"]["program"]): Interface[] {
  const interfaces: Interface[] = [];
  const globalNs = program.getGlobalNamespaceType();

  function collectFromNamespace(ns: TspNamespace): void {
    // Collect explicit TypeSpec interfaces
    for (const iface of ns.interfaces?.values() ?? []) {
      if (iface.name && !interfaces.includes(iface) && !isTemplateDeclaration(iface)) {
        interfaces.push(iface);
      }
    }

    // Create synthetic interface for namespace-level operations
    if (ns.operations.size > 0) {
      const nsOps: [string, Operation][] = [];
      for (const [name, op] of ns.operations) {
        if (!isTemplateDeclaration(op)) {
          nsOps.push([name, op]);
        }
      }
      if (nsOps.length > 0) {
        const syntheticIface = program.checker.createAndFinishType({
          sourceInterfaces: [],
          decorators: [],
          operations: new Map(nsOps) as any,
          kind: "Interface",
          name: `${ns.name}Operations`,
          namespace: ns,
          entityKind: "Type",
          isFinished: true,
        }) as Interface;

        // Temporarily associate ops with the synthetic interface
        for (const [_, op] of nsOps) {
          op.interface = syntheticIface;
        }
        interfaces.push(syntheticIface);
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
 * Gets the full service namespace name from the program (e.g., "Microsoft.Contoso").
 */
function getServiceNamespaceName(
  program: ReturnType<typeof useTsp>["$"]["program"],
): string | undefined {
  const globalNs = program.getGlobalNamespaceType();

  function getFullName(ns: TspNamespace): string {
    const parts: string[] = [];
    let current: TspNamespace | undefined = ns;
    while (current && current !== globalNs) {
      parts.unshift(current.name);
      current = current.namespace;
    }
    return parts.join(".");
  }

  // Find the service namespace (deepest non-std namespace in the first branch)
  function findServiceNs(ns: TspNamespace): TspNamespace | undefined {
    for (const child of ns.namespaces.values()) {
      if (isStdNamespace(child)) continue;
      // If this namespace has content (models, interfaces, operations, enums), use it
      // Otherwise, recurse deeper
      const hasContent =
        child.models.size > 0 ||
        child.interfaces.size > 0 ||
        child.operations.size > 0 ||
        child.enums.size > 0;
      if (hasContent) return child;
      const deeper = findServiceNs(child);
      if (deeper) return deeper;
      return child;
    }
    return undefined;
  }

  const serviceNs = findServiceNs(globalNs);
  if (!serviceNs) return undefined;
  const fullName = getFullName(serviceNs);
  return getCSharpIdentifier(fullName, NameCasingType.Namespace);
}

/**
 * Component that renders controllers and their corresponding business logic interfaces.
 */
function ControllersAndInterfaces(): any {
  const { $ } = useTsp();
  const canonicalizer = useHttpCanonicalizerFromContext();
  const interfaces = getServiceInterfaces($.program);
  const namePolicy = cs.useCSharpNamePolicy();
  const { serviceNamespace: parentNamespace } = useEmitterOptions();

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

  // Collect operations that need request model classes
  const requestModels: RequestModelInfo[] = [];
  for (const { iface, ops } of interfaceOps) {
    for (const op of ops) {
      // GET requests don't have body parameters in the server
      if (op.method === "get") continue;

      const body = op.requestParameters.body;
      if (body?.bodyKind === "single" && body.bodies.length > 0) {
        const bodyType = body.bodies[0].type.sourceType;
        // Create request model for body parameters that have properties to decompose
        // This handles spread params (...Model) and implicit body models
        if (bodyType.kind === "Model" && bodyType.properties.size > 0) {
          // Skip if the body has an explicit property (i.e., @body/@bodyRoot decorator used)
          const hasExplicitBody = body.bodies[0].property !== undefined;
          if (!hasExplicitBody) {
            const opName = namePolicy.getName(op.name, "class-method");
            const requestModelName = `${iface.name}${opName}Request`;
            requestModels.push({ name: requestModelName, op, ifaceName: iface.name });
          }
        }
      }
    }
  }

  return (
    <>
      <SourceDirectory path="models">
        <RequestModels requestModels={requestModels} />
      </SourceDirectory>
      <SourceDirectory path="operations">
        <For each={interfaceOps}>
          {({ iface, ops }) => {
            const hasMultipart = ops.some(op => op.requestParameters.body?.bodyKind === "multipart");
            return (
            <CSharpFile
              path={`I${iface.name}.cs`}
              using={[
                "System",
                "System.Collections.Generic",
                "System.Text.Json",
                "System.Text.Json.Nodes",
                "System.Text.Json.Serialization",
                "System.Threading.Tasks",
                ...(hasMultipart ? ["Microsoft.AspNetCore.WebUtilities"] : []),
              ]}
            >
              <BusinessLogicInterface type={iface} canonicalOps={ops} />
            </CSharpFile>
            );
          }}
        </For>
      </SourceDirectory>
      <SourceDirectory path="controllers">
        <Namespace name="Controllers">
          <For each={interfaceOps}>
            {({ iface, ops }) => {
              const hasMultipart = ops.some(op => op.requestParameters.body?.bodyKind === "multipart");
              return (
              <CSharpFile
                path={`${iface.name}Controller.cs`}
                using={[
                  "System",
                  "System.Net",
                  "System.Threading.Tasks",
                  "System.Text.Json",
                  "System.Text.Json.Nodes",
                  "System.Text.Json.Serialization",
                  "Microsoft.AspNetCore.Mvc",
                  ...(hasMultipart ? ["Microsoft.AspNetCore.WebUtilities", "Microsoft.AspNetCore.Http.Extensions"] : []),
                  ...(parentNamespace ? [parentNamespace] : []),
                ]}
              >
                <Controller type={iface} operations={ops} requestModels={requestModels} />
              </CSharpFile>
              );
            }}
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
 * Reports diagnostic warnings for models, scalars, and operations.
 * This pre-pass mirrors the old emitter behavior so that `tester.diagnose()` tests pass.
 */
function reportEmitterDiagnostics(
  program: Program,
  interfaces: Interface[],
  canonicalOpsMap: Map<string, OperationHttpCanonicalization[]>,
): void {
  const tk = $(program);
  const visited = new Set<Model>();

  // Walk all models in the service namespace(s) to check properties
  for (const ns of program.getGlobalNamespaceType().namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    walkNamespaceModels(program, ns, tk, visited);
  }

  // Check GET operations for body parameters
  for (const iface of interfaces) {
    const ops = canonicalOpsMap.get(iface.name) ?? [];
    for (const canonOp of ops) {
      if (canonOp.method === "get") {
        const body = canonOp.requestParameters.body;
        if (body) {
          reportDiagnostic(program, {
            code: "get-request-body",
            target: canonOp.languageType,
            format: {},
          });
        }
      }
    }
  }
}

function walkNamespaceModels(
  program: Program,
  ns: TspNamespace,
  tk: ReturnType<typeof $>,
  visited: Set<Model>,
): void {
  // Walk scalars to detect unrecognized/imprecise scalar types
  for (const scalar of ns.scalars.values()) {
    if (isTemplateDeclaration(scalar)) continue;
    checkPropertyDiagnostics(program, tk, scalar);
  }

  for (const model of ns.models.values()) {
    if (visited.has(model)) continue;
    visited.add(model);
    if (isTemplateDeclaration(model)) continue;

    // Check for anonymous models
    if (!model.name || model.name === "") {
      const emittedName = assignAnonymousName(model);
      reportDiagnostic(program, {
        code: "anonymous-model",
        target: model,
        format: { emittedName },
      });
    }

    // Walk properties
    for (const prop of model.properties.values()) {
      checkPropertyDiagnostics(program, tk, prop.type);

      // Check for invalid identifiers
      if (!isValidCSharpIdentifier(prop.name)) {
        const location = `property '${prop.name}' in model ${model.name || "anonymous"}`;
        reportDiagnostic(program, {
          code: "invalid-identifier",
          target: prop,
          format: { identifier: prop.name, location },
        });
      }

      // Check for anonymous inline model properties (including inside union variants)
      if (prop.type.kind === "Model" && (!prop.type.name || prop.type.name === "")) {
        if (!visited.has(prop.type)) {
          visited.add(prop.type);
          const emittedName = assignAnonymousName(prop.type);
          reportDiagnostic(program, {
            code: "anonymous-model",
            target: prop.type,
            format: { emittedName },
          });
        }
      } else if (prop.type.kind === "Union") {
        // Walk union variants to find anonymous models
        for (const variant of prop.type.variants.values()) {
          if (variant.type.kind === "Model" && (!variant.type.name || variant.type.name === "")) {
            if (!visited.has(variant.type)) {
              visited.add(variant.type);
              const emittedName = assignAnonymousName(variant.type);
              reportDiagnostic(program, {
                code: "anonymous-model",
                target: variant.type,
                format: { emittedName },
              });
            }
          }
        }
      }

      // Check for invalid string interpolation
      if (prop.type.kind === "StringTemplate") {
        const hasNonLiteral = prop.type.spans.some(
          (span) => span.isInterpolated && span.node?.kind !== undefined,
        );
        if (hasNonLiteral) {
          reportDiagnostic(program, {
            code: "invalid-interpolation",
            target: prop,
            format: {},
          });
        }
      }
    }
  }

  // Recurse into sub-namespaces
  for (const childNs of ns.namespaces.values()) {
    if (isStdNamespace(childNs)) continue;
    walkNamespaceModels(program, childNs, tk, visited);
  }
}

function checkPropertyDiagnostics(
  program: Program,
  tk: ReturnType<typeof $>,
  type: import("@typespec/compiler").Type,
): void {
  if (type.kind === "Scalar") {
    const stdBase = tk.scalar.getStdBase(type);
    if (!stdBase) {
      // Custom scalar with no standard base
      reportDiagnostic(program, {
        code: "unrecognized-scalar",
        target: type,
        format: { typeName: type.name },
      });
      return;
    }

    // Check for imprecise numeric types
    const numericMappings: Record<string, string> = {
      integer: "long",
      float: "double",
      numeric: "object",
    };
    const targetType = numericMappings[stdBase.name];
    if (targetType) {
      reportDiagnostic(program, {
        code: "no-numeric",
        target: type,
        format: { sourceType: stdBase.name, targetType },
      });
    }
  }
}

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

  // Pre-compute canonical ops for all interfaces (used by mock scaffolding)
  const canonicalOpsMap = new Map<string, OperationHttpCanonicalization[]>();
  for (const iface of interfaces) {
    const ops: OperationHttpCanonicalization[] = [];
    for (const [, op] of iface.operations) {
      try {
        const canonical = canonicalizer.canonicalize(op) as OperationHttpCanonicalization;
        ops.push(canonical);
      } catch {
        // Skip operations that can't be canonicalized
      }
    }
    canonicalOpsMap.set(iface.name, ops);
  }

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
                {emitMocks && (
                  <MockImplementations
                    interfaces={interfaces}
                    canonicalOpsMap={canonicalOpsMap}
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
              </Namespace>
              <SourceDirectory path="generated">
                <JsonConverters />
              </SourceDirectory>
              {emitMocks && (
                <MockHelpers
                  interfaceRegistrations={interfaceRegistrations}
                />
              )}
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
 * Custom write function that respects the overwrite option.
 * Files in the "generated/" directory are always written.
 * Other files (scaffolding, mocks, project files) are only written if they don't exist or overwrite is true.
 */
async function writeOutputWithOverwrite(
  program: Program,
  rootComponent: import("@alloy-js/core").Children,
  emitterOutputDir: string,
  overwrite: boolean,
): Promise<void> {
  const tree = await renderAsync(rootComponent);
  await writeOutputDir(program, tree, emitterOutputDir, overwrite);
}

async function writeOutputDir(
  program: Program,
  dir: { contents: any[] },
  emitterOutputDir: string,
  overwrite: boolean,
): Promise<void> {
  for (const sub of dir.contents) {
    if ("contents" in sub) {
      if (Array.isArray(sub.contents)) {
        await writeOutputDir(program, sub, emitterOutputDir, overwrite);
      } else {
        const filePath = joinPaths(emitterOutputDir, sub.path);
        // Files in "generated/" are always written; others respect overwrite option
        const isGenerated = sub.path.includes("generated/") || sub.path.startsWith("generated");
        if (isGenerated || overwrite || !(await fileExists(program, filePath))) {
          await emitFile(program, {
            content: sub.contents,
            path: filePath,
          });
        }
      }
    }
  }
}

async function fileExists(program: Program, path: string): Promise<boolean> {
  try {
    await program.host.stat(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeSlashes(p: string): string {
  return p.replaceAll("\\", "/");
}

async function resolveOpenApiPath(
  context: EmitContext<CSharpServiceEmitterOptions>,
): Promise<string | undefined> {
  const root = context.program.projectRoot;
  try {
    const [resolvedOptions] = await resolveCompilerOptions(context.program.host, {
      cwd: root,
      entrypoint: resolvePath(root, "main.tsp"),
    });
    const oaiOptions =
      resolvedOptions.options && Object.keys(resolvedOptions.options).includes("@typespec/openapi3")
        ? resolvedOptions.options["@typespec/openapi3"]
        : undefined;

    const emitted =
      resolvedOptions.emit !== undefined && resolvedOptions.emit.includes("@typespec/openapi3");
    const outputDir: string | undefined = oaiOptions?.["emitter-output-dir"];
    const fileName: string | undefined = oaiOptions?.["output-file"] as any;

    // Use emitterOutputDir resolved as absolute path
    const projectDir = resolvePath(root, context.emitterOutputDir);

    if (outputDir) {
      const openApiFullPath = resolvePath(outputDir, fileName || "openapi.yaml");
      const pathModule = await import("path");
      return normalizeSlashes(pathModule.relative(projectDir, openApiFullPath));
    }
    if (emitted) {
      const baseDir = context.program.compilerOptions.outputDir || resolvePath(root, "tsp-output");
      const openApiFullPath = resolvePath(
        baseDir,
        "@typespec",
        "openapi3",
        fileName || "openapi.yaml",
      );
      const pathModule = await import("path");
      return normalizeSlashes(pathModule.relative(projectDir, openApiFullPath));
    }
  } catch {
    // Config resolution failed, fall through
  }
  return undefined;
}
