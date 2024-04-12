import { numericRanges } from "./checker.js";
import { typespecTypeToJson } from "./decorator-utils.js";
import { compilerAssert } from "./diagnostics.js";
import { Numeric } from "./numeric.js";
import { isValue } from "./type-utils.js";
import type {
  ArrayValue,
  Diagnostic,
  MarshalledValue,
  Model,
  NumericValue,
  ObjectValue,
  Tuple,
  Type,
  Value,
} from "./types.js";

export function tryMarshallTypeForJS<T extends Type | Value>(type: T): MarshalledValue<T> {
  if (isValue(type)) {
    return marshallTypeForJS(type, undefined);
  }
  return type as any;
}

/** Legacy version that will cast models to object literals and tuple to tuple literals */
export function marshallTypeForJSWithLegacyCast<T extends Value | Model | Tuple>(
  entity: T,
  valueConstraint: Type
): [MarshalledValue<T> | undefined, readonly Diagnostic[]] {
  if ("kind" in entity) {
    return typespecTypeToJson(entity, entity) as any;
  } else {
    return [marshallTypeForJS(entity, valueConstraint) as any, []];
  }
}
export function marshallTypeForJS<T extends Value>(
  type: T,
  valueConstraint: Type | undefined
): MarshalledValue<T> {
  switch (type.valueKind) {
    case "BooleanValue":
    case "StringValue":
      return type.value as any;
    case "NumericValue":
      return numericValueToJs(type, valueConstraint) as any;
    case "ObjectValue":
      return objectValueToJs(type) as any;
    case "ArrayValue":
      return arrayValueToJs(type) as any;
    case "EnumValue":
      return type.value as any;
    case "NullValue":
      return null as any;
    case "ScalarValue":
      return type as any;
  }
}

function canNumericConstraintBeJsNumber(type: Type | undefined): boolean {
  if (type === undefined) return true;
  switch (type.kind) {
    case "Scalar":
      return numericRanges[type.name as keyof typeof numericRanges]?.[2].isJsNumber;
    case "Union":
      return [...type.variants.values()].every((x) => canNumericConstraintBeJsNumber(x.type));
    default:
      return true;
  }
}

function numericValueToJs(type: NumericValue, valueConstraint: Type | undefined): number | Numeric {
  const canBeANumber = canNumericConstraintBeJsNumber(valueConstraint);
  if (canBeANumber) {
    const asNumber = type.value.asNumber();
    compilerAssert(
      asNumber !== null,
      `Numeric value '${type.value.toString()}' is not a able to convert to a number without loosing precision.`
    );
    return asNumber;
  }
  return type.value;
}

function objectValueToJs(type: ObjectValue) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of type.properties) {
    result[key] = marshallTypeForJS(value.value, undefined);
  }
  return result;
}
function arrayValueToJs(type: ArrayValue) {
  return type.values.map((x) => marshallTypeForJS(x, undefined));
}
