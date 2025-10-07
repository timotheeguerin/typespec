import type { Model, Scalar, StdTypeName, Type } from "../types.js";

interface ValidationError {
  code: string;
  message: string;
  target: string[];
}
export function validateJs(value: unknown, type: Type): readonly ValidationError[] {}

function validateModel(value: unknown, type: Model): readonly ValidationError[] {}

function validateBuiltinScalar(
  value: unknown,
  type: Scalar & { name: StdTypeName },
  target: string[],
): readonly ValidationError[] {
  switch (type.name) {
    case "string":
      return assertType(value, "string", target);
    case "boolean":
      return assertType(value, "boolean", target);
    case "int8":
    case "int16":
    case "int32":
    case "int64":
    case "uint8":
    case "uint16":
    case "uint32":
    case "uint64":
    case "float32":
    case "float64":
      return assertType(value, "number", target);
    case "bytes":
      if (value instanceof Uint8Array) {
        return [];
      }
      return [{ code: "type-mismatch", message: `Expected type bytes`, target }];
  }
}

function assertType(
  value: unknown,
  expectedType: string,
  target: string[],
): readonly ValidationError[] {
  if (typeof value === expectedType) {
    return [];
  }
  return [{ code: "type-mismatch", message: `Expected type ${expectedType}`, target }];
}
