import { createLibrary } from "@alloy-js/csharp";

/**
 * Library references for System.Text.Json.Serialization attributes.
 * Using createLibrary ensures proper `using` directive generation and
 * attribute name resolution (e.g., stripping "Attribute" suffix).
 */
export const JsonSerialization = createLibrary("System.Text.Json.Serialization", {
  JsonConverterAttribute: { kind: "class", members: {} },
  JsonPropertyNameAttribute: { kind: "class", members: {} },
  JsonStringEnumMemberNameAttribute: { kind: "class", members: {} },
  JsonStringEnumConverter: { kind: "class", members: {} },
});
