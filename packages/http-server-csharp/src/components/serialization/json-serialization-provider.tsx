import { code, type Children } from "@alloy-js/core";
import { Namespace } from "@alloy-js/csharp";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the IJsonSerializationProvider interface and JsonSerializationProvider class.
 * These are emitted as separate files to match the old emitter output.
 */
export function JsonSerializationProvider(): Children {
  return (
    <>
      <CSharpFile
        path="IJsonSerializationProvider.cs"
        using={["System.Text.Json", "System.Text.Json.Serialization"]}
      >
        <Namespace name="TypeSpec.Helpers">
          {code`
            public interface IJsonSerializationProvider
            {
              string Serialize<T>(T value);
              T? Deserialize<T>(string value);
            }
          `}
        </Namespace>
      </CSharpFile>
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

              public string Serialize<T>(T value)
              {
                return JsonSerializer.Serialize(value, Options);
              }

              public T? Deserialize<T>(string value)
              {
                return JsonSerializer.Deserialize<T>(value, Options);
              }
            }
          `}
        </Namespace>
      </CSharpFile>
    </>
  );
}
