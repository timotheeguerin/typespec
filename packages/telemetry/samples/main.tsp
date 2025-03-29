import "@typespec/telemetry";

using Telemetry;

model ExtensionStarted is Event<"extensionStarted"> {
  extensionId: string;
  extensionVersion: string;
}

model PreviewOpenApi is Event<"previewOpenApi"> {
  version: string;
}
