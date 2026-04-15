import { code, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import { isVoidType } from "@typespec/compiler";
import type { HttpOperation } from "@typespec/http";
import {
  getHttpVerbAttribute,
  getParameterBindingAttribute,
  getRouteTemplate,
} from "../utils/http-helpers.js";
import { getCSharpIdentifier, NameCasingType } from "../utils/naming.js";
import { TypeExpression } from "./type-expression.jsx";

export interface ControllerActionProps {
  /** The HTTP operation to generate an action method for. */
  operation: HttpOperation;
  /** The name of the business logic implementation field (e.g., "petStoreImpl"). */
  implFieldName: string;
}

/**
 * Renders an ASP.NET controller action method for an HTTP operation.
 * Includes HTTP verb attribute, route, parameters with binding attributes,
 * and a body that delegates to the business logic interface.
 */
export function ControllerAction(props: ControllerActionProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const opName = namePolicy.getName(props.operation.operation.name, "class-method");
  const verb = getHttpVerbAttribute(props.operation);
  const route = getRouteTemplate(props.operation.path);

  // Build parameter list from all HTTP parameters
  const parameters = props.operation.parameters.parameters.map((p) => {
    const bindingAttr = getParameterBindingAttribute(p.type, p.name);
    return {
      name: getCSharpIdentifier(p.param.name, NameCasingType.Parameter),
      type: (<TypeExpression type={p.param.type} />) as Children,
      attributes: bindingAttr ? [bindingAttr] : undefined,
    };
  });

  // Add body parameter if present
  const body = props.operation.parameters.body;
  if (body?.type) {
    parameters.push({
      name: "body",
      type: (<TypeExpression type={body.type} />) as Children,
      attributes: ["[FromBody]"],
    });
  }

  // Build the business logic call arguments
  const callArgs = parameters.map((p) => p.name).join(", ");

  const hasReturnValue = !isVoidType(props.operation.operation.returnType);

  const attributes: Children[] = [code`[${verb}("${route}")]`];

  return (
    <cs.Method
      name={opName}
      async
      virtual
      public
      returns={code`Task<IActionResult>`}
      parameters={parameters}
      attributes={attributes}
    >
      {hasReturnValue
        ? code`var result = await ${props.implFieldName}.${opName}Async(${callArgs});\nreturn Ok(result);`
        : code`await ${props.implFieldName}.${opName}Async(${callArgs});\nreturn Ok();`}
    </cs.Method>
  );
}
