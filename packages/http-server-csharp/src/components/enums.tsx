import { For, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Enum, Union } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { EnumDeclaration } from "@typespec/emitter-framework/csharp";

export interface EnumsProps {}

/**
 * Iterates all enums in the TypeSpec program and emits C# enum declarations.
 * Each enum is emitted in its own source file.
 */
export function Enums(_props: EnumsProps): Children {
  const { $ } = useTsp();
  const enums = getServiceEnums($);

  return (
    <For each={enums}>
      {(en) => (
        <cs.SourceFile path={`${en.name}.cs`}>
          <EnumDeclaration type={en} />
        </cs.SourceFile>
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
