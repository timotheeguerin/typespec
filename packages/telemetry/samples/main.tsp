import "@typespec/telemetry";

using Telemetry;

model ExtensionStarted is Event<"extensionStarted"> {
  extensionId: string;
  extensionVersion: string;
}
