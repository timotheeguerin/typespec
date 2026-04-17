import { refkey as ayRefkey, code, For, type Children, type Refkey } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Interface, Operation, Program, Type } from "@typespec/compiler";
import { isErrorModel, isVoidType } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { TypeExpression } from "./type-expression.jsx";

const interfaceRefKeyPrefix = Symbol.for("http-server-csharp:interface");

/** Creates a stable refkey for a business logic interface from its TypeSpec Interface type. */
export function businessLogicInterfaceRefkey(type: Interface): Refkey {
  return ayRefkey(interfaceRefKeyPrefix, type);
}

export interface BusinessLogicInterfaceProps {
  /** The TypeSpec interface to generate a business logic interface for. */
  type: Interface;
}

/**
 * Generates an ASP.NET business logic interface (e.g., `IPetStoreOperations`)
 * from a TypeSpec interface. Each operation becomes an async Task method.
 */
export function BusinessLogicInterface(props: BusinessLogicInterfaceProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const interfaceName = `I${namePolicy.getName(props.type.name, "class")}`;
  const operations = Array.from(props.type.operations.entries());

  return (
    <cs.InterfaceDeclaration
      name={interfaceName}
      public
      refkey={businessLogicInterfaceRefkey(props.type)}
    >
      <For each={operations} doubleHardline>
        {([name, op]) => <BusinessLogicMethod name={name} operation={op} />}
      </For>
    </cs.InterfaceDeclaration>
  );
}

interface BusinessLogicMethodProps {
  name: string;
  operation: Operation;
}

/**
 * Extracts the "success" type from a return type.
 * If the return type is a Union, returns the first non-error variant.
 * If the return type is void, returns undefined.
 */
function getSuccessReturnType(program: Program, returnType: Type): Type | undefined {
  if (isVoidType(returnType)) return undefined;

  if (returnType.kind === "Union") {
    for (const variant of returnType.variants.values()) {
      const variantType = variant.type;
      if (isVoidType(variantType)) continue;
      // Skip error models by checking the @error decorator or name convention
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
    // All variants are errors or void
    return undefined;
  }

  return returnType;
}

/**
 * Renders a single async method signature in a business logic interface.
 * Method names get an "Async" suffix (e.g., `ListPetsAsync`).
 */
function BusinessLogicMethod(props: BusinessLogicMethodProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const methodName = `${namePolicy.getName(props.name, "class-method")}Async`;

  const parameters = Array.from(props.operation.parameters.properties.entries()).map(
    ([pName, prop]) => ({
      name: namePolicy.getName(pName, "type-parameter"),
      type: (<TypeExpression type={prop.type} />) as Children,
    }),
  );

  const { $ } = useTsp();
  const successType = getSuccessReturnType($.program, props.operation.returnType);
  const returnType = successType
    ? code`Task<${(<TypeExpression type={successType} />)}>`
    : code`Task`;

  return <cs.InterfaceMethod name={methodName} parameters={parameters} returns={returnType} />;
}
