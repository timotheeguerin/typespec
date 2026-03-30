import { code, For } from "@alloy-js/core";
import * as ts from "@alloy-js/typescript";
import { typespecCompiler } from "../external-packages/compiler.js";
import { DecoratorSignature } from "../types.js";
import { ParameterTsType, TargetParameterTsType } from "./decorator-signature-type.js";

export interface DataDecoratorAccessorsProps {
  decorators: DecoratorSignature[];
  namespaceName: string;
}

/**
 * Generate typed accessor functions for data decorators.
 * These are thin wrappers around the compiler's generic data decorator API.
 */
export function DataDecoratorAccessors(props: Readonly<DataDecoratorAccessorsProps>) {
  const dataDecorators = props.decorators.filter((d) => d.isData);
  if (dataDecorators.length === 0) {
    return undefined;
  }

  return (
    <For each={dataDecorators} doubleHardline>
      {(signature) => (
        <DataDecoratorAccessor signature={signature} namespaceName={props.namespaceName} />
      )}
    </For>
  );
}

interface DataDecoratorAccessorProps {
  signature: DecoratorSignature;
  namespaceName: string;
}

function DataDecoratorAccessor(props: Readonly<DataDecoratorAccessorProps>) {
  const decorator = props.signature.decorator;
  const name = decorator.name.slice(1); // remove @
  const capitalizedName = name[0].toUpperCase() + name.slice(1);
  const fqn = props.namespaceName ? `${props.namespaceName}.${name}` : name;
  const params = decorator.parameters;
  const targetType = <TargetParameterTsType type={decorator.target.type.type} />;

  if (params.length === 0) {
    // No-arg data decorator — generate `is*` function
    return (
      <ts.FunctionDeclaration
        export
        name={`is${capitalizedName}`}
        parameters={[
          { name: "program", type: typespecCompiler.Program },
          { name: decorator.target.name, type: targetType },
        ]}
        returnType="boolean"
      >
        {code`return ${typespecCompiler.hasDataDecorator}(program, "${fqn}", ${decorator.target.name});`}
      </ts.FunctionDeclaration>
    );
  }

  // Decorators with args — generate `get*` function
  let returnType;
  if (params.length === 1) {
    const param = params[0];
    returnType = (
      <>
        <ParameterTsType constraint={param.type} />
        {" | undefined"}
      </>
    );
  } else {
    // Multi-arg — return type is an interface with named properties
    returnType = (
      <>
        {"{"}
        <For each={params} joiner="; ">
          {(param) => (
            <>
              {" "}
              {param.name}: <ParameterTsType constraint={param.type} />
            </>
          )}
        </For>
        {" } | undefined"}
      </>
    );
  }

  return (
    <ts.FunctionDeclaration
      export
      name={`get${capitalizedName}`}
      parameters={[
        { name: "program", type: typespecCompiler.Program },
        { name: decorator.target.name, type: targetType },
      ]}
      returnType={returnType}
    >
      {code`return ${typespecCompiler.getDataDecoratorValue}(program, "${fqn}", ${decorator.target.name}) as any;`}
    </ts.FunctionDeclaration>
  );
}
