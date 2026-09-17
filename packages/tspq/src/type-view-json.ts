import type { Program, Type } from "@typespec/compiler";
import { createTypeQuery } from "@typespec/compiler/experimental";

export interface TypeViewJsonOptions {
  depth?: number;
  /** Locations are always relative to the compiled project root. */
  cwd?: string;
}

export function getTypeViewJson(program: Program, type: Type, options: TypeViewJsonOptions = {}) {
  const query = createTypeQuery(program);
  return query.view(query.ref(type), { depth: options.depth });
}
