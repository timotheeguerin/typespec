import { refkey as ayRefkey, code, type Children, type Refkey } from "@alloy-js/core";
import type { Scalar, Type } from "@typespec/compiler";
import type { Typekit } from "@typespec/compiler/typekit";
import { getUniqueItems } from "@typespec/json-schema";
import { useTsp, Experimental_ComponentOverridesConfig } from "@typespec/emitter-framework";
import { TypeExpression as EfTypeExpression } from "@typespec/emitter-framework/csharp";
import { isUnionEnum } from "./enums.jsx";
import { useEmitterOptions } from "../context/emitter-options-context.js";
import { getAnonymousModelName } from "./models/index.jsx";

export interface TypeExpressionProps {
  type: Type;
}

/**
 * Wrapper around emitter-framework's TypeExpression that handles
 * additional type kinds the server emitter encounters.
 */
export function TypeExpression(props: TypeExpressionProps): Children {
  const { $ } = useTsp();
  const type = props.type;

  switch (type.kind) {
    case "Union":
      return resolveUnionType($, type);
    case "UnionVariant":
      // If this variant belongs to a union-as-enum, resolve to the parent enum type
      if (type.union && isUnionEnum(type.union)) {
        return code`${serverRefkey(type.union)}`;
      }
      return <TypeExpression type={type.type} />;
    case "Enum":
      try {
        return <EfTypeExpression type={type} />;
      } catch {
        return code`${type.name ?? "object"}`;
      }
    case "Tuple":
      // Tuple of values — use the type of the first element as array
      if (type.values.length > 0) {
        const { collectionType } = useEmitterOptions();
        if (collectionType === "enumerable") {
          return <>IEnumerable&lt;<TypeExpression type={type.values[0]} />&gt;</>;
        }
        return <><TypeExpression type={type.values[0]} />[]</>;
      }
      return code`object[]`;
    case "StringTemplate":
    case "String":
      return code`string`;
    case "Boolean":
      return code`bool`;
    case "Number":
      // Use double for non-integer values, int for integers
      return Number.isInteger(type.value) ? code`int` : code`double`;
    case "Intrinsic":
      if (type.name === "unknown") return code`object`;
      if (type.name === "void") return code`void`;
      if (type.name === "null") return code`object`;
      if (type.name === "never") return code`object`;
      return code`object`;
    case "TemplateParameter":
      return code`${(type.node as any)?.id?.sv ?? "T"}`;
    case "ModelProperty":
      return <TypeExpression type={type.type} />;
    case "Model":
      // Handle Record<T> → IDictionary<string, T> or JsonObject for Record<unknown>
      if ($.record.is(type)) {
        const valueType = type.indexer!.value;
        if (valueType.kind === "Intrinsic" && valueType.name === "unknown") {
          return code`JsonObject`;
        }
        return <>IDictionary&lt;string, <TypeExpression type={valueType} />&gt;</>;
      }
      // Handle Array<T> → T[] or ISet<T> if @uniqueItems, or IEnumerable<T> if collection-type is enumerable
      if ($.array.is(type)) {
        const elementType = type.indexer!.value;
        if (getUniqueItems($.program, type)) {
          return <>ISet&lt;<TypeExpression type={elementType} />&gt;</>;
        }
        const { collectionType } = useEmitterOptions();
        // Byte arrays always stay as T[] regardless of collection type
        const isByteArray = elementType.kind === "Scalar" && 
          (elementType.name === "uint8" || elementType.name === "int8" ||
           ($.scalar.getStdBase(elementType)?.name === "uint8") ||
           ($.scalar.getStdBase(elementType)?.name === "int8"));
        if (collectionType === "enumerable" && !isByteArray) {
          return <>IEnumerable&lt;<TypeExpression type={elementType} />&gt;</>;
        }
        return <><TypeExpression type={elementType} />[]</>;
      }
      // Handle anonymous models — use refkey to link to their generated class
      if (type.name === "" && getAnonymousModelName(type)) {
        return code`${serverRefkey(type)}`;
      }
      // Fall through to EF for regular models
      try {
        return <EfTypeExpression type={type} />;
      } catch {
        return code`${type.name ?? "object"}`;
      }
    case "Scalar":
      // Handle scalars - try EF first, fall back to our mapping
      try {
        return <EfTypeExpression type={type} />;
      } catch {
        return code`object`;
      }
    default:
      try {
        return <EfTypeExpression type={type} />;
      } catch {
        return code`object`;
      }
  }
}

