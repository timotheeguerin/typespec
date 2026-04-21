import { For, SourceDirectory, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { Namespace } from "@alloy-js/csharp";
import { useTsp } from "@typespec/emitter-framework";
import type { OperationHttpCanonicalization } from "@typespec/http-canonicalization";
import { Controller } from "./controllers.jsx";
import { CSharpFile } from "./csharp-file.jsx";
import { BusinessLogicInterface } from "./interfaces.jsx";
import { RequestModels, type RequestModelInfo } from "./request-models.jsx";
import { useEmitterOptions } from "../context/emitter-options-context.js";
import { useHttpCanonicalizer } from "../context/http-canonicalizer-context.js";
import { getServiceInterfaces } from "../service-discovery.js";

/**
 * Component that renders controllers and their corresponding business logic interfaces.
 */
export function ControllersAndInterfaces(): Children {
  const { $ } = useTsp();
  const canonicalizer = useHttpCanonicalizer();
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

/** @deprecated Use useHttpCanonicalizer() from context/http-canonicalizer-context.js instead */
export { useHttpCanonicalizer as useHttpCanonicalizerFromContext } from "../context/http-canonicalizer-context.js";
