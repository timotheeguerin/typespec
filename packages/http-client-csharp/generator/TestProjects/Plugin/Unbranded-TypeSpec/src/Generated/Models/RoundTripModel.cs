// <auto-generated/>

#nullable disable

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using UnbrandedTypeSpec;

namespace UnbrandedTypeSpec.Models
{
    /// <summary> this is a roundtrip model. </summary>
    public partial class RoundTripModel
    {
        /// <summary> Initializes a new instance of <see cref="RoundTripModel"/>. </summary>
        /// <param name="requiredString"> Required string, illustrating a reference type property. </param>
        /// <param name="requiredInt"> Required int, illustrating a value type property. </param>
        /// <param name="requiredCollection"> Required collection of enums. </param>
        /// <param name="requiredDictionary"> Required dictionary of enums. </param>
        /// <param name="requiredModel"> Required model. </param>
        /// <param name="requiredUnknown"> required unknown. </param>
        /// <param name="requiredRecordUnknown"> required record of unknown. </param>
        /// <param name="modelWithRequiredNullable"> this is a model with required nullable properties. </param>
        /// <param name="requiredBytes"> Required bytes. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="requiredString"/>, <paramref name="requiredCollection"/>, <paramref name="requiredDictionary"/>, <paramref name="requiredModel"/>, <paramref name="requiredUnknown"/>, <paramref name="requiredRecordUnknown"/>, <paramref name="modelWithRequiredNullable"/> or <paramref name="requiredBytes"/> is null. </exception>
        public RoundTripModel(string requiredString, int requiredInt, IEnumerable<StringFixedEnum> requiredCollection, IDictionary<string, StringExtensibleEnum> requiredDictionary, Thing requiredModel, BinaryData requiredUnknown, IDictionary<string, BinaryData> requiredRecordUnknown, ModelWithRequiredNullableProperties modelWithRequiredNullable, BinaryData requiredBytes)
        {
            Argument.AssertNotNull(requiredString, nameof(requiredString));
            Argument.AssertNotNull(requiredCollection, nameof(requiredCollection));
            Argument.AssertNotNull(requiredDictionary, nameof(requiredDictionary));
            Argument.AssertNotNull(requiredModel, nameof(requiredModel));
            Argument.AssertNotNull(requiredUnknown, nameof(requiredUnknown));
            Argument.AssertNotNull(requiredRecordUnknown, nameof(requiredRecordUnknown));
            Argument.AssertNotNull(modelWithRequiredNullable, nameof(modelWithRequiredNullable));
            Argument.AssertNotNull(requiredBytes, nameof(requiredBytes));

            RequiredString = requiredString;
            RequiredInt = requiredInt;
            RequiredCollection = requiredCollection.ToList();
            RequiredDictionary = requiredDictionary;
            RequiredModel = requiredModel;
            IntExtensibleEnumCollection = new ChangeTrackingList<IntExtensibleEnum>();
            FloatExtensibleEnumCollection = new ChangeTrackingList<FloatExtensibleEnum>();
            FloatFixedEnumCollection = new ChangeTrackingList<FloatFixedEnum>();
            IntFixedEnumCollection = new ChangeTrackingList<IntFixedEnum>();
            RequiredUnknown = requiredUnknown;
            RequiredRecordUnknown = requiredRecordUnknown;
            OptionalRecordUnknown = new ChangeTrackingDictionary<string, BinaryData>();
            ReadOnlyRequiredRecordUnknown = new ChangeTrackingDictionary<string, BinaryData>();
            ReadOnlyOptionalRecordUnknown = new ChangeTrackingDictionary<string, BinaryData>();
            ModelWithRequiredNullable = modelWithRequiredNullable;
            RequiredBytes = requiredBytes;
        }

        /// <summary> Required string, illustrating a reference type property. </summary>
        public string RequiredString { get; set; }

        /// <summary> Required int, illustrating a value type property. </summary>
        public int RequiredInt { get; set; }

        /// <summary> Required collection of enums. </summary>
        public IList<StringFixedEnum> RequiredCollection { get; set; }

        /// <summary> Required dictionary of enums. </summary>
        public IDictionary<string, StringExtensibleEnum> RequiredDictionary { get; set; }

        /// <summary> Required model. </summary>
        public Thing RequiredModel { get; set; }

        /// <summary> this is an int based extensible enum. </summary>
        public IntExtensibleEnum? IntExtensibleEnum { get; set; }

        /// <summary> this is a collection of int based extensible enum. </summary>
        public IList<IntExtensibleEnum> IntExtensibleEnumCollection { get; set; }

        /// <summary> this is a float based extensible enum. </summary>
        public FloatExtensibleEnum? FloatExtensibleEnum { get; set; }

        /// <summary> this is a float based extensible enum. </summary>
        public FloatExtensibleEnumWithIntValue? FloatExtensibleEnumWithIntValue { get; set; }

        /// <summary> this is a collection of float based extensible enum. </summary>
        public IList<FloatExtensibleEnum> FloatExtensibleEnumCollection { get; set; }

        /// <summary> this is a float based fixed enum. </summary>
        public FloatFixedEnum? FloatFixedEnum { get; set; }

        /// <summary> this is a float based fixed enum. </summary>
        public FloatFixedEnumWithIntValue? FloatFixedEnumWithIntValue { get; set; }

        /// <summary> this is a collection of float based fixed enum. </summary>
        public IList<FloatFixedEnum> FloatFixedEnumCollection { get; set; }

        /// <summary> this is a int based fixed enum. </summary>
        public IntFixedEnum? IntFixedEnum { get; set; }

