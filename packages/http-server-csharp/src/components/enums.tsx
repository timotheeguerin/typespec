import { code, For, type Children } from "@alloy-js/core";
import { isStdNamespace, type Enum } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { EnumDeclaration } from "@typespec/emitter-framework/csharp";
import { CSharpFile } from "./csharp-file.jsx";

export interface EnumsProps {}

/**
 * Iterates all enums in the TypeSpec program and emits C# enum declarations.
 * Each enum is emitted in its own source file with JSON serialization attributes.
 */
export function Enums(_props: EnumsProps): Children {
  const { $ } = useTsp();
  const enums = getServiceEnums($);

  return (
    <For each={enums}>
      {(en) => (
        <CSharpFile
          path={`${en.name}.cs`}
          using={["System.Text.Json", "System.Text.Json.Serialization"]}
        >
          {code`[JsonConverter(typeof(JsonStringEnumConverter))]`}
          {"\n"}
          <EnumDeclaration type={en} public />
        </CSharpFile>
      )}
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
