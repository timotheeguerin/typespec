import { code, For, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { isStdNamespace, type Enum, type Union } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { getDocComment } from "../utils/doc-comments.jsx";
import { findServiceNamespace, getSubNamespaceParts } from "../utils/namespace-utils.js";
import { CSharpFile } from "./csharp-file.jsx";
import { serverRefkey } from "./type-expression.jsx";

/**
 * Iterates all enums in the TypeSpec program and emits C# enum declarations.
 * Each enum is emitted in its own source file with JSON serialization attributes.
 * Also emits named string unions as C# enums.
 */
export function Enums(): Children {
  const { $ } = useTsp();
  const enums = getServiceEnums($);
  const unionEnums = getServiceUnionEnums($);
  const globalNs = $.program.getGlobalNamespaceType();
  const serviceNs = findServiceNamespace(globalNs);

  return (
    <>
      <For each={enums}>
        {(en) => {
          const members = Array.from(en.members.entries());
          const namePolicy = cs.useCSharpNamePolicy();
          const subNsParts = getSubNamespaceParts(en.namespace, serviceNs);

          const enumDecl = (
            <>
              {code`[JsonConverter(typeof(JsonStringEnumConverter))]`}
              <hbr />
              <cs.EnumDeclaration
                name={namePolicy.getName(en.name, "enum")}
                public
                refkey={serverRefkey(en)}
                doc={getDocComment($, en)}
              >
                <For each={members} comma hardline>
                  {([key, value]) => {
                    const memberName = namePolicy.getName(key, "enum-member");
                    const serializedValue = typeof value.value === "string" ? value.value : key;
                    return (
                      <>
                        <cs.DocWhen doc={getDocComment($, value)} />
                        {code`[JsonStringEnumMemberName("${serializedValue}")]`}
                        <hbr />
                        <cs.EnumMember name={memberName} />
                      </>
                    );
                  }}
                </For>
              </cs.EnumDeclaration>
            </>
          );

          const wrappedContent = subNsParts.reduceRight<Children>(
            (content, nsPart) => <cs.Namespace name={nsPart}>{content}</cs.Namespace>,
            enumDecl,
          );

          return (
            <CSharpFile
              path={`${en.name}.cs`}
              using={["System.Text.Json", "System.Text.Json.Serialization"]}
            >
              {wrappedContent}
            </CSharpFile>
          );
        }}
      </For>
      <For each={unionEnums}>
        {(union) => {
          const namePolicy = cs.useCSharpNamePolicy();
          const enumName = namePolicy.getName(union.name!, "enum");
          const members = getUnionEnumMembers(union);
          const subNsParts = getSubNamespaceParts(union.namespace, serviceNs);

          const enumDecl = (
            <>
              {code`[JsonConverter(typeof(JsonStringEnumConverter))]`}
              <hbr />
              <cs.EnumDeclaration
                name={enumName}
                public
                refkey={serverRefkey(union)}
                doc={getDocComment($, union)}
              >
                <For each={members} comma hardline>
                  {({ name, value, variant }) => {
                    const memberName = namePolicy.getName(name, "enum-member");
                    return (
                      <>
                        <cs.DocWhen doc={getDocComment($, variant)} />
                        {code`[JsonStringEnumMemberName("${value}")]`}
                        <hbr />
                        <cs.EnumMember name={memberName} refkey={serverRefkey(union, name)} />
                      </>
                    );
                  }}
                </For>
              </cs.EnumDeclaration>
            </>
          );

          const wrappedContent = subNsParts.reduceRight<Children>(
            (content, nsPart) => <cs.Namespace name={nsPart}>{content}</cs.Namespace>,
            enumDecl,
          );

          return (
            <CSharpFile
              path={`${union.name}.cs`}
              using={["System.Text.Json", "System.Text.Json.Serialization"]}
            >
              {wrappedContent}
            </CSharpFile>
          );
        }}
      </For>
    </>
  );
}

function getServiceEnums($: ReturnType<typeof useTsp>["$"]): Enum[] {
  const enums: Enum[] = [];
  const globalNs = $.program.getGlobalNamespaceType();

  for (const en of globalNs.enums.values()) {
    if (en.name) {
      enums.push(en);
    }
  }
  for (const ns of globalNs.namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    collectEnumsFromNamespace(ns, enums);
  }
  return enums;
}

function collectEnumsFromNamespace(ns: any, enums: Enum[]): void {
  for (const en of ns.enums?.values() ?? []) {
    if (en.name && !enums.includes(en)) {
      enums.push(en);
    }
  }
  for (const childNs of ns.namespaces?.values() ?? []) {
    collectEnumsFromNamespace(childNs, enums);
  }
}

/**
 * Returns true if a named union can be represented as a C# enum.
 * Requires: named union, every named variant has a string value,
 * and optionally one unnamed scalar `string` variant (open/extensible).
 */
export function isUnionEnum(union: Union): boolean {
  if (!union.name) return false;

  const variants = Array.from(union.variants.values());
  let hasNamedStringVariant = false;

  for (const variant of variants) {
    // Allow a single open string scalar variant (extensible union)
    if (variant.type.kind === "Scalar" && variant.type.name === "string") {
      continue;
    }
    // Named variant with a string literal value
    if (variant.type.kind === "String" && variant.name && typeof variant.name === "string") {
      hasNamedStringVariant = true;
      continue;
    }
    // Any other variant type means it's not a simple enum
    return false;
  }

  return hasNamedStringVariant;
}

/** Gets the named string variants of a union-as-enum (skipping the open `string` variant). */
export function getUnionEnumMembers(
  union: Union,
): { name: string; value: string; variant: import("@typespec/compiler").UnionVariant }[] {
  const members: {
    name: string;
    value: string;
    variant: import("@typespec/compiler").UnionVariant;
  }[] = [];
  for (const variant of union.variants.values()) {
    if (variant.type.kind === "String" && variant.name && typeof variant.name === "string") {
      members.push({ name: variant.name, value: variant.type.value, variant });
    }
  }
  return members;
}

/** Collects named unions that qualify as C# enums from the program. */
function getServiceUnionEnums($: ReturnType<typeof useTsp>["$"]): Union[] {
  const unions: Union[] = [];
  const globalNs = $.program.getGlobalNamespaceType();

  for (const union of globalNs.unions.values()) {
    if (isUnionEnum(union)) {
      unions.push(union);
    }
  }
  for (const ns of globalNs.namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    collectUnionEnumsFromNamespace(ns, unions);
  }
  return unions;
}

function collectUnionEnumsFromNamespace(ns: any, unions: Union[]): void {
  for (const union of ns.unions?.values() ?? []) {
    if (isUnionEnum(union) && !unions.includes(union)) {
      unions.push(union);
    }
  }
  for (const childNs of ns.namespaces?.values() ?? []) {
    collectUnionEnumsFromNamespace(childNs, unions);
  }
}