        /// <summary> this is a collection of int based fixed enum. </summary>
        public IList<IntFixedEnum> IntFixedEnumCollection { get; set; }

        /// <summary> this is a string based fixed enum. </summary>
        public StringFixedEnum? StringFixedEnum { get; set; }

        /// <summary>
        /// required unknown
        /// <para> To assign an object to this property use <see cref="BinaryData.FromObjectAsJson{T}(T, JsonSerializerOptions?)"/>. </para>
        /// <para> To assign an already formatted json string to this property use <see cref="BinaryData.FromString(string)"/>. </para>
        /// <para>
        /// Examples:
        /// <list type="bullet">
        /// <item>
        /// <term> BinaryData.FromObjectAsJson("foo"). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("\"foo\""). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromObjectAsJson(new { key = "value" }). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("{\"key\": \"value\"}"). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// </list>
        /// </para>
        /// </summary>
        public BinaryData RequiredUnknown { get; set; }

        /// <summary>
        /// optional unknown
        /// <para> To assign an object to this property use <see cref="BinaryData.FromObjectAsJson{T}(T, JsonSerializerOptions?)"/>. </para>
        /// <para> To assign an already formatted json string to this property use <see cref="BinaryData.FromString(string)"/>. </para>
        /// <para>
        /// Examples:
        /// <list type="bullet">
        /// <item>
        /// <term> BinaryData.FromObjectAsJson("foo"). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("\"foo\""). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromObjectAsJson(new { key = "value" }). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("{\"key\": \"value\"}"). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// </list>
        /// </para>
        /// </summary>
        public BinaryData OptionalUnknown { get; set; }

        /// <summary>
        /// required record of unknown
        /// <para> To assign an object to the value of this property use <see cref="BinaryData.FromObjectAsJson{T}(T, JsonSerializerOptions?)"/>. </para>
        /// <para> To assign an already formatted json string to this property use <see cref="BinaryData.FromString(string)"/>. </para>
        /// <para>
        /// Examples:
        /// <list type="bullet">
        /// <item>
        /// <term> BinaryData.FromObjectAsJson("foo"). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("\"foo\""). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromObjectAsJson(new { key = "value" }). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("{\"key\": \"value\"}"). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// </list>
        /// </para>
        /// </summary>
        public IDictionary<string, BinaryData> RequiredRecordUnknown { get; set; }

        /// <summary>
        /// optional record of unknown
        /// <para> To assign an object to the value of this property use <see cref="BinaryData.FromObjectAsJson{T}(T, JsonSerializerOptions?)"/>. </para>
        /// <para> To assign an already formatted json string to this property use <see cref="BinaryData.FromString(string)"/>. </para>
        /// <para>
        /// Examples:
        /// <list type="bullet">
        /// <item>
        /// <term> BinaryData.FromObjectAsJson("foo"). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("\"foo\""). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromObjectAsJson(new { key = "value" }). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("{\"key\": \"value\"}"). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// </list>
        /// </para>
        /// </summary>
        public IDictionary<string, BinaryData> OptionalRecordUnknown { get; set; }

        /// <summary>
        /// required readonly record of unknown
        /// <para> To assign an object to the value of this property use <see cref="BinaryData.FromObjectAsJson{T}(T, JsonSerializerOptions?)"/>. </para>
        /// <para> To assign an already formatted json string to this property use <see cref="BinaryData.FromString(string)"/>. </para>
        /// <para>
        /// Examples:
        /// <list type="bullet">
        /// <item>
        /// <term> BinaryData.FromObjectAsJson("foo"). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("\"foo\""). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromObjectAsJson(new { key = "value" }). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("{\"key\": \"value\"}"). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// </list>
        /// </para>
        /// </summary>
        public IReadOnlyDictionary<string, BinaryData> ReadOnlyRequiredRecordUnknown { get; set; }

        /// <summary>
        /// optional readonly record of unknown
        /// <para> To assign an object to the value of this property use <see cref="BinaryData.FromObjectAsJson{T}(T, JsonSerializerOptions?)"/>. </para>
        /// <para> To assign an already formatted json string to this property use <see cref="BinaryData.FromString(string)"/>. </para>
        /// <para>
        /// Examples:
        /// <list type="bullet">
        /// <item>
        /// <term> BinaryData.FromObjectAsJson("foo"). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("\"foo\""). </term>
        /// <description> Creates a payload of "foo". </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromObjectAsJson(new { key = "value" }). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// <item>
        /// <term> BinaryData.FromString("{\"key\": \"value\"}"). </term>
        /// <description> Creates a payload of { "key": "value" }. </description>
        /// </item>
        /// </list>
        /// </para>
        /// </summary>
        public IReadOnlyDictionary<string, BinaryData> ReadOnlyOptionalRecordUnknown { get; set; }

        /// <summary> this is a model with required nullable properties. </summary>
        public ModelWithRequiredNullableProperties ModelWithRequiredNullable { get; set; }

        /// <summary>
        /// Required bytes
        /// <para>
        /// To assign a byte[] to this property use <see cref="BinaryData.FromBytes(byte[])"/>.
        /// The byte[] will be serialized to a Base64 encoded string.
        /// </para>
        /// <para>
        /// Examples:
        /// <list type="bullet">
        /// <item>
        /// <term> BinaryData.FromBytes(new byte[] { 1, 2, 3 }). </term>
        /// <description> Creates a payload of "AQID". </description>
        /// </item>
        /// </list>
        /// </para>
        /// </summary>
        public BinaryData RequiredBytes { get; set; }
    }
}
