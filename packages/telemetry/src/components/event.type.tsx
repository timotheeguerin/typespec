import * as ef from "@typespec/emitter-framework/typescript";
import type { TelemetryEvent } from "../data.js";

export const EventInterface = ({ event }: { event: TelemetryEvent }) => {
  return <ef.InterfaceDeclaration type={event.model} name={event.name} export />;
};
