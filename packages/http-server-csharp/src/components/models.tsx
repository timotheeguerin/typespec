import { code, For, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { getDoc, getFriendlyName, getMinValue, isErrorModel, isStdNamespace, isTemplateDeclaration, isVoidType, type Model, type ModelProperty, type Namespace as TspNamespace, type Program, type Union } from "@typespec/compiler";
import { isStatusCode, isHeader, getHeaderFieldName } from "@typespec/http";
import { getUniqueItems } from "@typespec/json-schema";
import { useTsp } from "@typespec/emitter-framework";
import { useEmitterOptions } from "../context/emitter-options-context.js";
import { CSharpFile } from "./csharp-file.jsx";
import { isUnionEnum, getUnionEnumMembers } from "./enums.jsx";
import { serverRefkey, TypeExpression } from "./type-expression.jsx";
import { getDocComment } from "../utils/doc-comments.jsx";
import { getPropertyAttributes } from "../utils/attributes.jsx";
import { findServiceNamespace, getSubNamespaceParts } from "../utils/namespace-utils.js";

export interface ModelsProps {}

/** Map from anonymous models to their generated names (Model0, Model1, ...) */
const anonymousModelNames = new Map<Model, string>();
let anonymousModelCounter = 0;

/** Resets anonymous model state — call before each compilation. */
export function resetAnonymousModels(): void {
  anonymousModelNames.clear();
  anonymousModelCounter = 0;
}

/** Gets the generated name for an anonymous model, or undefined if it's not anonymous. */
export function getAnonymousModelName(model: Model): string | undefined {
  return anonymousModelNames.get(model);
}

export function assignAnonymousName(model: Model, contextualName?: string): string {
  let name = anonymousModelNames.get(model);
  if (!name) {
    name = contextualName ?? `Model${anonymousModelCounter++}`;
    anonymousModelNames.set(model, name);
  }
  return name;
}

/** Pre-assigns contextual names to anonymous response models before the diagnostic pre-pass. */
export function preAssignAnonymousResponseNames(
  interfaces: import("@typespec/compiler").Interface[],
): void {
  for (const iface of interfaces) {
    for (const [, op] of iface.operations) {
      const returnType = op.returnType;
      if (returnType.kind === "Model" && !returnType.name) {
        const opName = op.name.charAt(0).toUpperCase() + op.name.slice(1);
        const ctxName = iface.name.charAt(0).toUpperCase() + iface.name.slice(1);
        assignAnonymousName(returnType, `${ctxName}${opName}Response`);
      }
    }
  }
}

const modelUsings = [
  "System",
  "System.Collections.Generic",
  "System.Text.Json",
  "System.Text.Json.Serialization",
  "TypeSpec.Helpers.JsonConverters",
  "TypeSpec.Helpers",
];

/**
 * Iterates all models in the TypeSpec program and emits C# class declarations.
 * Each model is emitted in its own source file under the models directory.
 */
export function Models(_props: ModelsProps): Children {
  const { $ } = useTsp();
  const models = getServiceModels($);
  const globalNs = $.program.getGlobalNamespaceType();
  const serviceNs = findServiceNamespace(globalNs);

  return (
    <For each={models}>
      {(model) => {
        const needsJsonNodes = modelNeedsJsonNodes($, model);
        const usings = needsJsonNodes ? [...modelUsings, "System.Text.Json.Nodes"] : modelUsings;
        const modelName = getModelEmitName($.program, model);
        const subNsParts = getSubNamespaceParts(model.namespace, serviceNs);
        
        const modelContent = <ServerClassDeclaration type={model} emitName={modelName} />;
        
        // Wrap in sub-namespace if the model is in a sub-namespace of the service
        const wrappedContent = subNsParts.reduceRight<Children>(
          (content, nsPart) => <cs.Namespace name={nsPart}>{content}</cs.Namespace>,
          modelContent,
        );
        
        return (
          <CSharpFile path={`${modelName}.cs`} using={usings}>
            {wrappedContent}
          </CSharpFile>
        );
      }}
    </For>
  );
}

/** Gets the name to use when emitting a model — handles friendly names, template instantiations, and anonymous models. */
function getModelEmitName(program: import("@typespec/compiler").Program, model: Model): string {
  // Check for @friendlyName first
  const friendlyName = getFriendlyName(program, model);
  if (friendlyName) return friendlyName;

  // Anonymous models get sequential names
  if (!model.name || model.name === "") {
    return assignAnonymousName(model);
  }

  // For template instantiations, concatenate template args with the base name
  if (model.templateMapper && model.templateMapper.args.length > 0) {
    const argNames = model.templateMapper.args
      .filter((arg): arg is import("@typespec/compiler").Type => arg.entityKind === "Type")
      .map((arg) => {
        if (arg.kind === "Model" || arg.kind === "Scalar") return arg.name;
        return undefined;
      })
      .filter(Boolean)
      .map((name) => name!.charAt(0).toUpperCase() + name!.slice(1));
    if (argNames.length > 0) {
      return `${model.name}${argNames.join("")}`;
    }
  }

  return model.name;
}

/**
 * Server-specific class declaration that matches the old emitter output:
 * - No `required` keyword
 * - No `[JsonPropertyName]` attributes
 * - No nullable `?` suffix on reference types (string, byte[], etc.)
 */
function ServerClassDeclaration(props: { type: Model; emitName?: string }): Children {
  const { $ } = useTsp();
  const namePolicy = cs.useCSharpNamePolicy();
  const className = namePolicy.getName(props.emitName ?? props.type.name, "class");
  const refkeys = serverRefkey(props.type);

  const isError = isErrorModel($.program, props.type);

  const properties = Array.from(props.type.properties.entries()).filter(
    ([_, p]) => !isVoidType(p.type),
  );

  // Determine base type
  let baseType: Children | undefined;
  if (props.type.baseModel) {
    baseType = <TypeExpression type={props.type.baseModel} />;
  } else if (isError) {
    baseType = "HttpServiceException";
  }

  // Generate constructor for error models
  const errorConstructor = isError
    ? getErrorConstructor($.program, props.type, className)
    : undefined;

  // For error models with base model, check if base is also an error (child constructor)
  const isChildError = isError && props.type.baseModel && isErrorModel($.program, props.type.baseModel);
  const hasChildConstructor = isError && props.type.derivedModels && props.type.derivedModels.length > 0;

  return (
    <cs.ClassDeclaration
      name={className}
      refkey={refkeys}
      public
      partial
      baseType={baseType}
      doc={getDocComment($, props.type)}
    >
      {errorConstructor}
      {errorConstructor ? <hbr /> : undefined}
      {hasChildConstructor ? code`
        public ${className}(int statusCode, object? value = null, Dictionary<string, string>? headers = default)
            : base(statusCode, value, headers)
        {
        }
      ` : undefined}
      {hasChildConstructor ? <hbr /> : undefined}
      <For each={properties} doubleHardline>
        {([_, property]) => {
          // Skip statusCode properties for error models
          if (isError && isStatusCode($.program, property)) return undefined;
          return <ServerProperty type={property} errorClassName={isError ? className : undefined} baseModel={props.type.baseModel} />;
        }}
      </For>
    </cs.ClassDeclaration>
  );
}

/**
 * Server-specific property that matches old emitter output.
 * No `required`, no `[JsonPropertyName]`, no nullable `?` for reference types.
 */
function ServerProperty(props: { type: ModelProperty; errorClassName?: string; baseModel?: Model }): Children {
  const { $ } = useTsp();
  const namePolicy = cs.useCSharpNamePolicy();
  const propType = props.type.type;
  const attrs = getPropertyAttributes($.program, props.type);

  // Determine property name, handling error model conflicts
  let propName = props.type.name;
  if (props.errorClassName) {
    const csharpPropName = namePolicy.getName(propName, "class-property");
    if (csharpPropName === props.errorClassName || isDuplicateExceptionName(csharpPropName)) {
      propName = csharpPropName === "Value" ? "ValueName" : `${csharpPropName}Prop`;
    }
  }

  // Add JsonPropertyName if the C# name differs from the original TypeSpec name
  const csharpName = namePolicy.getName(propName, "class-property");
  if (csharpName !== props.type.name) {
    attrs.unshift(code`[JsonPropertyName("${props.type.name}")]`);
  }

  // Check if this property overrides a base model property (discriminator pattern)
  const isOverride = props.baseModel ? hasPropertyInChain(props.baseModel, props.type.name) : false;

  // Check for union variant type (e.g., kind: PetType.Dog) — used as enum member initializer
  const unionVariantInit = getUnionVariantInitializer(propType, namePolicy);

  // Check for enum default value (e.g., variety: WolfBreed = WolfBreed.dire)
  const enumDefaultInit = getEnumDefaultInitializer(props.type, namePolicy);

  // For error models, properties get values from constructor, not as literals
  const isErrorProp = !!props.errorClassName;

  // Check for literal values (the type itself is a literal)
  const { collectionType } = useEmitterOptions();
  const literalInfo = isErrorProp ? undefined : (unionVariantInit ?? getLiteralValue(propType, collectionType));
  // Check for default values
  const defaultValue = isErrorProp ? undefined : (enumDefaultInit ?? (props.type.defaultValue ? getDefaultValueString(props.type.defaultValue) : undefined));
  
  const initializer = literalInfo ?? defaultValue;
  const isLiteralOnly = literalInfo !== undefined && defaultValue === undefined;

  // Check if the property type is a non-integer enum (C# enums can only be integers)
  const isFloatEnum = $.enum.is(propType) && hasNonIntegerValues(propType as import("@typespec/compiler").Enum);

  // For error model properties with literal types, use the scalar base type
  // But not for union variant types — those should resolve to the enum type
  const resolveToScalar = (isLiteralOnly && !unionVariantInit) || isErrorProp;
  const resolvedType = resolveToScalar ? getScalarForLiteral(propType) : propType;
  const needsNullable = props.type.optional && (isFloatEnum || isValueType($, resolvedType));

  // Check if this is a @uniqueItems array → ISet<T>
  const isUniqueItems = getUniqueItems($.program, props.type);
  const isArrayType = propType.kind === "Model" && $.array.is(propType);

  let typeExpr: Children;
  if (isFloatEnum) {
    typeExpr = code`double`;
  } else if (isUniqueItems && isArrayType && propType.indexer?.value) {
    typeExpr = <>ISet&lt;<TypeExpression type={propType.indexer.value} />&gt;</>;
  } else {
    typeExpr = <TypeExpression type={resolveToScalar ? getScalarForLiteral(propType) : propType} />;
  }

  return (
    <cs.Property
      name={propName}
      type={typeExpr}
      public
      new={isOverride}
      nullable={needsNullable}
      doc={getDocComment($, props.type)}
      attributes={attrs.length > 0 ? attrs : undefined}
      get
      set={!isLiteralOnly}
      initializer={initializer}
    />
  );
}

/** Gets the string representation of a literal or default value. */
function getLiteralValue(type: import("@typespec/compiler").Type, collectionType?: "array" | "enumerable"): string | undefined {
  if (type.kind === "String") return `"${type.value}"`;
  if (type.kind === "Boolean") return type.value ? "true" : "false";
  if (type.kind === "Number") return String(type.value);
  if (type.kind === "StringTemplate" && (type as any).stringValue !== undefined) {
    return `"${(type as any).stringValue}"`;
  }
  if (type.kind === "Tuple") {
    const elements = type.values.map((v) => getLiteralValue(v));
    if (elements.every((e) => e !== undefined)) {
      if (collectionType === "enumerable") {
        // Determine the C# element type from the first value
        const firstType = type.values[0];
        const csElementType = firstType.kind === "Number"
          ? (Number.isInteger(firstType.value) ? "int" : "double")
          : firstType.kind === "String" ? "string"
          : firstType.kind === "Boolean" ? "bool" : "object";
        return `new List<${csElementType}> {${elements.join(", ")}}`;
      }
      // Array mode: use C# 12 collection expression
      return `[${elements.join(", ")}]`;
    }
  }
  return undefined;
}

/** Gets the string representation of a Value (for defaultValue). */
function getDefaultValueString(value: import("@typespec/compiler").Value): string | undefined {
  if (value.valueKind === "StringValue") return `"${value.value}"`;
  if (value.valueKind === "BooleanValue") return value.value ? "true" : "false";
  if (value.valueKind === "NumericValue") return String(value.value);
  return undefined;
}

/**
 * For a union variant type (e.g., kind: PetType.Dog), returns a C# enum member
 * initializer like "PetType.Dog". Returns undefined if not a union-enum variant.
 */
function getUnionVariantInitializer(
  type: import("@typespec/compiler").Type,
  namePolicy: ReturnType<typeof cs.createCSharpNamePolicy>,
): string | undefined {
  if (type.kind !== "UnionVariant") return undefined;
  const union = type.union;
  if (!union || !isUnionEnum(union)) return undefined;
  
  const enumName = namePolicy.getName(union.name!, "enum");
  const memberName = namePolicy.getName(String(type.name), "enum-member");
  return `${enumName}.${memberName}`;
}

/**
 * For a property with a default value that references an enum or union-enum member,
 * returns the C# enum member string like "WolfBreed.Dire".
 */
function getEnumDefaultInitializer(
  property: ModelProperty,
  namePolicy: ReturnType<typeof cs.createCSharpNamePolicy>,
): string | undefined {
  if (!property.defaultValue) return undefined;
  const dv = property.defaultValue;
  
  // Handle TypeSpec enum default values
  if (dv.valueKind === "EnumValue") {
    const enumType = dv.value.enum;
    if (enumType) {
      const enumName = namePolicy.getName(enumType.name, "enum");
      const memberName = namePolicy.getName(dv.value.name, "enum-member");
      return `${enumName}.${memberName}`;
    }
  }
  
  // Handle union-enum default values (StringValue matching a union variant)
  if (dv.valueKind === "StringValue" && property.type.kind === "Union" && isUnionEnum(property.type)) {
    const members = getUnionEnumMembers(property.type);
    const match = members.find(m => m.value === dv.value);
    if (match) {
      const enumName = namePolicy.getName(property.type.name!, "enum");
      const memberName = namePolicy.getName(match.name, "enum-member");
      return `${enumName}.${memberName}`;
    }
  }
  
  return undefined;
}

/** Checks if a property name exists anywhere in the model's base chain. */
function hasPropertyInChain(model: Model | undefined, propName: string): boolean {
  let current = model;
  while (current) {
    if (current.properties.has(propName)) return true;
    current = current.baseModel;
  }
  return false;
}

/** For literal types, get the underlying scalar type for the property declaration. */
function getScalarForLiteral(type: import("@typespec/compiler").Type): import("@typespec/compiler").Type {
  // Literal types don't have a .scalar reference in the compiler types
  // We just return the original type and let TypeExpression handle it
  return type;
}

/** Returns true if the enum has any non-integer member values (float enums can't be C# enums). */
function hasNonIntegerValues(en: import("@typespec/compiler").Enum): boolean {
  for (const member of en.members.values()) {
    if (typeof member.value === "number" && !Number.isInteger(member.value)) {
      return true;
    }
  }
  return false;
}

/** Returns true if the TypeSpec type maps to a C# value type (struct). */
function isValueType($: ReturnType<typeof useTsp>["$"], type: import("@typespec/compiler").Type): boolean {
  // Handle literal types
  if (type.kind === "Boolean" || type.kind === "Number") return true;
  if (type.kind === "String") return false;
  
  if ($.scalar.is(type)) {
    const baseName = $.scalar.getStdBase(type)?.name ?? type.name;
    const valueTypes = new Set([
      "int8", "int16", "int32", "int64",
      "uint8", "uint16", "uint32", "uint64",
      "safeint", "float32", "float64",
      "decimal", "decimal128",
      "boolean", "numeric", "integer", "float",
      "plainDate", "plainTime", "utcDateTime", "offsetDateTime",
      "duration", "unixTimestamp32",
    ]);
    return valueTypes.has(baseName);
  }
  if ($.enum.is(type)) return true;
  if (type.kind === "Union" && isUnionEnum(type as import("@typespec/compiler").Union)) return true;
  return false;
}

/** Returns true if any property of the model uses Record<T> (mapped to JsonObject). */
function modelNeedsJsonNodes($: ReturnType<typeof useTsp>["$"], model: Model): boolean {
  for (const prop of model.properties.values()) {
    if (prop.type.kind === "Model" && $.record.is(prop.type)) {
      // Only need JsonNodes for Record<unknown> (maps to JsonObject)
      const valueType = prop.type.indexer?.value;
      if (valueType?.kind === "Intrinsic" && valueType.name === "unknown") return true;
    }
  }
  return false;
}

/**
 * Retrieves all models from the program that should be emitted.
 * Includes namespace-level models AND models referenced by operations (template instantiations, anonymous models).
 */
function getServiceModels($: ReturnType<typeof useTsp>["$"]): Model[] {
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
  const visited = new Set<import("@typespec/compiler").Type>();
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
  visited: Set<import("@typespec/compiler").Type>,
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
  type: import("@typespec/compiler").Type,
  addModel: (m: Model) => void,
  visited: Set<import("@typespec/compiler").Type>,
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
  // Template instantiations are always emittable if they have a name
  if (model.templateMapper) return true;
  // Skip HTTP response-only models (OkResponse, NoContentResponse, etc.)
  if (model.namespace && isStdNamespace(model.namespace)) return false;
  // Skip models from @typespec/http namespace (Response<T>, etc.)
  const nsName = getFullNamespaceName(model.namespace);
  if (nsName.startsWith("TypeSpec.Http") || nsName.startsWith("TypeSpec.Rest")) return false;
  return true;
}

function getFullNamespaceName(ns: TspNamespace | undefined): string {
  const parts: string[] = [];
  let current = ns;
  while (current && current.name) {
    parts.unshift(current.name);
    current = current.namespace;
  }
  return parts.join(".");
}

// Exception property names that conflict with C# Exception class
const exceptionPropertyNames = [
  "value", "headers", "stacktrace", "source", "message",
  "innerexception", "hresult", "data", "targetsite", "helplink",
];

function isDuplicateExceptionName(name: string): boolean {
  return exceptionPropertyNames.includes(name.toLowerCase());
}

/** Gets all properties including inherited ones. */
function getAllProperties(program: Program, model: Model): ModelProperty[] {
  const props: ModelProperty[] = [];
  let current: Model | undefined = model;
  while (current) {
    for (const prop of current.properties.values()) {
      props.push(prop);
    }
    current = current.baseModel;
  }
  return props;
}

/** Gets the status code for an error model. */
function getErrorStatusCode(program: Program, model: Model): { value: string | number; requiresConstructorArgument?: boolean } | undefined {
  const allProps = getAllProperties(program, model);
  const statusCodeProp = allProps.find(p => isStatusCode(program, p));
  if (!statusCodeProp) return undefined;

  const type = statusCodeProp.type;
  if (type.kind === "Union") {
    return { value: statusCodeProp.name, requiresConstructorArgument: true };
  }
  if (type.kind === "Number") {
    return { value: type.value };
  }
  // Fall back to @minValue decorator
  const minVal = getMinValue(program, statusCodeProp);
  return { value: minVal ?? "default" };
}

/** Generates the constructor string for an error model. */
function getErrorConstructor(program: Program, model: Model, className: string): Children {
  const statusCode = getErrorStatusCode(program, model);
  const isChild = model.baseModel && isErrorModel(program, model.baseModel);
  const namePolicy = cs.createCSharpNamePolicy();

  // For child error models, only use own properties (not inherited)
  // For root error models, use all properties including inherited
  const props = isChild
    ? Array.from(model.properties.values())
    : getAllProperties(program, model);

  // Separate properties into required and optional/default
  const sortedProps = props
    .filter(p => !isStatusCode(program, p))
    .map(prop => {
      const defaultValue = prop.defaultValue ? getDefaultValueString(prop.defaultValue) : undefined;
      const literalValue = getLiteralValue(prop.type);
      return { prop, defaultValue: defaultValue ?? literalValue };
    })
    .sort((a, b) => {
      const aHasDefault = a.prop.optional || a.defaultValue !== undefined;
      const bHasDefault = b.prop.optional || b.defaultValue !== undefined;
      if (!aHasDefault && bHasDefault) return -1;
      if (aHasDefault && !bHasDefault) return 1;
      return 0;
    });

  const paramParts: string[] = [];
  const bodyParts: string[] = [];
  const headerParts: string[] = [];
  const valueParts: string[] = [];

  if (statusCode?.requiresConstructorArgument) {
    paramParts.push(`int ${statusCode.value}`);
  }

  for (const { prop, defaultValue } of sortedProps) {
    let propName = namePolicy.getName(prop.name, "class-property");
    if (propName === className || isDuplicateExceptionName(propName)) {
      propName = propName === "Value" ? "ValueName" : `${propName}Prop`;
    }

    const csharpType = getCSharpTypeString(program, prop.type);
    const defaultStr = defaultValue
      ? ` = ${defaultValue}`
      : prop.optional ? " = default" : "";
    paramParts.push(`${csharpType} ${prop.name}${defaultStr}`);
    bodyParts.push(`${propName} = ${prop.name};`);

    if (isHeader(program, prop)) {
      const headerName = getHeaderFieldName(program, prop);
      headerParts.push(`{"${headerName}", ${prop.name}}`);
    } else {
      valueParts.push(`${prop.name} = ${prop.name}`);
    }
  }

  const statusCodeStr = statusCode?.value ?? 400;

  // Build base call arguments
  const baseArgs: string[] = [String(statusCodeStr)];
  if (headerParts.length > 0) {
    baseArgs.push(`headers: new() { ${headerParts.join(", ")} }`);
  }
  if (valueParts.length > 0) {
    baseArgs.push(`value: new { ${valueParts.join(", ")} }`);
  }

  const baseCall = isChild
    ? `base(${statusCodeStr})`
    : `base(${baseArgs.join(", ")})`;

  const params = paramParts.join(", ");
  const body = bodyParts.join("\n");

  return code`
    public ${className}(${params})
        : ${baseCall}
    {
        ${body}
    }
  `;
}

/** Gets a simple C# type name string for a TypeSpec type. */
function getCSharpTypeString(program: Program, type: import("@typespec/compiler").Type): string {
  if (type.kind === "Scalar") {
    const scalarMap: Record<string, string> = {
      string: "string", int8: "sbyte", int16: "short", int32: "int", int64: "long",
      uint8: "byte", uint16: "ushort", uint32: "uint", uint64: "ulong",
      float32: "float", float64: "double", boolean: "bool",
      plainDate: "DateOnly", plainTime: "TimeOnly", utcDateTime: "DateTimeOffset",
      offsetDateTime: "DateTimeOffset", duration: "TimeSpan", bytes: "byte[]",
      decimal: "decimal", decimal128: "decimal", url: "Uri", safeint: "long",
    };
    return scalarMap[type.name] ?? type.name;
  }
  if (type.kind === "String") return "string";
  if (type.kind === "Boolean") return "bool";
  if (type.kind === "Number") return Number.isInteger(type.value) ? "int" : "double";
  if (type.kind === "Enum") return type.name;
  if (type.kind === "Model") return type.name;
  return "object";
}
