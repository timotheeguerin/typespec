import { code, type Children } from "@alloy-js/core";
import { Namespace } from "@alloy-js/csharp";
import { CSharpFile } from "../csharp-file.jsx";

/**
 * Renders all constraint attribute helper files.
 * These provide validation at serialization time for numeric, string, and array constraints.
 */
export function ConstraintAttributes(): Children {
  return (
    <>
      <NumericConstraintAttribute />
      <StringConstraintAttribute />
      <ArrayConstraintAttribute />
      <StringArrayConstraintAttribute />
      <NumericArrayConstraintAttribute />
    </>
  );
}

function NumericConstraintAttribute(): Children {
  return (
    <CSharpFile
      path="NumericConstraintAttribute.cs"
      using={["System.Numerics", "System.Text.Json", "System.Text.Json.Serialization"]}
    >
      <Namespace name="TypeSpec.Helpers.JsonConverters">
        {code`
          /// <summary>
          /// Provides numeric constraint validation at serialization time
          /// </summary>
          /// <typeparam name="T"></typeparam>
          public class NumericConstraintAttribute<T> : JsonConverterAttribute where T: struct, INumber<T>
          {
            T? _minValue = null, _maxValue = null;
            public NumericConstraintAttribute() { }
            /// <summary>
            /// Provides the minimum value
            /// </summary>
            public T MinValue { get { return _minValue.HasValue ? _minValue.Value : default(T); } set { _minValue = value; } }
            /// <summary>
            /// Provides the maximum allowed value
            /// </summary>
            public T MaxValue { get { return _maxValue.HasValue ? _maxValue.Value : default(T); } set { _maxValue = value; } }
            /// <summary>
            /// If true, then values greater than but not equal to the minimum value are allowed
            /// </summary>
            public bool MinValueExclusive { get; set; }
            /// <summary>
            /// If true, values less than, but not equal to the provided maximum are allowed
            /// </summary>
            public bool MaxValueExclusive { get; set; }
            public override JsonConverter? CreateConverter(Type typeToConvert)
            {
              return new NumericJsonConverter<T>(_minValue, _maxValue, MinValueExclusive, MaxValueExclusive);
            }
          }

          public class NumericJsonConverter<T> : JsonConverter<T> where T : struct, INumber<T>
          {
            string _rangeString;
            public NumericJsonConverter(T? minValue = null, T? maxValue = null, bool? minValueExclusive = false, bool? maxValueExclusive = false, JsonSerializerOptions? options = null)
            {
              MinValue = minValue;
              MaxValue = maxValue;
              MinValueExclusive = minValueExclusive.HasValue ? minValueExclusive.Value : false;
              MaxValueExclusive = maxValueExclusive.HasValue ? maxValueExclusive.Value : false;
              _rangeString = $"{(MinValue.HasValue ? (MinValueExclusive ? $"({MinValue}" : $"[{MinValue}") : $"[{typeof(T).Name}.Min")}, {(MaxValue.HasValue ? (MaxValueExclusive ? $"{MaxValue})" : $"{MaxValue}]") : $"{typeof(T).Name}.Max]")}";
              if (options != null)
              {
                InnerConverter = options.GetConverter(typeof(T)) as JsonConverter<T>;
              }
            }
            protected T? MinValue { get; }
            protected bool MinValueExclusive { get; }
            protected T? MaxValue { get; }
            protected bool MaxValueExclusive { get; }
            private JsonConverter<T>? InnerConverter { get; set; }
            private JsonConverter<T> GetInnerConverter(JsonSerializerOptions options)
            {
              if (InnerConverter == null) { InnerConverter = (JsonConverter<T>)options.GetConverter(typeof(T)); }
              return InnerConverter;
            }
            public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              var inner = GetInnerConverter(options);
              T candidate = inner.Read(ref reader, typeToConvert, options);
              ValidateRange(candidate);
              return candidate;
            }
            public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
            {
              ValidateRange(value);
              GetInnerConverter(options).Write(writer, value, options);
            }
            protected virtual void ValidateRange(T value)
            {
              if ((MinValue.HasValue && (value < MinValue.Value || (value == MinValue.Value && MinValueExclusive)))
                || (MaxValue.HasValue && (value > MaxValue.Value || (value == MaxValue.Value && MaxValueExclusive))))
                throw new JsonException($"{value} is outside the allowed range of {_rangeString}");
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}

function StringConstraintAttribute(): Children {
  return (
    <CSharpFile
      path="StringConstraintAttribute.cs"
      using={["System.Text.Json", "System.Text.Json.Serialization", "System.Text.RegularExpressions"]}
    >
      <Namespace name="TypeSpec.Helpers.JsonConverters">
        {code`
          /// <summary>
          /// Provides constraints for string values
          /// </summary>
          public class StringConstraintAttribute : JsonConverterAttribute
          {
            public int MinLength { get; set; }
            public int MaxLength { get; set; }
            /// <summary>
            /// The pattern that the string must match
            /// </summary>
            public string? Pattern { get; set; }
            public override JsonConverter? CreateConverter(Type typeToConvert)
            {
              return new ConstrainedStringJsonConverter(MinLength, MaxLength, Pattern);
            }
          }

          public class ConstrainedStringJsonConverter : JsonConverter<string>
          {
            public ConstrainedStringJsonConverter(int minLength = 0, int maxLength = int.MaxValue, string? pattern = null)
            {
              MinLength = minLength;
              MaxLength = maxLength;
              Pattern = pattern;
            }
            protected int MinLength { get; }
            protected int MaxLength { get; }
            protected string? Pattern { get; }
            public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              string? candidate = reader.GetString();
              ValidateConstraints(candidate);
              return candidate;
            }
            public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
            {
              ValidateConstraints(value);
              writer.WriteStringValue(value);
            }
            protected virtual void ValidateConstraints(string? value)
            {
              if (value == null) return;
              if (value.Length < MinLength) throw new JsonException($"String length {value.Length} is less than minimum {MinLength}");
              if (value.Length > MaxLength) throw new JsonException($"String length {value.Length} is greater than maximum {MaxLength}");
              if (Pattern != null && !Regex.IsMatch(value, Pattern)) throw new JsonException($"String '{value}' does not match pattern '{Pattern}'");
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}

function ArrayConstraintAttribute(): Children {
  return (
    <CSharpFile
      path="ArrayConstraintAttribute.cs"
      using={["System.Text.Json", "System.Text.Json.Serialization"]}
    >
      <Namespace name="TypeSpec.Helpers.JsonConverters">
        {code`
          /// <summary>
          /// Constrains the number of elements in an array
          /// </summary>
          /// <typeparam name="T">The element type of the array</typeparam>
          public class ArrayConstraintAttribute<T> : JsonConverterAttribute
          {
            /// <summary>
            /// The smallest number of allowed items
            /// </summary>
            public int MinItems { get; set; }
            /// <summary>
            /// The largest number of allowed items
            /// </summary>
            public int MaxItems { get; set; } = int.MaxValue;
            public override JsonConverter? CreateConverter(Type typeToConvert)
            {
              return new ConstrainedArrayJsonConverter<T>(MinItems, MaxItems);
            }
          }

          public class ConstrainedArrayJsonConverter<T> : JsonConverter<T[]>
          {
            public ConstrainedArrayJsonConverter(int minItems = 0, int maxItems = int.MaxValue)
            {
              MinItems = minItems;
              MaxItems = maxItems;
            }
            protected int MinItems { get; }
            protected int MaxItems { get; }
            public override T[]? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              var list = JsonSerializer.Deserialize<T[]>(ref reader, options);
              ValidateConstraints(list);
              return list;
            }
            public override void Write(Utf8JsonWriter writer, T[] value, JsonSerializerOptions options)
            {
              ValidateConstraints(value);
              JsonSerializer.Serialize(writer, value, options);
            }
            protected virtual void ValidateConstraints(T[]? value)
            {
              if (value == null) return;
              if (value.Length < MinItems) throw new JsonException($"Array length {value.Length} is less than minimum {MinItems}");
              if (value.Length > MaxItems) throw new JsonException($"Array length {value.Length} is greater than maximum {MaxItems}");
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}

function StringArrayConstraintAttribute(): Children {
  return (
    <CSharpFile
      path="StringArrayConstraintAttribute.cs"
      using={["System.Text.Json", "System.Text.Json.Serialization", "System.Text.RegularExpressions"]}
    >
      <Namespace name="TypeSpec.Helpers.JsonConverters">
        {code`
          /// <summary>
          /// Constrains the elements of a string array
          /// </summary>
          public class StringArrayConstraintAttribute : JsonConverterAttribute
          {
            public int MinItems { get; set; }
            public int MaxItems { get; set; } = int.MaxValue;
            public int MinLength { get; set; }
            public int MaxLength { get; set; } = int.MaxValue;
            public string? Pattern { get; set; }
            public override JsonConverter? CreateConverter(Type typeToConvert)
            {
              return new ConstrainedStringArrayJsonConverter(MinItems, MaxItems, MinLength, MaxLength, Pattern);
            }
          }

          public class ConstrainedStringArrayJsonConverter : JsonConverter<string[]>
          {
            public ConstrainedStringArrayJsonConverter(int minItems = 0, int maxItems = int.MaxValue, int minLength = 0, int maxLength = int.MaxValue, string? pattern = null)
            {
              MinItems = minItems;
              MaxItems = maxItems;
              MinLength = minLength;
              MaxLength = maxLength;
              Pattern = pattern;
            }
            protected int MinItems { get; }
            protected int MaxItems { get; }
            protected int MinLength { get; }
            protected int MaxLength { get; }
            protected string? Pattern { get; }
            public override string[]? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              var list = JsonSerializer.Deserialize<string[]>(ref reader, options);
              ValidateConstraints(list);
              return list;
            }
            public override void Write(Utf8JsonWriter writer, string[] value, JsonSerializerOptions options)
            {
              ValidateConstraints(value);
              JsonSerializer.Serialize(writer, value, options);
            }
            protected virtual void ValidateConstraints(string[]? value)
            {
              if (value == null) return;
              if (value.Length < MinItems) throw new JsonException($"Array length {value.Length} is less than minimum {MinItems}");
              if (value.Length > MaxItems) throw new JsonException($"Array length {value.Length} is greater than maximum {MaxItems}");
              foreach (var item in value)
              {
                if (item.Length < MinLength) throw new JsonException($"String length {item.Length} is less than minimum {MinLength}");
                if (item.Length > MaxLength) throw new JsonException($"String length {item.Length} is greater than maximum {MaxLength}");
                if (Pattern != null && !Regex.IsMatch(item, Pattern)) throw new JsonException($"String '{item}' does not match pattern '{Pattern}'");
              }
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}

function NumericArrayConstraintAttribute(): Children {
  return (
    <CSharpFile
      path="NumericArrayConstraintAttribute.cs"
      using={["System.Numerics", "System.Text.Json", "System.Text.Json.Serialization"]}
    >
      <Namespace name="TypeSpec.Helpers.JsonConverters">
        {code`
          /// <summary>
          /// Constrains the elements of a numeric array
          /// </summary>
          public class NumericArrayConstraintAttribute<T> : JsonConverterAttribute where T : struct, INumber<T>
          {
            T? _minValue = null, _maxValue = null;
            public int MinItems { get; set; }
            public int MaxItems { get; set; } = int.MaxValue;
            public T MinValue { get { return _minValue.HasValue ? _minValue.Value : default(T); } set { _minValue = value; } }
            public T MaxValue { get { return _maxValue.HasValue ? _maxValue.Value : default(T); } set { _maxValue = value; } }
            public bool MinValueExclusive { get; set; }
            public bool MaxValueExclusive { get; set; }
            public override JsonConverter? CreateConverter(Type typeToConvert)
            {
              return new ConstrainedNumericArrayJsonConverter<T>(MinItems, MaxItems, _minValue, _maxValue, MinValueExclusive, MaxValueExclusive);
            }
          }

          public class ConstrainedNumericArrayJsonConverter<T> : JsonConverter<T[]> where T : struct, INumber<T>
          {
            private NumericJsonConverter<T> _innerConverter;
            public ConstrainedNumericArrayJsonConverter(int minItems = 0, int maxItems = int.MaxValue, T? minValue = null, T? maxValue = null, bool minExclusive = false, bool maxExclusive = false)
            {
              MinItems = minItems;
              MaxItems = maxItems;
              _innerConverter = new NumericJsonConverter<T>(minValue, maxValue, minExclusive, maxExclusive);
            }
            protected int MinItems { get; }
            protected int MaxItems { get; }
            public override T[]? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
              var list = new System.Collections.Generic.List<T>();
              if (reader.TokenType != JsonTokenType.StartArray) throw new JsonException("Expected start of array");
              while (reader.Read())
              {
                if (reader.TokenType == JsonTokenType.EndArray) break;
                list.Add(_innerConverter.Read(ref reader, typeof(T), options));
              }
              var result = list.ToArray();
              if (result.Length < MinItems) throw new JsonException($"Array length {result.Length} is less than minimum {MinItems}");
              if (result.Length > MaxItems) throw new JsonException($"Array length {result.Length} is greater than maximum {MaxItems}");
              return result;
            }
            public override void Write(Utf8JsonWriter writer, T[] value, JsonSerializerOptions options)
            {
              if (value.Length < MinItems) throw new JsonException($"Array length {value.Length} is less than minimum {MinItems}");
              if (value.Length > MaxItems) throw new JsonException($"Array length {value.Length} is greater than maximum {MaxItems}");
              writer.WriteStartArray();
              foreach (var item in value)
              {
                _innerConverter.Write(writer, item, options);
              }
              writer.WriteEndArray();
            }
          }
        `}
      </Namespace>
    </CSharpFile>
  );
}
