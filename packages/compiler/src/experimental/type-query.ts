import { walkPropertiesInherited } from "../core/checker.js";
import { getSourceLocation } from "../core/diagnostics.js";
import { getLocationContext } from "../core/helpers/location-context.js";
import { getTypeName } from "../core/helpers/type-name-utils.js";
import { getRelativePathFromDirectory } from "../core/path-utils.js";
import type { Program } from "../core/program.js";
import { navigateProgram } from "../core/semantic-walker.js";
import type { Type } from "../core/types.js";
import { getDoc, getEncode } from "../lib/decorators.js";

export interface QueryLocation {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface TypeQueryView {
  readonly id: string;
  readonly name: string;
  readonly kind: Type["kind"];
  readonly description?: string;
  readonly location?: QueryLocation;
  readonly origin: string;
  readonly details?: Record<string, unknown>;
}

export interface TypeQueryOptions {
  readonly depth?: number;
}

export interface TypeQuery {
  ref(type: Type): string;
  view(reference: string, options?: TypeQueryOptions): TypeQueryView;
  related(reference: string): readonly TypeQueryView[];
  list(options?: { offset?: number; limit?: number; kind?: Type["kind"] }): {
    items: readonly TypeQueryView[];
    nextOffset?: number;
  };
  has(reference: string): boolean;
}

let sessionId = 0;

/** Read-only, bounded views of a single compiled graph. IDs are session-scoped. */
export function createTypeQuery(program: Program): TypeQuery {
  const prefix = `@query-${++sessionId}/`;
  const ids = new Map<Type, string>();
  const types = new Map<string, Type>();
  const names = new Map<string, Type>();
  const parameterOwners = new Map<Type, Type>();
  const projectTypes: Type[] = [];
  const register = (type: Type) => {
    if (ids.has(type)) return;
    if (ids.size >= 100_000) throw new Error("Type query index limit exceeded.");
    const id = `${prefix}${ids.size}`;
    ids.set(type, id);
    types.set(id, type);
    const name =
      type.kind === "ModelProperty" && type.model
        ? `${getTypeName(type.model)}.${type.name}`
        : getTypeName(type);
    if (!names.has(name)) names.set(name, type);
    if (type.kind === "Operation") {
      for (const property of type.parameters.properties.values())
        parameterOwners.set(property, type);
    }
    if (getLocationContext(program, type).type === "project") projectTypes.push(type);
  };
  navigateProgram(program, {
    namespace: register,
    model: register,
    modelProperty: register,
    operation: register,
    scalar: register,
    interface: register,
    enum: register,
    enumMember: register,
    union: register,
    unionVariant: register,
    tuple: register,
  });
  projectTypes.sort((a, b) => getTypeName(a).localeCompare(getTypeName(b)));

  function resolve(reference: string): Type {
    let type = types.get(reference) ?? names.get(reference);
    if (!type && /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(reference)) {
      const [resolved] = program.resolveTypeReference(reference);
      type = resolved;
      if (type) register(type);
    }
    if (!type) throw new Error(`Unknown type or stale query handle: ${reference}`);
    return type;
  }

  function ref(type: Type): string {
    register(type);
    return ids.get(type)!;
  }

  function links(type: Type): Type[] {
    switch (type.kind) {
      case "Model":
        return [...(type.baseModel ? [type.baseModel] : []), ...walkPropertiesInherited(type)];
      case "ModelProperty":
        return [
          type.type,
          ...(type.model ? [type.model] : []),
          ...(parameterOwners.has(type) ? [parameterOwners.get(type)!] : []),
        ];
      case "Operation":
        return [...type.parameters.properties.values(), type.returnType];
      case "Interface":
        return [...type.operations.values()];
      case "Scalar":
        return type.baseScalar ? [type.baseScalar] : [];
      case "Union":
        return [...type.variants.values()];
      case "UnionVariant":
        return [type.type];
      case "Enum":
        return [...type.members.values()];
      case "Tuple":
        return type.values;
      case "Namespace":
        return [
          ...type.namespaces.values(),
          ...type.models.values(),
          ...type.operations.values(),
          ...type.scalars.values(),
          ...type.interfaces.values(),
          ...type.enums.values(),
          ...type.unions.values(),
        ];
      default:
        return [];
    }
  }

  function render(type: Type, depth: number, budget: { nodes: number }): TypeQueryView {
    if (++budget.nodes > 128)
      throw new Error("Type query node limit exceeded; request less detail.");
    const location = getSourceLocation(type, { locateId: true });
    const start = location.file?.getLineAndCharacterOfPosition(location.pos);
    const end = location.file?.getLineAndCharacterOfPosition(location.end);
    const encoding =
      type.kind === "Scalar" || type.kind === "ModelProperty"
        ? getEncode(program, type)
        : undefined;
    const details: Record<string, unknown> = {};
    if (type.kind === "ModelProperty") details.optional = type.optional;
    if (type.kind === "String" || type.kind === "Boolean" || type.kind === "Number") {
      details.value = type.value;
    }
    if (type.kind === "EnumMember" && type.value !== undefined) details.value = type.value;
    if (encoding)
      details.encoding = { encoding: encoding.encoding, type: getTypeName(encoding.type) };
    if (depth > 0) {
      details.related = links(type).map((child) => render(child, depth - 1, budget));
      const info = program.getTypeInfo(type);
      if (info) details.libraryInformation = info.content;
    }
    return {
      id: ref(type),
      name: getTypeName(type),
      kind: type.kind,
      description: getDoc(program, type),
      origin: getLocationContext(program, type).type,
      location:
        !location.isSynthetic && start && end
          ? {
              path: getRelativePathFromDirectory(program.projectRoot, location.file.path, false),
              line: start.line + 1,
              column: start.character + 1,
              endLine: end.line + 1,
              endColumn: end.character + 1,
            }
          : undefined,
      details: Object.keys(details).length ? details : undefined,
    };
  }

  function bounded<T>(value: T): T {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 32768) {
      throw new Error("Type query output limit exceeded; request less detail.");
    }
    return value;
  }

  function view(reference: string, { depth = 1 }: TypeQueryOptions = {}): TypeQueryView {
    if (!Number.isInteger(depth) || depth < 0 || depth > 2) {
      throw new Error("Query depth must be an integer between 0 and 2.");
    }
    return bounded(render(resolve(reference), depth, { nodes: 0 }));
  }

  return {
    ref,
    view,
    has: (reference) => types.has(reference),
    related(reference) {
      const budget = { nodes: 0 };
      return bounded(links(resolve(reference)).map((type) => render(type, 0, budget)));
    },
    list({ offset = 0, limit = 50, kind } = {}) {
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        throw new Error(
          "Query offset must be nonnegative and page size must be between 1 and 100.",
        );
      }
      const filtered = kind ? projectTypes.filter((type) => type.kind === kind) : projectTypes;
      const budget = { nodes: 0 };
      const items = filtered.slice(offset, offset + limit).map((type) => render(type, 0, budget));
      return bounded({
        items,
        nextOffset: offset + limit < filtered.length ? offset + limit : undefined,
      });
    },
  };
}
