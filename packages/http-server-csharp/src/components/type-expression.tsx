import { refkey as ayRefkey, code, type Children, type Refkey } from "@alloy-js/core";
import type { Scalar } from "@typespec/compiler";
import type { Typekit } from "@typespec/compiler/typekit";
import { Experimental_ComponentOverridesConfig } from "@typespec/emitter-framework";
import { TypeExpression } from "@typespec/emitter-framework/csharp";

// Re-export EF's TypeExpression for use across the server emitter.
export { TypeExpression };

// --- Refkey helpers ---

// Must match the emitter-framework's C# refkey prefix so that references
// resolve to declarations created by ClassDeclaration / EnumDeclaration.
const refKeyPrefix = Symbol.for("emitter-framework:csharp");

export function serverRefkey(...args: unknown[]): Refkey {
  if (args.length === 0) {
    return ayRefkey();
  }
  return ayRefkey(refKeyPrefix, ...args);
}

// --- Server-specific scalar overrides ---

/**
 * Server-specific scalar overrides for TypeExpression.
 * Differences from EF defaults:
 * - `plainDate` → `DateTime` (not `DateOnly`)
 * - `plainTime` → `DateTime` (not `TimeOnly`)
 * - `url` → `string` (not `Uri`)
 */
export function createServerScalarOverrides($: Typekit): Experimental_ComponentOverridesConfig {
  const overrides = new Experimental_ComponentOverridesConfig();

  const scalarOverrides: [Scalar, string][] = [
    [$.builtin.plainDate, "DateTime"],
    [$.builtin.plainTime, "DateTime"],
    [$.builtin.url, "string"],
  ];

  for (const [scalar, csType] of scalarOverrides) {
    overrides.forType(scalar, {
      reference: (props) => code`${csType}` as Children,
    });
  }

  return overrides;
}
