import { code, type Children } from "@alloy-js/core";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the UnixEpochDateTimeOffsetConverter.
 * Converts between Unix epoch timestamps and DateTimeOffset values.
 */
export function UnixEpochDateTimeConverter(): Children {
  return (
    <CSharpFile path="UnixEpochDateTimeConverter.cs">
      {code`
        using System.Text.Json;
        using System.Text.Json.Serialization;

        namespace TypeSpec.Helpers.JsonConverters
        {
          public class UnixEpochDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
          {
            public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              long unixTime = reader.GetInt64();
              return DateTimeOffset.FromUnixTimeSeconds(unixTime);
            }

            public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options)
            {
              writer.WriteNumberValue(value.ToUnixTimeSeconds());
            }
          }
        }
      `}
    </CSharpFile>
  );
}
