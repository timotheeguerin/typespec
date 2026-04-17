import { code, type Children } from "@alloy-js/core";
import { Namespace } from "@alloy-js/csharp";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders the TimeSpanDurationConverter JSON converter.
 * Converts between ISO 8601 duration strings and TimeSpan values.
 */
export function TimeSpanDurationConverter(): Children {
  return (
    <CSharpFile
      path="TimeSpanDurationConverter.cs"
      using={["System.Text.Json", "System.Text.Json.Serialization", "System.Xml"]}
    >
      <Namespace name="TypeSpec.Helpers.JsonConverters">
        {code`
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
        `}
      </Namespace>
    </CSharpFile>
  );
}
