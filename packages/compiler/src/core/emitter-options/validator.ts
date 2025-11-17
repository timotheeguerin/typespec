import { getPattern } from "../../lib/decorators.js";
import { Program } from "../program.js";
import { isArrayModelType } from "../type-utils.js";
import type { ArrayModelType, Model, Scalar, StdTypeName, Type } from "../types.js";

export interface ValidationError {
  code: string;
  message: string;
  target: string[];
}

export function validateEmitterOptions(
  program: Program,
  value: unknown,
  type: Type,
): readonly ValidationError[] {
  switch (type.kind) {
    case "Model":
      if (isArrayModelType(program, type)) {
        return validateArray(program, value, type);
      }
      return validateModel(program, value, type);
    case "Scalar":
      return validateBuiltinScalar(value, type as any, []);
  }
  return [];
}

function validateModel(program: Program, value: unknown, type: Model): readonly ValidationError[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [
      {
        code: "type-mismatch",
        message: `Expected type object`,
        target: [],
      },
    ];
  }

  const errors: ValidationError[] = [];
  const valObj = value as Record<string, unknown>;
  for (const propType of type.properties.values()) {
    const propValue = valObj[propType.name];
    const propErrors = validateEmitterOptions(program, propValue, propType.type);
    for (const err of propErrors) {
      errors.push({
        ...err,
        target: [propType.name, ...err.target],
      });
    }
    const pattern = getPattern(program, propType);
    if (pattern) {
      if (typeof propValue !== "string" || !new RegExp(pattern).test(propValue)) {
        errors.push({
          code: "invalid-pattern",
          message: `${propValue} does not match pattern /${pattern}/`,
          target: [propType.name],
        });
      }
    }
  }
  return errors;
}

function validateArray(
  program: Program,
  value: unknown,
  type: ArrayModelType,
): readonly ValidationError[] {
  if (!Array.isArray(value)) {
    return [
      {
        code: "type-mismatch",
        message: `Expected type array`,
        target: [],
      },
    ];
  }
  const errors: ValidationError[] = [];
  for (let i = 0; i < value.length; i++) {
    const itemErrors = validateEmitterOptions(program, value[i], type.indexer.value);
    for (const err of itemErrors) {
      errors.push({
        ...err,
        target: [i.toString(), ...err.target],
      });
    }
  }
  return errors;
}

function validateBuiltinScalar(
  value: unknown,
  type: Scalar & { name: StdTypeName },
  target: string[],
): readonly ValidationError[] {
  console.log("Validate", type.name, value);
  switch (type.name) {
    case "string":
      return assertType(value, "string", target);
    case "boolean":
      return assertType(value, "boolean", target);
    case "int8":
    case "int16":
    case "int32":
    case "uint8":
    case "uint16":
    case "uint32":
    case "float32":
    case "float64":
      return assertType(value, "number", target);
    case "bytes":
      if (value instanceof Uint8Array) {
        return [];
      }
      return [{ code: "type-mismatch", message: `Expected type bytes`, target }];
    default:
      return [
        {
          code: "unsupported",
          message: `${type.name} is not supported for emitter options.`,
          target,
        },
      ];
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
