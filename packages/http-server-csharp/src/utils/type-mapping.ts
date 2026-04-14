import type { IntrinsicScalarName } from "@typespec/compiler";

export type ExtendedIntrinsicScalarName = IntrinsicScalarName | "unixTimestamp32";

export interface CSharpScalarType {
  /** C# type name (e.g., "int", "string", "DateTimeOffset") */
  name: string;
  /** C# namespace (e.g., "System") */
  namespace: string;
  /** Whether this is a built-in system type */
  isBuiltIn: boolean;
  /** Whether this is a value type (struct/primitive) */
  isValueType: boolean;
}

/** Maps TypeSpec intrinsic scalar names to their C# equivalents. */
export const scalarMap: ReadonlyMap<ExtendedIntrinsicScalarName, CSharpScalarType> = new Map<
  ExtendedIntrinsicScalarName,
  CSharpScalarType
>([
  ["bytes", { name: "byte[]", namespace: "System", isBuiltIn: true, isValueType: false }],
  ["int8", { name: "SByte", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["uint8", { name: "Byte", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["int16", { name: "Int16", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["uint16", { name: "UInt16", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["int32", { name: "int", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["uint32", { name: "UInt32", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["integer", { name: "long", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["int64", { name: "long", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["uint64", { name: "UInt64", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["safeint", { name: "long", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["float", { name: "double", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["float64", { name: "double", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["float32", { name: "float", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["string", { name: "string", namespace: "System", isBuiltIn: true, isValueType: false }],
  ["boolean", { name: "bool", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["plainDate", { name: "DateTime", namespace: "System", isBuiltIn: true, isValueType: true }],
  [
    "utcDateTime",
    { name: "DateTimeOffset", namespace: "System", isBuiltIn: true, isValueType: true },
  ],
  [
    "offsetDateTime",
    { name: "DateTimeOffset", namespace: "System", isBuiltIn: true, isValueType: true },
  ],
  [
    "unixTimestamp32",
    { name: "DateTimeOffset", namespace: "System", isBuiltIn: true, isValueType: true },
  ],
  ["plainTime", { name: "DateTime", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["duration", { name: "TimeSpan", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["numeric", { name: "object", namespace: "System", isBuiltIn: true, isValueType: false }],
  ["url", { name: "string", namespace: "System", isBuiltIn: true, isValueType: false }],
  ["decimal", { name: "decimal", namespace: "System", isBuiltIn: true, isValueType: true }],
  ["decimal128", { name: "decimal", namespace: "System", isBuiltIn: true, isValueType: true }],
]);

/** Well-known C# types used for unknown/record mappings. */
export const unknownCSharpType: CSharpScalarType = {
  name: "JsonNode",
  namespace: "System.Text.Json.Nodes",
  isBuiltIn: false,
  isValueType: false,
};

export const recordCSharpType: CSharpScalarType = {
  name: "JsonObject",
  namespace: "System.Text.Json.Nodes",
  isBuiltIn: false,
  isValueType: false,
};

export const voidCSharpType: CSharpScalarType = {
  name: "void",
  namespace: "System",
  isBuiltIn: true,
  isValueType: false,
};

export enum CollectionType {
  ISet = "ISet",
  ICollection = "ICollection",
  IEnumerable = "IEnumerable",
  Array = "[]",
}

/** Resolves a collection type option string to the CollectionType enum. */
export function resolveCollectionType(option?: string): CollectionType {
  switch (option) {
    case "enumerable":
      return CollectionType.IEnumerable;
    case "array":
    default:
      return CollectionType.Array;
  }
}

/** Imprecise scalar names that warrant a diagnostic. */
export const impreciseScalars: ReadonlySet<string> = new Set([
  "numeric",
  "integer",
  "float",
]);
