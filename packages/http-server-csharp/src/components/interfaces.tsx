import { code, For, refkey as ayRefkey, type Children, type Refkey } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Interface, Operation } from "@typespec/compiler";
import { isVoidType } from "@typespec/compiler";
import { TypeExpression } from "./type-expression.jsx";
import { getCSharpIdentifier, NameCasingType } from "../utils/naming.js";

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
    <cs.InterfaceDeclaration name={interfaceName} public refkey={businessLogicInterfaceRefkey(props.type)}>
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
 * Renders a single async method signature in a business logic interface.
 * Method names get an "Async" suffix (e.g., `ListPetsAsync`).
 */
function BusinessLogicMethod(props: BusinessLogicMethodProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const methodName = `${namePolicy.getName(props.name, "class-method")}Async`;

  const parameters = Array.from(props.operation.parameters.properties.entries()).map(
    ([pName, prop]) => ({
      name: getCSharpIdentifier(pName, NameCasingType.Parameter),
      type: (<TypeExpression type={prop.type} />) as Children,
    }),
  );

  const returnType = isVoidType(props.operation.returnType)
    ? code`Task`
    : code`Task<${(<TypeExpression type={props.operation.returnType} />)}>`;

  return <cs.InterfaceMethod name={methodName} parameters={parameters} returns={returnType} />;
}
