import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@typespec/telemetry",
  diagnostics: {
    "must-be-event": {
      severity: "error",
      messages: {
        default: paramMessage`The model '{"name"}' must be decorated with '@Telemetry.event'.`,
      },
    },
  },
  state: {
    event: { description: "The event decorator" },
  },
});

export const { stateKeys: StateKeys, reportDiagnostic, createDiagnostic } = $lib;
