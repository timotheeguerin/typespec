import type { Program, Type } from "@typespec/compiler";
import type { ProgramSummary, SummaryItem } from "./summary.js";
import { getTypeViewJson } from "./type-view-json.js";

export class TypePrinter {
  constructor(_pretty = true) {}

  formatSummary(summary: ProgramSummary): string {
    return [
      `Services (${summary.counts.services})`,
      ...summary.services.map(
        (service) => `- ${service.title ?? service.name} (${service.operations.length} ops)`,
      ),
      `Operations (${summary.counts.operations})`,
      ...summary.operations.map((operation) => `- ${operation.name}`),
      ...Object.entries(summary.types).flatMap(([kind, types]) => [
        `${kind} (${types.length})`,
        ...types.map((type: SummaryItem) => `- ${type.name}`),
      ]),
    ].join("\n");
  }

  formatTypeView(program: Program, type: Type): string {
    const view = getTypeViewJson(program, type);
    return [
      `Type: ${view.name}`,
      `Kind: ${view.kind}`,
      `Description: ${view.description ?? ""}`.trimEnd(),
      `Location: ${view.location ? `${view.location.path}:${view.location.line}:${view.location.column}` : "(synthetic)"}`,
      JSON.stringify(
        view.details ?? {},
        (key, value) => (key === "id" || key === "location" ? undefined : value),
        2,
      ),
    ].join("\n");
  }
}
