import { useStateSet } from "@typespec/compiler/utils";
import type { EventDecorator } from "../generated-defs/Telemetry.Private.js";
import { StateKeys } from "./lib.js";

const [isEvent, setEvent] = useStateSet(StateKeys.event);
const eventDecorator: EventDecorator = (context, target) => {
  setEvent(context.program, target);
};

export { isEvent };

export const $decorators = {
  "TypeSpec.Telemetry.Private": {
    event: eventDecorator,
  },
};
