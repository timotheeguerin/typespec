import { code, type Children } from "@alloy-js/core";
import { Namespace } from "@alloy-js/csharp";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the JsonSerializationProvider and its interface.
 * Provides configured JsonSerializerOptions with all custom converters registered.
 */
export function JsonSerializationProvider(): Children {
  return (
    <CSharpFile
      path="JsonSerializationProvider.cs"
      using={[
        "System.Text.Json",
        "System.Text.Json.Serialization",
        "TypeSpec.Helpers.JsonConverters",
      ]}
    >
      <Namespace name="TypeSpec.Helpers">
        {code`
          public interface IJsonSerializationProvider
          {
            JsonSerializerOptions Options { get; }
          }

          public class JsonSerializationProvider : IJsonSerializationProvider
          {
            public JsonSerializerOptions Options { get; }

            public JsonSerializationProvider()
            {
              Options = new JsonSerializerOptions
              {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
                Converters = {
                  new JsonStringEnumConverter(),
                  new TimeSpanDurationConverter(),
                  new Base64UrlJsonConverter(),
                  new UnixEpochDateTimeOffsetConverter()
                }
              };
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}