function resolveUnionType($: Typekit, union: import("@typespec/compiler").Union): Children {
  // Named unions that qualify as enums should reference the enum type
  if (isUnionEnum(union)) {
    return code`${serverRefkey(union)}`;
  }

  const allVariants = Array.from(union.variants.values());
  // Check if null is present in the union
  const hasNull = allVariants.some(
    (v) => v.type.kind === "Intrinsic" && v.type.name === "null",
  );
  // Filter out null/void variants
  const variants = allVariants.filter(
    (v) => !(v.type.kind === "Intrinsic" && (v.type.name === "null" || v.type.name === "void")),
  );

  if (variants.length === 0) return code`object`;
  if (variants.length === 1) {
    if (hasNull && isValueType($, variants[0].type)) {
      return <><TypeExpression type={variants[0].type} />?</>;
    }
    return <TypeExpression type={variants[0].type} />;
  }

  // Check if all variants resolve to the same base kind
  const firstType = variants[0].type;
  const allSameKind = variants.every((v) => {
    if (v.type.kind !== firstType.kind) return false;
    if (v.type.kind === "Scalar" && firstType.kind === "Scalar") {
      const stdBase1 = $.scalar.getStdBase(v.type) ?? v.type;
      const stdBase2 = $.scalar.getStdBase(firstType) ?? firstType;
      return stdBase1.name === stdBase2.name;
    }
    // String/Boolean/Number literals of same kind → same base type
    if (v.type.kind === "String" || v.type.kind === "Boolean" || v.type.kind === "Number") {
      return true;
    }
    return v.type === firstType;
  });

  if (allSameKind) return <TypeExpression type={firstType} />;

  // For mixed types, use object
  return code`object`;
}

/** Returns true if the type maps to a C# value type (needs ? for nullable). */
function isValueType($: Typekit, type: import("@typespec/compiler").Type): boolean {
  if (type.kind === "Scalar") {
    const base = $.scalar.getStdBase(type) ?? type;
    const valueTypes = [
      "int8", "int16", "int32", "int64",
      "uint8", "uint16", "uint32", "uint64",
      "safeint", "integer",
      "float16", "float32", "float64", "numeric", "decimal", "decimal128",
      "boolean",
    ];
    return valueTypes.includes(base.name);
  }
  if (type.kind === "Boolean" || type.kind === "Number") return true;
  if (type.kind === "Enum") return true;
  return false;
}

// --- Refkey helpers ---

// Must match the emitter-framework's C# refkey prefix so that references
// resolve to declarations created by ClassDeclaration / EnumDeclaration.
const refKeyPrefix = Symbol.for("emitter-framework:csharp");

export function serverRefkey(...args: unknown[]): Refkey {
  if (args.length === 0) {
    return ayRefkey();
  }
  return ayRefkey(refKeyPrefix, ...args);
}

// --- Server-specific scalar overrides ---

/**
 * Server-specific scalar overrides for TypeExpression.
 * Differences from EF defaults:
 * - `plainDate` → `DateTime` (not `DateOnly`)
 * - `plainTime` → `DateTime` (not `TimeOnly`)
 * - `url` → `string` (not `Uri`)
 * - Use CLR type names (SByte, Byte, Int16, etc.) instead of C# keywords
 * - `safeint` → `long` (not `int`)
 */
export function createServerScalarOverrides($: Typekit): Experimental_ComponentOverridesConfig {
  const overrides = new Experimental_ComponentOverridesConfig();

  const scalarOverrides: [Scalar, string][] = [
    // Date/time overrides
    [$.builtin.plainDate, "DateTime"],
    [$.builtin.plainTime, "DateTime"],
    [$.builtin.url, "string"],
    // CLR type name overrides (match old emitter output)
    [$.builtin.int8, "SByte"],
    [$.builtin.uint8, "Byte"],
    [$.builtin.int16, "Int16"],
    [$.builtin.uint16, "UInt16"],
    [$.builtin.uint32, "UInt32"],
    [$.builtin.uint64, "UInt64"],
    [$.builtin.safeInt, "long"],
  ];

  for (const [scalar, csType] of scalarOverrides) {
    overrides.forType(scalar, {
      reference: (props) => code`${csType}` as Children,
    });
  }

  return overrides;
}
