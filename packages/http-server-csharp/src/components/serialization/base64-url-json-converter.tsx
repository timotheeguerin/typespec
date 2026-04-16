import { code, type Children } from "@alloy-js/core";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the Base64UrlJsonConverter.
 * Converts between base64url-encoded strings and byte arrays.
 */
export function Base64UrlJsonConverter(): Children {
  return (
    <CSharpFile path="Base64UrlJsonConverter.cs">
      {code`
        using System.Text.Json;
        using System.Text.Json.Serialization;

        namespace TypeSpec.Helpers.JsonConverters
        {
          public class Base64UrlJsonConverter : JsonConverter<byte[]>
          {
            public override byte[] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              string? base64Url = reader.GetString();
              if (base64Url == null) return Array.Empty<byte>();
              string base64 = base64Url.Replace('-', '+').Replace('_', '/');
              switch (base64.Length % 4)
              {
                case 2: base64 += "=="; break;
                case 3: base64 += "="; break;
              }
              return Convert.FromBase64String(base64);
            }

            public override void Write(Utf8JsonWriter writer, byte[] value, JsonSerializerOptions options)
            {
              string base64 = Convert.ToBase64String(value);
              string base64Url = base64.Replace('+', '-').Replace('/', '_').TrimEnd('=');
              writer.WriteStringValue(base64Url);
            }
          }
        }
      `}
    </CSharpFile>
  );
}
