import type { DecoratorContext, Model } from "@typespec/compiler";

export type EventDecorator = (context: DecoratorContext, target: Model) => void;

export type TelemetryPrivateDecorators = {
  event: EventDecorator;
};
