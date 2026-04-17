import { code, type Children } from "@alloy-js/core";
import { Namespace } from "@alloy-js/csharp";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the UnixEpochDateTimeOffsetConverter.
 * Converts between Unix epoch timestamps and DateTimeOffset values.
 */
export function UnixEpochDateTimeConverter(): Children {
  return (
    <CSharpFile
      path="UnixEpochDateTimeConverter.cs"
      using={["System.Text.Json", "System.Text.Json.Serialization"]}
    >
      <Namespace name="TypeSpec.Helpers.JsonConverters">
        {code`
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
        `}
      </Namespace>
    </CSharpFile>
  );
}
