import { Output, render } from "@alloy-js/core";
import { describe, expect, it } from "vitest";
import { JsonConverters } from "./json-converters.jsx";

function findFileContent(output: any, pathSuffix: string): string | undefined {
  function search(dir: any): string | undefined {
    for (const item of dir.contents) {
      if ("contents" in item && typeof item.contents === "string" && item.path.endsWith(pathSuffix)) {
        return item.contents;
      }
      if ("contents" in item && Array.isArray(item.contents)) {
        const found = search(item);
        if (found) return found;
      }
    }
    return undefined;
  }
  return search(output);
}

describe("JsonConverters", () => {
  it("renders TimeSpanDurationConverter", () => {
    const output = render(<Output><JsonConverters /></Output>);
    const content = findFileContent(output, "TimeSpanDurationConverter.cs");
    expect(content).toBeDefined();
    expect(content).toContain("TimeSpanDurationConverter");
  });

  it("renders Base64UrlJsonConverter", () => {
    const output = render(<Output><JsonConverters /></Output>);
    const content = findFileContent(output, "Base64UrlJsonConverter.cs");
    expect(content).toBeDefined();
    expect(content).toContain("Base64UrlJsonConverter");
  });

  it("renders HttpServiceExceptionFilter", () => {
    const output = render(<Output><JsonConverters /></Output>);
    const content = findFileContent(output, "HttpServiceExceptionFilter.cs");
    expect(content).toBeDefined();
    expect(content).toContain("HttpServiceExceptionFilter");
  });
});
