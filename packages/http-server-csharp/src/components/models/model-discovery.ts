import { isStdNamespace, isTemplateDeclaration, type Model, type Namespace as TspNamespace, type Type } from "@typespec/compiler";
import type { useTsp } from "@typespec/emitter-framework";
import { assignAnonymousName } from "./anonymous-models.js";

/**
 * Retrieves all models from the program that should be emitted.
 * Includes namespace-level models AND models referenced by operations (template instantiations, anonymous models).
 */
export function getServiceModels($: ReturnType<typeof useTsp>["$"]): Model[] {
  const models: Model[] = [];
  const seen = new Set<Model>();
  const globalNs = $.program.getGlobalNamespaceType();

  function addModel(model: Model) {
    if (seen.has(model)) return;
    seen.add(model);
    if (shouldEmitModel($, model)) {
      models.push(model);
    }
  }

  // Collect from namespaces
  for (const model of globalNs.models.values()) {
    addModel(model);
  }
  for (const ns of globalNs.namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    collectModelsFromNamespace($, ns, models, seen);
  }

  // Walk operations to discover referenced models (template instantiations, etc.)
  const visited = new Set<Type>();
  for (const ns of globalNs.namespaces.values()) {
    if (isStdNamespace(ns)) continue;
    discoverReferencedModels($, ns, addModel, visited);
  }

  // Walk all collected model properties to discover anonymous sub-models
  // Need to iterate over a snapshot since addModel may modify the list
  const modelsSnapshot = [...models];
  for (const model of modelsSnapshot) {
    for (const prop of model.properties.values()) {
      discoverModelsInType($, prop.type, addModel, visited);
    }
    if (model.baseModel) {
      discoverModelsInType($, model.baseModel, addModel, visited);
    }
  }

  return models;
}

/** Walks operations in a namespace to discover referenced model types. */
function discoverReferencedModels(
  $: ReturnType<typeof useTsp>["$"],
  ns: any,
  addModel: (m: Model) => void,
  visited: Set<Type>,
): void {
  for (const op of ns.operations?.values() ?? []) {
    // Name anonymous response models contextually
    nameAnonymousResponse(op, op.interface?.name ?? ns.name);
    discoverModelsInType($, op.returnType, addModel, visited);
    for (const param of op.parameters?.properties?.values() ?? []) {
      discoverModelsInType($, param.type, addModel, visited);
    }
  }
  for (const iface of ns.interfaces?.values() ?? []) {
    for (const op of iface.operations?.values() ?? []) {
      nameAnonymousResponse(op, iface.name);
      discoverModelsInType($, op.returnType, addModel, visited);
      for (const param of op.parameters?.properties?.values() ?? []) {
        discoverModelsInType($, param.type, addModel, visited);
      }
    }
  }
  for (const childNs of ns.namespaces?.values() ?? []) {
    if (isStdNamespace(childNs)) continue;
    discoverReferencedModels($, childNs, addModel, visited);
  }
}

/** Assigns a contextual name to an anonymous response model: {InterfaceName}{OperationName}Response */
function nameAnonymousResponse(
  op: import("@typespec/compiler").Operation,
  containerName: string,
): void {
  const returnType = op.returnType;
  if (returnType.kind === "Model" && !returnType.name) {
    const opName = op.name.charAt(0).toUpperCase() + op.name.slice(1);
    const ctxName = containerName.charAt(0).toUpperCase() + containerName.slice(1);
    assignAnonymousName(returnType, `${ctxName}${opName}Response`);
  }
}

/** Recursively discovers models referenced by a type. */
function discoverModelsInType(
  $: ReturnType<typeof useTsp>["$"],
  type: Type,
  addModel: (m: Model) => void,
  visited: Set<Type>,
): void {
  if (visited.has(type)) return;
  visited.add(type);

  if (type.kind === "Model") {
    if ($.array.is(type)) {
      if (type.indexer?.value) {
        discoverModelsInType($, type.indexer.value, addModel, visited);
      }
    } else if (!$.record.is(type)) {
      addModel(type);
      for (const prop of type.properties.values()) {
        discoverModelsInType($, prop.type, addModel, visited);
      }
      if (type.baseModel) {
        discoverModelsInType($, type.baseModel, addModel, visited);
      }
      // Walk template arguments to discover inner types (e.g., HttpPart<Bar<Foo>> → Bar<Foo>)
      if (type.templateMapper) {
        for (const arg of type.templateMapper.args) {
          if (arg.entityKind === "Type") {
            discoverModelsInType($, arg, addModel, visited);
          }
        }
      }
    }
  } else if (type.kind === "Union") {
    for (const variant of type.variants.values()) {
      discoverModelsInType($, variant.type, addModel, visited);
    }
  }
}

function collectModelsFromNamespace(
  $: ReturnType<typeof useTsp>["$"],
  ns: any,
  models: Model[],
  seen: Set<Model>,
): void {
  for (const model of ns.models?.values() ?? []) {
    if (!seen.has(model) && shouldEmitModel($, model)) {
      seen.add(model);
      models.push(model);
    }
  }
  for (const childNs of ns.namespaces?.values() ?? []) {
    collectModelsFromNamespace($, childNs, models, seen);
  }
}

function shouldEmitModel($: ReturnType<typeof useTsp>["$"], model: Model): boolean {
  // Anonymous models are allowed — they get auto-generated names (Model0, Model1, ...)
  if (model.name === "") return true;
  if (!model.name) return false;
  if ($.array.is(model)) return false;
  if ($.record.is(model)) return false;
  // Skip template declarations (e.g. Foo<T>) — only emit instantiations (e.g. Foo<Toy>)
  if (isTemplateDeclaration(model)) return false;
  // Skip HttpPart<T> template instantiations — multipart wrapper types, not emitted models
  if (model.name === "HttpPart" && model.templateMapper) return false;
  // Skip multipart body container models (all properties are HttpPart<T>)
  if (isMultipartBodyContainer(model)) return false;
  // Template instantiations are always emittable if they have a name
  if (model.templateMapper) return true;
  // Skip HTTP response-only models (OkResponse, NoContentResponse, etc.)
  if (model.namespace && isStdNamespace(model.namespace)) return false;
  // Skip models from @typespec/http namespace (Response<T>, etc.)
  const nsName = getFullNamespaceName(model.namespace);
  if (nsName.startsWith("TypeSpec.Http") || nsName.startsWith("TypeSpec.Rest")) return false;
  return true;
}

/** Detects models whose properties are all HttpPart<T> — these are multipart body containers, not emitted as C# types. */
function isMultipartBodyContainer(model: Model): boolean {
  if (model.properties.size === 0) return false;
  for (const prop of model.properties.values()) {
    if (isHttpPartType(prop.type)) continue;
    return false;
  }
  return true;
}

/** Checks if a type is HttpPart<T> or an array of HttpPart<T>. */
function isHttpPartType(type: Type): boolean {
  if (type.kind !== "Model") return false;
  // Direct HttpPart<T>
  if (type.name === "HttpPart" && type.templateMapper) return true;
  // Array of HttpPart<T> — check indexer value
  if (type.indexer?.value) {
    return isHttpPartType(type.indexer.value);
  }
  return false;
}

export function getFullNamespaceName(ns: TspNamespace | undefined): string {
  const parts: string[] = [];
  let current = ns;
  while (current && current.name) {
    parts.unshift(current.name);
    current = current.namespace;
  }
  return parts.join(".");
}
