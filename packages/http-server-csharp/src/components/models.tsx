import { For, type Children } from "@alloy-js/core";
import { isStdNamespace, type Model } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { ClassDeclaration } from "@typespec/emitter-framework/csharp";
import { CSharpFile } from "./csharp-file.jsx";

export interface ModelsProps {
  /** If true, emit JSON serialization attributes on model properties. */
  jsonAttributes?: boolean;
}

/**
 * Iterates all models in the TypeSpec program and emits C# class declarations.
 * Each model is emitted in its own source file under the models directory.
 */
export function Models(props: ModelsProps): Children {
  const { $ } = useTsp();
  const models = getServiceModels($);

  return (
    <For each={models}>
      {(model) => (
        <CSharpFile path={`${model.name}.cs`}>
          <ClassDeclaration type={model} public partial jsonAttributes={props.jsonAttributes ?? true} />
        </CSharpFile>
      )}
    </For>
  );
}

/**
 * Retrieves all models from the program that should be emitted.
 * Filters out built-in types, array types, record types, and error models.
 */
function getServiceModels($: ReturnType<typeof useTsp>["$"]): Model[] {
  const models: Model[] = [];
  const globalNs = $.program.getGlobalNamespaceType();

  for (const model of globalNs.models.values()) {
    if (shouldEmitModel($, model)) {
      models.push(model);
    }
  }

  for (const ns of globalNs.namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    collectModelsFromNamespace($, ns, models);
  }

  return models;
}

function collectModelsFromNamespace(
  $: ReturnType<typeof useTsp>["$"],
  ns: any,
  models: Model[],
): void {
  for (const model of ns.models?.values() ?? []) {
    if (shouldEmitModel($, model) && !models.includes(model)) {
      models.push(model);
    }
  }
  for (const childNs of ns.namespaces?.values() ?? []) {
    collectModelsFromNamespace($, childNs, models);
  }
}

function shouldEmitModel($: ReturnType<typeof useTsp>["$"], model: Model): boolean {
  if (!model.name || model.name === "") return false;
  if ($.array.is(model)) return false;
  if ($.record.is(model)) return false;
  return true;
}
