import { For, Output, SourceDirectory } from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import type { EmitContext } from "@typespec/compiler";
import { $ } from "@typespec/compiler/experimental/typekit";
import { writeOutput } from "@typespec/emitter-framework";
import * as ef from "@typespec/emitter-framework/typescript";
import { EventInterface } from "./components/event.type.js";
import { resolveTelemetry } from "./data.js";

export async function $onEmit(context: EmitContext) {
  const { events } = resolveTelemetry(context.program);

  const unionOfEvents = $.union.create({
    name: "TelemetryEvents",
    variants: events.map((event) => $.unionVariant.create({ type: event.model })),
  });
  await writeOutput(
    <Output>
      <SourceDirectory path="src">
        <ts.SourceFile path="index.ts">
          <For each={events}>{(event) => <EventInterface event={event} />}</For>
          <ef.UnionDeclaration type={unionOfEvents} />
        </ts.SourceFile>
      </SourceDirectory>
    </Output>,
    context.emitterOutputDir,
  );
}
