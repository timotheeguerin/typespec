import { type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Type } from "@typespec/compiler";
import type { Typekit } from "@typespec/compiler/typekit";

/**
 * Returns a DocSummary component for the given TypeSpec type's documentation,
 * or undefined if no doc is available.
 */
export function getDocComment($: Typekit, type: Type): Children {
  const doc = $.type.getDoc(type);
  if (!doc) {
    return undefined;
  }

  return (
    <cs.DocSummary>
      <cs.DocFromMarkdown markdown={doc} />
    </cs.DocSummary>
  );
}
