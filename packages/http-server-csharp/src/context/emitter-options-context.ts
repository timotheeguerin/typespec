import { createNamedContext, useContext } from "@alloy-js/core";

export type CollectionType = "array" | "enumerable";

export interface EmitterOptionsContext {
  collectionType: CollectionType;
  serviceNamespace: string;
}

export const EmitterOptions = createNamedContext<EmitterOptionsContext>(
  "EmitterOptions",
);

export function useEmitterOptions(): EmitterOptionsContext {
  return useContext(EmitterOptions) ?? { collectionType: "array", serviceNamespace: "" };
}
