import { code, type Children } from "@alloy-js/core";
import { Namespace } from "@alloy-js/csharp";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the HttpServiceException class and HttpServiceExceptionFilter.
 * The exception class represents HTTP response exceptions with status codes.
 * The filter converts these exceptions to proper HTTP responses.
 */
export function HttpServiceExceptionFilter(): Children {
  return (
    <CSharpFile
      path="HttpServiceException.cs"
      using={["Microsoft.AspNetCore.Mvc", "Microsoft.AspNetCore.Mvc.Filters"]}
    >
      <Namespace name="TypeSpec.Helpers">
        {code`
          public class HttpServiceException : Exception
          {
            public HttpServiceException(int statusCode, object? value = null, Dictionary<string, string>? headers = null) =>
              (StatusCode, Value, Headers) = (statusCode, value, headers ?? new Dictionary<string, string>());
            public int StatusCode { get; }
            public object? Value { get; }
            public Dictionary<string, string> Headers { get; }
          }

          public class HttpServiceExceptionFilter : IExceptionFilter
          {
            public void OnException(ExceptionContext context)
            {
              if (context.Exception is HttpServiceException httpException)
              {
                context.Result = new ObjectResult(httpException.Value)
                {
                  StatusCode = httpException.StatusCode
                };
                foreach (var header in httpException.Headers)
                {
                  context.HttpContext.Response.Headers[header.Key] = header.Value;
                }
              }
              else
              {
                context.Result = new ObjectResult(new { error = context.Exception.Message })
                {
                  StatusCode = 500
                };
              }
              context.ExceptionHandled = true;
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}
