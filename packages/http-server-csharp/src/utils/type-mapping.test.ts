import { describe, expect, it } from "vitest";
import {
  CollectionType,
  impreciseScalars,
  recordCSharpType,
  resolveCollectionType,
  scalarMap,
  unknownCSharpType,
  voidCSharpType,
} from "./type-mapping.js";

describe("scalarMap", () => {
  it("maps int32 to int", () => {
    const result = scalarMap.get("int32");
    expect(result).toBeDefined();
    expect(result!.name).toBe("int");
    expect(result!.isValueType).toBe(true);
  });

  it("maps int64 to long", () => {
    expect(scalarMap.get("int64")!.name).toBe("long");
  });

  it("maps float64 to double", () => {
    expect(scalarMap.get("float64")!.name).toBe("double");
  });

  it("maps float32 to float", () => {
    expect(scalarMap.get("float32")!.name).toBe("float");
  });

  it("maps string to string", () => {
    const result = scalarMap.get("string");
    expect(result!.name).toBe("string");
    expect(result!.isValueType).toBe(false);
  });

  it("maps boolean to bool", () => {
    expect(scalarMap.get("boolean")!.name).toBe("bool");
    expect(scalarMap.get("boolean")!.isValueType).toBe(true);
  });

  it("maps utcDateTime to DateTimeOffset", () => {
    expect(scalarMap.get("utcDateTime")!.name).toBe("DateTimeOffset");
  });

  it("maps offsetDateTime to DateTimeOffset", () => {
    expect(scalarMap.get("offsetDateTime")!.name).toBe("DateTimeOffset");
  });

  it("maps duration to TimeSpan", () => {
    expect(scalarMap.get("duration")!.name).toBe("TimeSpan");
  });

  it("maps bytes to byte[]", () => {
    expect(scalarMap.get("bytes")!.name).toBe("byte[]");
    expect(scalarMap.get("bytes")!.isValueType).toBe(false);
  });

  it("maps decimal to decimal", () => {
    expect(scalarMap.get("decimal")!.name).toBe("decimal");
  });

  it("maps decimal128 to decimal", () => {
    expect(scalarMap.get("decimal128")!.name).toBe("decimal");
  });

  it("maps url to string", () => {
    expect(scalarMap.get("url")!.name).toBe("string");
  });

  it("maps numeric to object (imprecise)", () => {
    expect(scalarMap.get("numeric")!.name).toBe("object");
    expect(scalarMap.get("numeric")!.isValueType).toBe(false);
  });

  it("maps safeint to long", () => {
    expect(scalarMap.get("safeint")!.name).toBe("long");
  });

  it("maps plainDate to DateTime", () => {
    expect(scalarMap.get("plainDate")!.name).toBe("DateTime");
  });

  it("maps plainTime to DateTime", () => {
    expect(scalarMap.get("plainTime")!.name).toBe("DateTime");
  });
});

describe("well-known types", () => {
  it("unknownCSharpType is JsonNode", () => {
    expect(unknownCSharpType.name).toBe("JsonNode");
    expect(unknownCSharpType.namespace).toBe("System.Text.Json.Nodes");
  });

  it("recordCSharpType is JsonObject", () => {
    expect(recordCSharpType.name).toBe("JsonObject");
    expect(recordCSharpType.namespace).toBe("System.Text.Json.Nodes");
  });

  it("voidCSharpType is void", () => {
    expect(voidCSharpType.name).toBe("void");
    expect(voidCSharpType.namespace).toBe("System");
  });
});

describe("resolveCollectionType", () => {
  it("returns Array by default", () => {
    expect(resolveCollectionType()).toBe(CollectionType.Array);
    expect(resolveCollectionType("array")).toBe(CollectionType.Array);
  });

  it("returns IEnumerable for 'enumerable'", () => {
    expect(resolveCollectionType("enumerable")).toBe(CollectionType.IEnumerable);
  });

  it("falls back to Array for unknown values", () => {
    expect(resolveCollectionType("something-else")).toBe(CollectionType.Array);
  });
});

describe("impreciseScalars", () => {
  it("contains numeric, integer, float", () => {
    expect(impreciseScalars.has("numeric")).toBe(true);
    expect(impreciseScalars.has("integer")).toBe(true);
    expect(impreciseScalars.has("float")).toBe(true);
  });

  it("does not contain precise scalars", () => {
    expect(impreciseScalars.has("int32")).toBe(false);
    expect(impreciseScalars.has("float64")).toBe(false);
  });
});
