import type { Refkey } from "@alloy-js/core";
import { code, For, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import {
  isStdNamespace,
  type Enum,
  type Namespace as TspNamespace,
  type Type,
  type Union,
} from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { getDocComments } from "../../utils/doc-comments.jsx";
import { findServiceNamespace, getSubNamespaceParts } from "../../utils/namespace-utils.js";
import { CSharpFile } from "../csharp-file.jsx";
import { efRefkey } from "../type-expression/type-expression.jsx";

/** Normalized member info shared by both enums and union-enums. */
interface EnumMemberInfo {
  name: string;
  serializedValue: string;
  docSource: Type;
  memberRefkey?: Refkey;
}

/** Normalized enum info that abstracts over Enum and union-as-enum types. */
interface EnumInfo {
  name: string;
  type: Enum | Union;
  namespace: TspNamespace | undefined;
  members: EnumMemberInfo[];
}

function normalizeEnum(en: Enum): EnumInfo {
  return {
    name: en.name,
    type: en,
    namespace: en.namespace,
    members: Array.from(en.members.entries()).map(([key, value]) => ({
      name: key,
      serializedValue: typeof value.value === "string" ? value.value : key,
      docSource: value,
    })),
  };
}

function normalizeUnionEnum(union: Union): EnumInfo {
  return {
    name: union.name!,
    type: union,
    namespace: union.namespace,
    members: getUnionEnumMembers(union).map(({ name, value, variant }) => ({
      name,
      serializedValue: value,
      docSource: variant,
      memberRefkey: efRefkey(union, name),
    })),
  };
}

/**
 * Iterates all enums and union-enums in the TypeSpec program and emits C# enum declarations.
 * Each enum is emitted in its own source file with JSON serialization attributes.
 */
export function Enums(): Children {
  const { $ } = useTsp();
  const globalNs = $.program.getGlobalNamespaceType();
  const serviceNs = findServiceNamespace(globalNs);

  const allEnums: EnumInfo[] = [
    ...collectFromServiceNamespaces<Enum>(globalNs, "enums", (en) => !!en.name).map(normalizeEnum),
    ...collectFromServiceNamespaces<Union>(globalNs, "unions", isUnionEnum).map(normalizeUnionEnum),
  ];

  return (
    <For each={allEnums}>
      {(info) => {
        const namePolicy = cs.useCSharpNamePolicy();
        const subNsParts = getSubNamespaceParts(info.namespace, serviceNs);

        const enumDecl = (
          <>
            {code`[JsonConverter(typeof(JsonStringEnumConverter))]`}
            <hbr />
            <cs.EnumDeclaration
              name={namePolicy.getName(info.name, "enum")}
              public
              refkey={efRefkey(info.type)}
              doc={getDocComments($, info.type)}
            >
              <For each={info.members} comma hardline>
                {(member) => (
                  <>
                    <cs.DocWhen doc={getDocComments($, member.docSource)} />
                    {code`[JsonStringEnumMemberName("${member.serializedValue}")]`}
                    <hbr />
                    <cs.EnumMember
                      name={namePolicy.getName(member.name, "enum-member")}
                      refkey={member.memberRefkey}
                    />
                  </>
                )}
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
            path={`${info.name}.cs`}
            using={["System.Text.Json", "System.Text.Json.Serialization"]}
          >
            {wrappedContent}
          </CSharpFile>
        );
      }}
    </For>
  );
}

/**
 * Recursively collects items from the global namespace and all non-std child namespaces.
 * Replaces the per-type recursive traversal functions.
 */
function collectFromServiceNamespaces<T>(
  globalNs: TspNamespace,
  collectionKey: "enums" | "unions",
  filter: (item: T) => boolean,
): T[] {
  const items: T[] = [];
  const seen = new Set<T>();

  function walk(ns: TspNamespace): void {
    for (const item of (ns[collectionKey] as Map<string, T>)?.values() ?? []) {
      if (!seen.has(item) && filter(item)) {
        seen.add(item);
        items.push(item);
      }
    }
    for (const childNs of ns.namespaces?.values() ?? []) {
      if (isStdNamespace(childNs)) continue;
      walk(childNs);
    }
  }

  walk(globalNs);
  return items;
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
