import { code, For, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Interface, Operation } from "@typespec/compiler";
import { isVoidType } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { TypeExpression } from "./type-expression.jsx";
import { getCSharpIdentifier, NameCasingType } from "../utils/naming.js";

export interface BusinessLogicInterfaceProps {
  /** The TypeSpec interface to generate a business logic interface for. */
  type: Interface;
}

/**
 * Generates an ASP.NET business logic interface (e.g., `IPetStoreOperations`)
 * from a TypeSpec interface. Each operation becomes an async Task method.
 */
export function BusinessLogicInterface(props: BusinessLogicInterfaceProps): Children {
  const { $ } = useTsp();
  const namePolicy = cs.useCSharpNamePolicy();
  const interfaceName = `I${namePolicy.getName(props.type.name, "class")}`;
  const operations = Array.from(props.type.operations.entries());

  return (
    <cs.InterfaceDeclaration name={interfaceName} public>
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
  const { $ } = useTsp();
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
