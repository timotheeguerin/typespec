// <auto-generated/>

#nullable disable

using System;
using System.ClientModel;
using System.ClientModel.Primitives;
using System.Text.Json;

namespace _Type.Property.Optional.Models
{
    public partial class UnionIntLiteralProperty : IJsonModel<UnionIntLiteralProperty>
    {
        void IJsonModel<UnionIntLiteralProperty>.Write(Utf8JsonWriter writer, ModelReaderWriterOptions options) => throw null;

        protected virtual void JsonModelWriteCore(Utf8JsonWriter writer, ModelReaderWriterOptions options) => throw null;

        UnionIntLiteralProperty IJsonModel<UnionIntLiteralProperty>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => throw null;

        protected virtual UnionIntLiteralProperty JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => throw null;

        BinaryData IPersistableModel<UnionIntLiteralProperty>.Write(ModelReaderWriterOptions options) => throw null;

        protected virtual BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options) => throw null;

        UnionIntLiteralProperty IPersistableModel<UnionIntLiteralProperty>.Create(BinaryData data, ModelReaderWriterOptions options) => throw null;

        protected virtual UnionIntLiteralProperty PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options) => throw null;

        string IPersistableModel<UnionIntLiteralProperty>.GetFormatFromOptions(ModelReaderWriterOptions options) => throw null;

        public static implicit operator BinaryContent(UnionIntLiteralProperty unionIntLiteralProperty) => throw null;

        public static explicit operator UnionIntLiteralProperty(ClientResult result) => throw null;
    }
}
