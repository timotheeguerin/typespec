import { code, For, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { Reference } from "@alloy-js/csharp";
import type { Interface } from "@typespec/compiler";
import type { OperationHttpCanonicalization } from "@typespec/http-canonicalization";
import { ControllerAction } from "./controller-action.jsx";
import { businessLogicInterfaceRefkey } from "./interfaces.jsx";

export interface ControllerProps {
  /** The TypeSpec interface this controller represents. */
  type: Interface;
  /** The canonicalized HTTP operations belonging to this controller. */
  operations: OperationHttpCanonicalization[];
}

/**
 * Renders a full ASP.NET controller class.
 * Includes [ApiController], DI for business logic interface, and action methods.
 */
export function Controller(props: ControllerProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const baseName = namePolicy.getName(props.type.name, "class");
  const controllerName = `${baseName}Controller`;
  const implPropName = `${baseName}Impl`;

  const interfaceRef = (
    <Reference refkey={businessLogicInterfaceRefkey(props.type)} />
  ) as Children;

  const attributes: Children[] = [code`[ApiController]`];

  return (
    <cs.ClassDeclaration
      name={controllerName}
      public
      partial
      baseType="ControllerBase"
      attributes={attributes}
    >
      <cs.Property name={implPropName} type={interfaceRef} internal virtual get />
      {"\n"}
      <cs.Constructor public parameters={[{ name: "operations", type: interfaceRef }]}>
        {code`${implPropName} = operations;`}
      </cs.Constructor>
      {"\n"}
      <For each={props.operations} doubleHardline>
        {(op) => <ControllerAction operation={op} implFieldName={implPropName} />}
      </For>
    </cs.ClassDeclaration>
  );
}
