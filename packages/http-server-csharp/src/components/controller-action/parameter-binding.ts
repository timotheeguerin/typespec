import type { Type } from "@typespec/compiler";
import type { CanonicalHttpProperty } from "@typespec/http-canonicalization";

/**
 * Maps a canonical HTTP property to an ASP.NET parameter binding attribute.
 */
export function getBindingAttribute(prop: CanonicalHttpProperty): string | undefined {
  switch (prop.kind) {
    case "path":
      return `FromRoute(Name="${prop.options.name}")`;
    case "query":
      return `FromQuery(Name="${prop.options.name}")`;
    case "header":
      return `FromHeader(Name="${prop.options.name}")`;
    default:
      return undefined;
  }
}

/**
 * Gets the literal default value string for a parameter type, if applicable.
 * Only returns values for compile-time constant types (string, number, bool).
 * Arrays/tuples are NOT valid C# parameter defaults.
 */
export function getLiteralDefaultValue(type: Type): string | undefined {
  switch (type.kind) {
    case "String":
      return `"${type.value}"`;
    case "StringTemplate": {
      if (type.stringValue !== undefined) {
        return `"${type.stringValue}"`;
      }
      // Try to resolve the template by concatenating span values
      let resolved = "";
      for (const span of type.spans) {
        if (span.isInterpolated) {
          // The interpolated value could be a ModelProperty reference
          let spanType = span.type;
          if (spanType.kind === "ModelProperty") {
            spanType = spanType.type;
          }
          const spanDefault = getLiteralDefaultValue(spanType);
          if (spanDefault === undefined) return undefined;
          // Strip quotes from the resolved value
          resolved += spanDefault.replace(/^"|"$/g, "");
        } else {
          resolved += span.type.value;
        }
      }
      return `"${resolved}"`;
    }
    case "Number":
      return type.valueAsString;
    case "Boolean":
      return type.value ? "true" : "false";
    default:
      return undefined;
  }
}

/**
 * Checks if a parameter has a literal default value (i.e., its type is a literal).
 */
export function hasLiteralDefault(type: Type): boolean {
  return getLiteralDefaultValue(type) !== undefined;
}
