import { code, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Type } from "@typespec/compiler";
import { isErrorModel, isVoidType } from "@typespec/compiler";
import type {
  CanonicalHttpProperty,
  OperationHttpCanonicalization,
} from "@typespec/http-canonicalization";
import { useTsp } from "@typespec/emitter-framework";
import { getDocComment } from "../utils/doc-comments.jsx";
import { getHttpVerbAttribute, getRouteTemplate } from "../utils/http-helpers.js";
import { TypeExpression } from "./type-expression.jsx";
import type { RequestModelInfo } from "./request-models.jsx";

export interface ControllerActionProps {
  /** The canonicalized HTTP operation to generate an action method for. */
  operation: OperationHttpCanonicalization;
  /** The name of the business logic implementation field (e.g., "petStoreImpl"). */
  implFieldName: string;
  /** Request model info if this operation uses a synthetic request model. */
  requestModel?: RequestModelInfo;
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
 * Gets the literal default value string for a parameter type, if applicable.
 * Only returns values for compile-time constant types (string, number, bool).
 * Arrays/tuples are NOT valid C# parameter defaults.
 */
function getLiteralDefaultValue(type: Type): string | undefined {
  switch (type.kind) {
    case "String":
      return `"${type.value}"`;
    case "StringTemplate": {
      if (type.stringValue !== undefined) {
        return `"${type.stringValue}"`;
      }
      // Try to resolve the template by concatenating span values
      let resolved = "";
      for (const span of type.spans) {
        if (span.isInterpolated) {
          // The interpolated value could be a ModelProperty reference
          let spanType = span.type;
          if (spanType.kind === "ModelProperty") {
            spanType = spanType.type;
          }
          const spanDefault = getLiteralDefaultValue(spanType);
          if (spanDefault === undefined) return undefined;
          // Strip quotes from the resolved value
          resolved += spanDefault.replace(/^"|"$/g, "");
        } else {
          resolved += span.type.value;
        }
      }
      return `"${resolved}"`;
    }
    case "Number":
      return type.valueAsString;
    case "Boolean":
      return type.value ? "true" : "false";
    default:
      return undefined;
  }
}

/**
 * Checks if a parameter has a literal default value (i.e., its type is a literal).
 */
function hasLiteralDefault(type: Type): boolean {
  return getLiteralDefaultValue(type) !== undefined;
}

/**
 * Determines the success HTTP status code and whether the response has a body.
 * Checks the original return type for @statusCode properties.
 */
function getSuccessStatusCode(operation: OperationHttpCanonicalization): { statusCode: number | undefined; hasBody: boolean } {
  const returnType = operation.sourceType.returnType;
  
  // Check direct model response
  if (returnType.kind === "Model") {
    return analyzeResponseModel(returnType);
  }
  
  // Check union responses - find the first non-error success response
  if (returnType.kind === "Union") {
    for (const variant of returnType.variants.values()) {
      const vt = variant.type;
      if (isVoidType(vt)) continue;
      if (vt.kind === "Model") {
        // Skip models with @error decorator or error-range status codes
        const result = analyzeResponseModel(vt);
        if (result.statusCode !== undefined && result.statusCode >= 400) continue;
        return result;
      }
    }
  }

  const hasReturnValue = !isVoidType(returnType);
  return { statusCode: hasReturnValue ? 200 : 204, hasBody: hasReturnValue };
}

function analyzeResponseModel(model: import("@typespec/compiler").Model): { statusCode: number | undefined; hasBody: boolean } {
  let statusCode: number | undefined;
  let bodyProps = 0;
  
  for (const prop of model.properties.values()) {
    // Check for @statusCode property
    if (prop.name === "statusCode") {
      // The type might be a literal number
      if (prop.type.kind === "Number") {
        statusCode = prop.type.value;
      }
      continue;
    }
    bodyProps++;
  }

  // Model with only @statusCode and no body props → no body
  // But if the model has an indexer (Record<T>), it IS a body
  if (bodyProps === 0 && !model.indexer) {
    return { statusCode: statusCode ?? 204, hasBody: false };
  }
  
  return { statusCode, hasBody: true };
}

/**
 * Renders an ASP.NET controller action method for an HTTP operation.
 */
export function ControllerAction(props: ControllerActionProps): Children {
  const { $ } = useTsp();
  const namePolicy = cs.useCSharpNamePolicy();
  const opName = namePolicy.getName(props.operation.name, "class-method");
  const verb = getHttpVerbAttribute(props.operation.method);
  const route = getRouteTemplate(props.operation.path);
  const isGet = props.operation.method === "get";

  // Map all HTTP parameters (path, query, header) to C# method parameters
  type ParamInfo = { name: string; type: Children; attributes?: string[]; optional?: boolean; default?: Children };
  const pathParams: ParamInfo[] = [];
  const queryHeaderParams: ParamInfo[] = [];
  for (const p of props.operation.requestParameters.properties) {
    if (p.property.isContentTypeProperty) continue;
    const isOptional = p.property.sourceType.optional;
    const literalDefault = getLiteralDefaultValue(p.property.sourceType.type);
    if (p.kind === "path") {
      const attr = getBindingAttribute(p);
      pathParams.push({
        name: namePolicy.getName(p.property.sourceType.name, "parameter"),
        type: (<TypeExpression type={p.property.sourceType.type} />) as Children,
        attributes: attr ? [attr] : undefined,
        optional: isOptional,
        default: literalDefault,
      });
    } else if (p.kind === "query" || p.kind === "header") {
      const attr = getBindingAttribute(p);
      queryHeaderParams.push({
        name: namePolicy.getName(p.property.sourceType.name, "parameter"),
        type: (<TypeExpression type={p.property.sourceType.type} />) as Children,
        attributes: attr ? [attr] : undefined,
        optional: isOptional,
        default: literalDefault,
      });
    }
  }
  // Required params (no default) first, then params with defaults
  const sortByDefault = (a: ParamInfo, b: ParamInfo) => {
    const aHasDefault = a.default !== undefined || a.optional;
    const bHasDefault = b.default !== undefined || b.optional;
    if (aHasDefault === bHasDefault) return 0;
    return aHasDefault ? 1 : -1;
  };
  // Default: path params, then query/header params (sorted by default presence)
  let parameters: ParamInfo[] = [
    ...pathParams,
    ...queryHeaderParams.sort(sortByDefault),
  ];

  // Add body parameter if present (but NOT for GET requests)
  const body = props.operation.requestParameters.body;
  let callArgs: string;
  const isMultipart = !isGet && body?.bodyKind === "multipart";
  const isBodyRoot = !isGet && body?.bodyKind === "single" && body.bodies.length > 0 &&
    props.operation.requestParameters.properties.some((p) => p.kind === "bodyRoot");
  const hasExplicitBody = !isGet && body?.bodyKind === "single" && body.bodies.length > 0 &&
    body.bodies[0].property !== undefined && !isBodyRoot;

  if (isGet) {
    // GET requests suppress body parameters entirely
    callArgs = parameters.map((p) => p.name).join(", ");
  } else if (isMultipart) {
    // Multipart body: don't add body as parameter — we'll create a MultipartReader in the method body
    callArgs = [...parameters.map((p) => p.name), "reader"].join(", ");
  } else if (isBodyRoot) {
    // @bodyRoot — the whole model is the body, no other HTTP params extracted
    parameters = [{ name: "body", type: (<TypeExpression type={body!.bodies[0].type.sourceType} />) as Children }];
    callArgs = "body";
  } else if (props.requestModel && body?.bodyKind === "single" && body.bodies.length > 0) {
    // Request model for spread body: path, body, query/header
    const bodyParam = { name: "body", type: props.requestModel.name as any as Children };
    parameters = [...pathParams, bodyParam, ...queryHeaderParams];
    // Call args: path params, then body property accesses, then query/header params
    const bodyType = body.bodies[0].type.sourceType;
    if (bodyType.kind === "Model") {
      const bodyArgs = Array.from(bodyType.properties.values()).map(p => {
        const propName = namePolicy.getName(p.name, "class-property");
        return `body.${propName}`;
      });
      const pathArgNames = pathParams.map(p => p.name);
      const queryArgNames = queryHeaderParams.map(p => p.name);
      callArgs = [...pathArgNames, ...bodyArgs, ...queryArgNames].join(", ");
    } else {
      callArgs = parameters.map((p) => p.name).join(", ");
    }
  } else if (hasExplicitBody) {
    parameters.push({
      name: "body",
      type: (<TypeExpression type={body!.bodies[0].type.sourceType} />) as Children,
      attributes: ["FromBody"],
    });
    callArgs = parameters.map((p) => p.name).join(", ");
  } else if (body?.bodyKind === "single" && body.bodies.length > 0) {
    parameters.push({
      name: "body",
      type: (<TypeExpression type={body.bodies[0].type.sourceType} />) as Children,
      attributes: ["FromBody"],
    });
    callArgs = parameters.map((p) => p.name).join(", ");
  } else {
    callArgs = parameters.map((p) => p.name).join(", ");
  }

  // Determine the success status code from the response
  const { statusCode, hasBody } = getSuccessStatusCode(props.operation);

  // Determine response type for ProducesResponseType attribute
  const returnType = props.operation.sourceType.returnType;
  let responseStatusCode = hasBody ? "OK" : "NoContent";
  let responseTypeExpr: Children | undefined = undefined;

  if (hasBody) {
    if (returnType.kind === "Union") {
      for (const variant of returnType.variants.values()) {
        const vt = variant.type;
        if (isVoidType(vt)) continue;
        if (vt.kind === "Model") {
          try { if (isErrorModel($.program, vt)) continue; } catch {}
          if (vt.name?.toLowerCase() === "error") continue;
        }
        responseTypeExpr = (<TypeExpression type={vt} />) as Children;
        break;
      }
    } else if (!isVoidType(returnType)) {
      responseTypeExpr = (<TypeExpression type={returnType} />) as Children;
    }
  }

  const attributes: Children[] = [
    code`[${verb}]`,
    code`[Route("${route}")]`,
  ];
  if (isMultipart) {
    attributes.push(code`[Consumes("multipart/form-data")]`);
  }
  if (responseTypeExpr) {
    attributes.push(code`[ProducesResponseType((int)HttpStatusCode.${responseStatusCode}, Type = typeof(${responseTypeExpr}))]`);
  } else {
    attributes.push(code`[ProducesResponseType((int)HttpStatusCode.${responseStatusCode}, Type = typeof(void))]`);
  }

  // Generate the method body
  let methodBody: Children;
  if (isMultipart) {
    // Multipart body: parse boundary and create MultipartReader
    const implCall = hasBody
      ? code`var result = await ${props.implFieldName}.${opName}Async(${callArgs});${"\n"}return ${responseStatusCode === "Accepted" ? "Accepted" : "Ok"}(result);`
      : code`await ${props.implFieldName}.${opName}Async(${callArgs});${"\n"}return ${responseStatusCode === "NoContent" ? "NoContent" : "Ok"}();`;
    methodBody = code`var boundary = Request.GetMultipartBoundary();
if (boundary == null)
{
   return BadRequest("Request missing multipart boundary");
}


var reader = new MultipartReader(boundary, Request.Body);
${implCall}`;
  } else {
    // Non-multipart: generate the return statement based on status code
    if (!hasBody && statusCode === 202) {
      methodBody = code`await ${props.implFieldName}.${opName}Async(${callArgs});${"\n"}return Accepted();`;
    } else if (!hasBody) {
      methodBody = code`await ${props.implFieldName}.${opName}Async(${callArgs});${"\n"}return NoContent();`;
    } else if (statusCode === 202) {
      methodBody = code`var result = await ${props.implFieldName}.${opName}Async(${callArgs});${"\n"}return Accepted(result);`;
    } else if (statusCode !== undefined && statusCode !== 200) {
      methodBody = code`var result = await ${props.implFieldName}.${opName}Async(${callArgs});${"\n"}return StatusCode(${statusCode}, result);`;
    } else {
      methodBody = code`var result = await ${props.implFieldName}.${opName}Async(${callArgs});${"\n"}return Ok(result);`;
    }
  }

  return (
    <cs.Method
      name={opName}
      async
      virtual
      public
      returns={code`Task<IActionResult>`}
      parameters={parameters}
      attributes={attributes}
      doc={getDocComment($, props.operation.sourceType)}
    >
      {methodBody}
    </cs.Method>
  );
}
