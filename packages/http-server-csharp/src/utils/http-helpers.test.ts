import { describe, expect, it } from "vitest";
import {
  getControllerReturnStatement,
  getCSharpStatusCode,
  getHttpVerbAttribute,
  getParameterBindingAttribute,
  getRouteTemplate,
} from "./http-helpers.js";

describe("getHttpVerbAttribute", () => {
  it.each([
    ["delete", "HttpDelete"],
    ["get", "HttpGet"],
    ["patch", "HttpPatch"],
    ["post", "HttpPost"],
    ["put", "HttpPut"],
  ])("maps %s to %s", (verb, expected) => {
    expect(getHttpVerbAttribute({ verb } as any)).toBe(expected);
  });

  it("maps head to HttpHead", () => {
    expect(getHttpVerbAttribute({ verb: "head" } as any)).toBe("HttpHead");
  });

  it("defaults to HttpGet for unknown verbs", () => {
    expect(getHttpVerbAttribute({ verb: "trace" } as any)).toBe("HttpGet");
  });
});

describe("getCSharpStatusCode", () => {
  it("maps 200 to HttpStatusCode.OK", () => {
    expect(getCSharpStatusCode(200)).toBe("HttpStatusCode.OK");
  });

  it("maps 201 to HttpStatusCode.Created", () => {
    expect(getCSharpStatusCode(201)).toBe("HttpStatusCode.Created");
  });

  it("maps 202 to HttpStatusCode.Accepted", () => {
    expect(getCSharpStatusCode(202)).toBe("HttpStatusCode.Accepted");
  });

  it("maps 204 to HttpStatusCode.NoContent", () => {
    expect(getCSharpStatusCode(204)).toBe("HttpStatusCode.NoContent");
  });

  it("returns undefined for unmapped codes", () => {
    expect(getCSharpStatusCode(400)).toBeUndefined();
    expect(getCSharpStatusCode(500)).toBeUndefined();
  });
});

describe("getControllerReturnStatement", () => {
  it("returns Ok(result) for 200 with value", () => {
    expect(getControllerReturnStatement(200, true)).toBe("return Ok(result);");
  });

  it("returns Ok() for 200 without value", () => {
    expect(getControllerReturnStatement(200, false)).toBe("return Ok();");
  });

  it("returns NoContent() for 204", () => {
    expect(getControllerReturnStatement(204, true)).toBe("return NoContent();");
    expect(getControllerReturnStatement(204, false)).toBe("return NoContent();");
  });

  it("returns Accepted for 202", () => {
    expect(getControllerReturnStatement(202, true)).toBe("return Accepted(result);");
  });

  it("returns Created for 201", () => {
    expect(getControllerReturnStatement(201, true)).toBe('return Created("", result);');
    expect(getControllerReturnStatement(201, false)).toBe('return Created("", null);');
  });

  it("returns StatusCode for other codes", () => {
    expect(getControllerReturnStatement(404, false)).toBe("return StatusCode(404);");
  });

  it("returns Ok for status ranges", () => {
    expect(getControllerReturnStatement({ start: 200, end: 299 }, true)).toBe("return Ok(result);");
    expect(getControllerReturnStatement("*", false)).toBe("return Ok();");
  });
});

describe("getParameterBindingAttribute", () => {
  it("returns FromQuery for query params", () => {
    expect(getParameterBindingAttribute("query")).toBe("FromQuery");
  });

  it("returns FromQuery(Name=...) with name", () => {
    expect(getParameterBindingAttribute("query", "filter")).toBe('FromQuery(Name="filter")');
  });

  it("returns FromHeader for header params", () => {
    expect(getParameterBindingAttribute("header")).toBe("FromHeader");
  });

  it("returns FromBody for body params", () => {
    expect(getParameterBindingAttribute("body")).toBe("FromBody");
  });

  it("returns FromRoute for path params", () => {
    expect(getParameterBindingAttribute("path")).toBe("FromRoute");
    expect(getParameterBindingAttribute("path", "petId")).toBe('FromRoute(Name="petId")');
  });

  it("returns undefined for cookie params", () => {
    expect(getParameterBindingAttribute("cookie")).toBeUndefined();
  });
});

describe("getRouteTemplate", () => {
  it("passes through route templates", () => {
    expect(getRouteTemplate("/pets/{petId}")).toBe("/pets/{petId}");
    expect(getRouteTemplate("/items")).toBe("/items");
  });
});
