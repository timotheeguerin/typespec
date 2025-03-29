import type { Model, Program } from "@typespec/compiler";
import { isEvent } from "./decorators.js";
import { reportDiagnostic } from "./lib.js";

export interface TelemetryView {
  readonly events: TelemetryEvent[];
}
export interface TelemetryEvent {
  readonly model: Model;
  readonly name: string;
}

export function resolveTelemetry(program: Program): TelemetryView {
  const ns = program.getGlobalNamespaceType();
  const events: TelemetryEvent[] = [];
  for (const model of ns.models.values()) {
    if (!isEvent(program, model)) {
      reportDiagnostic(program, {
        code: "must-be-event",
        target: model,
        format: { name: model.name },
      });
      continue;
    }
    events.push({
      model,
      name: model.name,
    });
  }
  return { events };
}
