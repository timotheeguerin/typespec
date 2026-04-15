import { createNamedContext, useContext } from "@alloy-js/core";
import type { HttpCanonicalizer } from "@typespec/http-canonicalization";

/**
 * Alloy context that holds the HttpCanonicalizer instance.
 * Created once in the emitter entry point and available to all components.
 */
export const HttpCanonicalizerContext =
  createNamedContext<HttpCanonicalizer>("HttpCanonicalizerContext");

/**
 * Returns the HttpCanonicalizer from the current component context.
 * Must be called within a component tree that provides HttpCanonicalizerContext.
 */
export function useHttpCanonicalizer(): HttpCanonicalizer {
  const canonicalizer = useContext(HttpCanonicalizerContext);
  if (!canonicalizer) {
    throw new Error(
      "HttpCanonicalizer is not set. Make sure the component is wrapped in HttpCanonicalizerContext.Provider.",
    );
  }
  return canonicalizer;
}
