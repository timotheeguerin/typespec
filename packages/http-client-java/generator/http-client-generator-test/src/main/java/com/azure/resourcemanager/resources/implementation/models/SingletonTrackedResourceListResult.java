// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package com.azure.resourcemanager.resources.implementation.models;

import com.azure.core.annotation.Immutable;
import com.azure.core.util.logging.ClientLogger;
import com.azure.json.JsonReader;
import com.azure.json.JsonSerializable;
import com.azure.json.JsonToken;
import com.azure.json.JsonWriter;
import com.azure.resourcemanager.resources.fluent.models.SingletonTrackedResourceInner;
import java.io.IOException;
import java.util.List;

/**
 * The response of a SingletonTrackedResource list operation.
 */
@Immutable
public final class SingletonTrackedResourceListResult implements JsonSerializable<SingletonTrackedResourceListResult> {
    /*
     * The SingletonTrackedResource items on this page
     */
    private List<SingletonTrackedResourceInner> value;

    /*
     * The link to the next page of items
     */
    private String nextLink;

    /**
     * Creates an instance of SingletonTrackedResourceListResult class.
     */
    private SingletonTrackedResourceListResult() {
    }

    /**
     * Get the value property: The SingletonTrackedResource items on this page.
     * 
     * @return the value value.
     */
    public List<SingletonTrackedResourceInner> value() {
        return this.value;
    }

    /**
     * Get the nextLink property: The link to the next page of items.
     * 
     * @return the nextLink value.
     */
    public String nextLink() {
        return this.nextLink;
    }

    /**
     * Validates the instance.
     * 
     * @throws IllegalArgumentException thrown if the instance is not valid.
     */
    public void validate() {
        if (value() == null) {
            throw LOGGER.atError()
                .log(new IllegalArgumentException(
                    "Missing required property value in model SingletonTrackedResourceListResult"));
        } else {
            value().forEach(e -> e.validate());
        }
    }

    private static final ClientLogger LOGGER = new ClientLogger(SingletonTrackedResourceListResult.class);

    /**
     * {@inheritDoc}
     */
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeArrayField("value", this.value, (writer, element) -> writer.writeJson(element));
        jsonWriter.writeStringField("nextLink", this.nextLink);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of SingletonTrackedResourceListResult from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of SingletonTrackedResourceListResult if the JsonReader was pointing to an instance of it, or
     * null if it was pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the SingletonTrackedResourceListResult.
     */
    public static SingletonTrackedResourceListResult fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            SingletonTrackedResourceListResult deserializedSingletonTrackedResourceListResult
                = new SingletonTrackedResourceListResult();
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("value".equals(fieldName)) {
                    List<SingletonTrackedResourceInner> value
                        = reader.readArray(reader1 -> SingletonTrackedResourceInner.fromJson(reader1));
                    deserializedSingletonTrackedResourceListResult.value = value;
                } else if ("nextLink".equals(fieldName)) {
                    deserializedSingletonTrackedResourceListResult.nextLink = reader.getString();
                } else {
                    reader.skipChildren();
                }
            }

            return deserializedSingletonTrackedResourceListResult;
        });
    }
}
