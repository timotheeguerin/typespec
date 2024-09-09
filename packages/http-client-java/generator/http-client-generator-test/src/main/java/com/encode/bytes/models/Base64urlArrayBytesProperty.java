// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package com.encode.bytes.models;

import com.azure.core.annotation.Generated;
import com.azure.core.annotation.Immutable;
import com.azure.core.util.Base64Url;
import com.azure.json.JsonReader;
import com.azure.json.JsonSerializable;
import com.azure.json.JsonToken;
import com.azure.json.JsonWriter;
import java.io.IOException;
import java.util.List;
import java.util.Objects;

/**
 * The Base64urlArrayBytesProperty model.
 */
@Immutable
public final class Base64urlArrayBytesProperty implements JsonSerializable<Base64urlArrayBytesProperty> {
    /*
     * The value property.
     */
    @Generated
    private final List<Base64Url> value;

    /**
     * Creates an instance of Base64urlArrayBytesProperty class.
     * 
     * @param value the value value to set.
     */
    @Generated
    public Base64urlArrayBytesProperty(List<byte[]> value) {
        if (value == null) {
            this.value = null;
        } else {
            this.value = value.stream().map(el -> Base64Url.encode(el)).collect(java.util.stream.Collectors.toList());
        }
    }

    /**
     * Get the value property: The value property.
     * 
     * @return the value value.
     */
    @Generated
    public List<byte[]> getValue() {
        if (this.value == null) {
            return null;
        }
        return this.value.stream().map(el -> el.decodedBytes()).collect(java.util.stream.Collectors.toList());
    }

    /**
     * {@inheritDoc}
     */
    @Generated
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeArrayField("value", this.value,
            (writer, element) -> writer.writeString(Objects.toString(element, null)));
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of Base64urlArrayBytesProperty from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of Base64urlArrayBytesProperty if the JsonReader was pointing to an instance of it, or null
     * if it was pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the Base64urlArrayBytesProperty.
     */
    @Generated
    public static Base64urlArrayBytesProperty fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            List<byte[]> value = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("value".equals(fieldName)) {
                    value = reader.readArray(reader1 -> {
                        Base64Url reader1ValueHolder
                            = reader1.getNullable(nonNullReader -> new Base64Url(nonNullReader.getString()));
                        if (reader1ValueHolder != null) {
                            return reader1ValueHolder.decodedBytes();
                        } else {
                            return null;
                        }
                    });
                } else {
                    reader.skipChildren();
                }
            }
            return new Base64urlArrayBytesProperty(value);
        });
    }
}
