import { code, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { isVoidType } from "@typespec/compiler";
import type {
  CanonicalHttpProperty,
  OperationHttpCanonicalization,
} from "@typespec/http-canonicalization";
import { getHttpVerbAttribute, getRouteTemplate } from "../utils/http-helpers.js";
import { getCSharpIdentifier, NameCasingType } from "../utils/naming.js";
import { TypeExpression } from "./type-expression.jsx";

export interface ControllerActionProps {
  /** The canonicalized HTTP operation to generate an action method for. */
  operation: OperationHttpCanonicalization;
  /** The name of the business logic implementation field (e.g., "petStoreImpl"). */
  implFieldName: string;
}

/**
 * Maps a canonical HTTP property to an ASP.NET parameter binding attribute.
 */
function getBindingAttribute(prop: CanonicalHttpProperty): string | undefined {
  switch (prop.kind) {
    case "path":
      return `FromRoute(Name="${prop.options.name}")`;
    case "query":
      return `FromQuery(Name="${prop.options.name}")`;
    case "header":
      return `FromHeader(Name="${prop.options.name}")`;
    default:
      return undefined;
  }
}

/**
 * Renders an ASP.NET controller action method for an HTTP operation.
 */
export function ControllerAction(props: ControllerActionProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const opName = namePolicy.getName(props.operation.name, "class-method");
  const verb = getHttpVerbAttribute(props.operation.method);
  const route = getRouteTemplate(props.operation.path);

  // Map all HTTP parameters (path, query, header) to C# method parameters
  const parameters: { name: string; type: Children; attributes?: string[] }[] =
    props.operation.requestParameters.properties
      .filter((p) => p.kind === "path" || p.kind === "query" || p.kind === "header")
      .filter((p) => !p.property.isContentTypeProperty)
      .map((p) => {
        const attr = getBindingAttribute(p);
        return {
          name: getCSharpIdentifier(p.property.sourceType.name, NameCasingType.Parameter),
          type: (<TypeExpression type={p.property.sourceType.type} />) as Children,
          attributes: attr ? [attr] : undefined,
        };
      });

  // Add body parameter if present
  const body = props.operation.requestParameters.body;
  if (body?.bodyKind === "single" && body.bodies.length > 0) {
    parameters.push({
      name: "body",
      type: (<TypeExpression type={body.bodies[0].type.sourceType} />) as Children,
      attributes: ["FromBody"],
    });
  }

  const callArgs = parameters.map((p) => p.name).join(", ");
  const hasReturnValue = !isVoidType(props.operation.sourceType.returnType);

  return (
    <cs.Method
      name={opName}
      async
      virtual
      public
      returns={code`Task<IActionResult>`}
      parameters={parameters}
      attributes={[code`[${verb}("${route}")]`]}
    >
      {hasReturnValue
        ? code`var result = await ${props.implFieldName}.${opName}Async(${callArgs});\nreturn Ok(result);`
        : code`await ${props.implFieldName}.${opName}Async(${callArgs});\nreturn Ok();`}
    </cs.Method>
  );
}
