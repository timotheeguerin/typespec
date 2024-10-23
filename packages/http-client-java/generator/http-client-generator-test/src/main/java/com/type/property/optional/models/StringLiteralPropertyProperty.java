// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package com.type.property.optional.models;

/**
 * Defines values for StringLiteralPropertyProperty.
 */
public enum StringLiteralPropertyProperty {
    /**
     * Enum value hello.
     */
    HELLO("hello");

    /**
     * The actual serialized value for a StringLiteralPropertyProperty instance.
     */
    private final String value;

    StringLiteralPropertyProperty(String value) {
        this.value = value;
    }

    /**
     * Parses a serialized value to a StringLiteralPropertyProperty instance.
     * 
     * @param value the serialized value to parse.
     * @return the parsed StringLiteralPropertyProperty object, or null if unable to parse.
     */
    public static StringLiteralPropertyProperty fromString(String value) {
        if (value == null) {
            return null;
        }
        StringLiteralPropertyProperty[] items = StringLiteralPropertyProperty.values();
        for (StringLiteralPropertyProperty item : items) {
            if (item.toString().equalsIgnoreCase(value)) {
                return item;
            }
        }
        return null;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return this.value;
    }
}
