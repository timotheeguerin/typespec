import "../dist/src/tsp-index.js";

namespace TypeSpec.Telemetry;

@Private.event
model Event<T extends string> {
  name: T;
}

namespace Private {
  extern dec event(target: Reflection.Model);
}
