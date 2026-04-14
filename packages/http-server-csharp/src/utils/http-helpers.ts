import type { HttpOperation, HttpStatusCodesEntry } from "@typespec/http";

/**
 * Maps an HTTP verb to its ASP.NET Core attribute name.
 */
export function getHttpVerbAttribute(operation: HttpOperation): string {
  switch (operation.verb) {
    case "delete":
      return "HttpDelete";
    case "get":
      return "HttpGet";
    case "patch":
      return "HttpPatch";
    case "post":
      return "HttpPost";
    case "put":
      return "HttpPut";
    default:
      return "HttpGet";
  }
}

/**
 * Maps an HTTP status code to its ASP.NET Core `HttpStatusCode` enum member.
 */
export function getCSharpStatusCode(entry: HttpStatusCodesEntry): string | undefined {
  switch (entry) {
    case 200:
      return "HttpStatusCode.OK";
    case 201:
      return "HttpStatusCode.Created";
    case 202:
      return "HttpStatusCode.Accepted";
    case 204:
      return "HttpStatusCode.NoContent";
    default:
      return undefined;
  }
}

/**
 * Returns the ASP.NET Core controller return statement for a given HTTP status code.
 */
export function getControllerReturnStatement(status: HttpStatusCodesEntry, hasValue: boolean): string {
  if (typeof status === "number") {
    switch (status) {
      case 200:
        return hasValue ? "return Ok(result);" : "return Ok();";
      case 202:
        return hasValue ? "return Accepted(result);" : "return Accepted();";
      case 204:
        return "return NoContent();";
      default:
        return hasValue ? `return StatusCode(${status}, result);` : `return StatusCode(${status});`;
    }
  }
  return hasValue ? "return Ok(result);" : "return Ok();";
}

/**
 * Maps an HTTP operation parameter type to ASP.NET binding attribute.
 */
export function getParameterBindingAttribute(
  paramType: "path" | "query" | "header" | "cookie" | "body",
  paramName?: string,
): string | undefined {
  switch (paramType) {
    case "query":
      return paramName ? `[FromQuery(Name="${paramName}")]` : "[FromQuery]";
    case "header":
      return paramName ? `[FromHeader(Name="${paramName}")]` : "[FromHeader]";
    default:
      return undefined;
  }
}

/**
 * Extracts the route template from an HTTP operation path.
 * Converts TypeSpec path params to ASP.NET route params (e.g., `{id}`).
 */
export function getRouteTemplate(path: string): string {
  return path;
}
