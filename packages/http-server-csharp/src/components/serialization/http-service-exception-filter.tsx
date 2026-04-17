import { code, type Children } from "@alloy-js/core";
import { Namespace } from "@alloy-js/csharp";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the HttpServiceExceptionFilter.
 * Global exception filter that returns error responses as JSON.
 */
export function HttpServiceExceptionFilter(): Children {
  return (
    <CSharpFile
      path="HttpServiceExceptionFilter.cs"
      using={["Microsoft.AspNetCore.Mvc", "Microsoft.AspNetCore.Mvc.Filters"]}
    >
      <Namespace name="TypeSpec.Helpers">
        {code`
          public class HttpServiceExceptionFilter : IExceptionFilter
          {
            public void OnException(ExceptionContext context)
            {
              context.Result = new ObjectResult(new { error = context.Exception.Message })
              {
                StatusCode = 500
              };
              context.ExceptionHandled = true;
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}
