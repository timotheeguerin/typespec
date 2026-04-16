import { code, type Children } from "@alloy-js/core";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the TimeSpanDurationConverter JSON converter.
 * Converts between ISO 8601 duration strings and TimeSpan values.
 */
export function TimeSpanDurationConverter(): Children {
  return (
    <CSharpFile path="TimeSpanDurationConverter.cs">
      {code`
        using System.Text.Json;
        using System.Text.Json.Serialization;
        using System.Xml;

        namespace TypeSpec.Helpers.JsonConverters
        {
          public class TimeSpanDurationConverter : JsonConverter<TimeSpan>
          {
            public override TimeSpan Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              return XmlConvert.ToTimeSpan(reader.GetString()!);
            }

            public override void Write(Utf8JsonWriter writer, TimeSpan value, JsonSerializerOptions options)
            {
              writer.WriteStringValue(XmlConvert.ToString(value));
            }
          }
        }
      `}
    </CSharpFile>
  );
}
