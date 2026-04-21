import { code, For, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { isStdNamespace, type Enum } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { getDocComment } from "../utils/doc-comments.jsx";
import { findServiceNamespace, getSubNamespaceParts } from "../utils/namespace-utils.js";
import { CSharpFile } from "./csharp-file.jsx";
import { serverRefkey } from "./type-expression.jsx";

export interface EnumsProps {}

/**
 * Iterates all enums in the TypeSpec program and emits C# enum declarations.
 * Each enum is emitted in its own source file with JSON serialization attributes.
 */
export function Enums(_props: EnumsProps): Children {
  const { $ } = useTsp();
  const enums = getServiceEnums($);
  const globalNs = $.program.getGlobalNamespaceType();
  const serviceNs = findServiceNamespace(globalNs);

  return (
    <For each={enums}>
      {(en) => {
        const members = Array.from(en.members.entries());
        const namePolicy = cs.useCSharpNamePolicy();
        const subNsParts = getSubNamespaceParts(en.namespace, serviceNs);

        const enumDecl = (
          <>
            {code`[JsonConverter(typeof(JsonStringEnumConverter))]`}
            {"\n"}
            <cs.EnumDeclaration name={namePolicy.getName(en.name, "enum")} public refkey={serverRefkey(en)}>
              <For each={members} joiner={",\n"}>
                {([key, value]) => {
                  const memberName = namePolicy.getName(key, "enum-member");
                  const hasExplicitValue = typeof value.value === "string";
                  return (
                    <>
                      <cs.DocWhen doc={getDocComment($, value)} />
                      {hasExplicitValue && code`[JsonStringEnumMemberName("${value.value}")]`}
                      {hasExplicitValue && "\n"}
                      <cs.EnumMember name={memberName} />
                    </>
                  );
                }}
              </For>
            </cs.EnumDeclaration>
          </>
        );

        // Wrap in sub-namespace if the enum is in a sub-namespace
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
