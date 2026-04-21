import type { Program, Type } from "@typespec/compiler";
import { isErrorModel, isVoidType } from "@typespec/compiler";
import type { OperationHttpCanonicalization } from "@typespec/http-canonicalization";
import type { Children } from "@alloy-js/core";
import { code } from "@alloy-js/core";
import { TypeExpression } from "../type-expression.jsx";

/**
 * Extracts the "success" type from a return type (same logic as interfaces.tsx).
 */
export function getSuccessReturnType(program: Program, returnType: Type): Type | undefined {
  if (isVoidType(returnType)) return undefined;

  if (returnType.kind === "Union") {
    for (const variant of returnType.variants.values()) {
      const variantType = variant.type;
      if (isVoidType(variantType)) continue;
      if (variantType.kind === "Model") {
        try {
          if (isErrorModel(program, variantType)) continue;
        } catch {
          // isErrorModel may fail on certain types
        }
        if (variantType.name && variantType.name.toLowerCase() === "error") {
          continue;
        }
      }
      return variantType;
    }
    return undefined;
  }

  return returnType;
}

/**
 * Returns a mock return statement for a method based on its return type.
 */
export function getMockReturnStatement(
  program: Program,
  returnType: Type,
): Children {
  const successType = getSuccessReturnType(program, returnType);
  if (!successType) {
    return "return Task.CompletedTask;";
  }

  if (successType.kind === "Model" && successType.indexer) {
    // Array-like type
    const elementType = successType.indexer.value;
    return code`return Task.FromResult<${(<TypeExpression type={successType} />)}>([]);`;
  }

  if (successType.kind === "Scalar") {
    if (successType.name === "string") {
      return `return Task.FromResult("");`;
    }
    return code`return Task.FromResult<${(<TypeExpression type={successType} />)}>(default);`;
  }

  if (successType.kind === "Model") {
    return code`return Task.FromResult(_initializer.Initialize<${(<TypeExpression type={successType} />)}>());`;
  }

  return code`return Task.FromResult<${(<TypeExpression type={successType} />)}>(default);`;
}

/** Get body property names to filter for GET operations. */
export function getGetBodyPropNames(
  opName: string,
  canonicalMap?: Map<string, OperationHttpCanonicalization>,
): Set<string> {
  const bodyPropNames = new Set<string>();
  const canonicalOp = canonicalMap?.get(opName);
  if (!canonicalOp || canonicalOp.method !== "get") return bodyPropNames;

  const body = canonicalOp.requestParameters.body;
  if (body?.bodyKind === "single" && body.bodies.length > 0) {
    const bodyType = body.bodies[0].type.sourceType;
    if (bodyType.kind === "Model") {
      for (const [name] of bodyType.properties) {
        bodyPropNames.add(name);
      }
    }
  }
  for (const p of canonicalOp.requestParameters.properties) {
    if (p.kind === "body" || p.kind === "bodyRoot" || p.kind === "bodyProperty") {
      bodyPropNames.add(p.property.sourceType.name);
    }
  }
  return bodyPropNames;
}
