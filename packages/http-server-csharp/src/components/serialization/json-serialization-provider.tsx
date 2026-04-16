import { code, type Children } from "@alloy-js/core";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the JsonSerializationProvider and its interface.
 * Provides configured JsonSerializerOptions with all custom converters registered.
 */
export function JsonSerializationProvider(): Children {
  return (
    <CSharpFile path="JsonSerializationProvider.cs">
      {code`
        using System.Text.Json;
        using System.Text.Json.Serialization;
        using TypeSpec.Helpers.JsonConverters;

        namespace TypeSpec.Helpers
        {
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
        }
      `}
    </CSharpFile>
  );
}
