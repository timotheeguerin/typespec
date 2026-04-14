import { code, refkey as ayRefkey, type Children, type Refkey } from "@alloy-js/core";
import { Reference } from "@alloy-js/csharp";
import { getTypeName, isVoidType, type Scalar, type Type, type Union } from "@typespec/compiler";
import type { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";

export interface TypeExpressionProps {
  type: Type;
}

/**
 * Renders a C# type expression for a given TypeSpec type.
 * Uses the server-specific scalar mapping (e.g., `DateTime` for `plainDate`,
 * `string` for `url`) which differs from the emitter-framework's client defaults.
 */
export function TypeExpression(props: TypeExpressionProps): Children {
  if (props.type.kind === "Union") {
    const nullableType = getNullableUnionInnerType(props.type);
    if (nullableType) {
      return code`${(<TypeExpression type={nullableType} />)}?`;
    }
  }

  const { $ } = useTsp();

  if (isDeclaration($, props.type)) {
    return <Reference refkey={serverRefkey(props.type)} />;
  }

  if ($.scalar.is(props.type)) {
    return getServerScalarExpression($, props.type);
  } else if ($.array.is(props.type)) {
    return code`${(<TypeExpression type={props.type.indexer.value} />)}[]`;
  } else if ($.record.is(props.type)) {
    return code`IDictionary<string, ${(<TypeExpression type={props.type.indexer.value} />)}>`;
  } else if ($.literal.isString(props.type)) {
    return code`string`;
  } else if ($.literal.isNumeric(props.type)) {
    return Number.isInteger(props.type.value) ? code`int` : code`double`;
  } else if ($.literal.isBoolean(props.type)) {
    return code`bool`;
  } else if (isVoidType(props.type)) {
    return code`void`;
  }

  throw new Error(
    `Unsupported type for TypeExpression: ${props.type.kind} (${getTypeName(props.type)})`,
  );
}

// --- Refkey helpers ---

const refKeyPrefix = Symbol.for("http-server-csharp");

export function serverRefkey(...args: unknown[]): Refkey {
  if (args.length === 0) {
    return ayRefkey();
  }
  return ayRefkey(refKeyPrefix, ...args);
}

// --- Nullable union helper ---

function getNullableUnionInnerType(u: Union): Type | undefined {
  const { $ } = useTsp();
  const isNull = (type: Type) => type === $.intrinsic.null || type === $.intrinsic.void;

  if (Array.from(u.variants.values()).some((v) => isNull(v.type))) {
    const left = Array.from(u.variants.values()).filter((v) => !isNull(v.type));
    if (left.length === 0) {
      return $.intrinsic.void;
    } else if (left.length === 1) {
      return left[0].type;
    } else {
      return $.union.create({
        name: u.name,
        variants: left,
      });
    }
  }
  return undefined;
}

// --- Scalar mapping ---

/**
 * Server-specific scalar mapping table. Differences from emitter-framework defaults:
 * - `plainDate` → `DateTime` (not `DateOnly`)
 * - `plainTime` → `DateTime` (not `TimeOnly`)
 * - `url` → `string` (not `Uri`)
 * - `numeric` → `object` (not `decimal`)
 * - `safeint` → `long` (not `int`)
 */
const serverScalarMap = new Map<string, string>([
  ["string", "string"],
  ["boolean", "bool"],
  ["bytes", "byte[]"],
  ["int8", "SByte"],
  ["uint8", "Byte"],
  ["int16", "Int16"],
  ["uint16", "UInt16"],
  ["int32", "int"],
  ["uint32", "UInt32"],
  ["integer", "long"],
  ["int64", "long"],
  ["uint64", "UInt64"],
  ["safeint", "long"],
  ["float", "double"],
  ["float32", "float"],
  ["float64", "double"],
  ["numeric", "object"],
  ["decimal", "decimal"],
  ["decimal128", "decimal"],
  ["plainDate", "DateTime"],
  ["plainTime", "DateTime"],
  ["utcDateTime", "DateTimeOffset"],
  ["offsetDateTime", "DateTimeOffset"],
  ["duration", "TimeSpan"],
  ["url", "string"],
  ["void", "void"],
  ["null", "null"],
  ["unknown", "object"],
  ["never", "object"],
]);

function getServerScalarExpression($: Typekit, type: Scalar): string {
  if ($.scalar.isUtcDateTime(type) || $.scalar.extendsUtcDateTime(type)) {
    return "DateTimeOffset";
  }

  const stdBase = $.scalar.getStdBase(type as Scalar);
  const baseName = stdBase ? stdBase.name : (type as Scalar).name;
  return serverScalarMap.get(baseName) ?? "object";
}

// --- Declaration check ---

function isDeclaration($: Typekit, type: Type): boolean {
  switch (type.kind) {
    case "Namespace":
    case "Interface":
    case "Enum":
    case "Operation":
    case "EnumMember":
      return true;
    case "UnionVariant":
      return false;
    case "Model":
      if ($.array.is(type) || $.record.is(type)) {
        return false;
      }
      return true;
    case "Union":
      return Boolean(type.name);
    default:
      return false;
  }
}
