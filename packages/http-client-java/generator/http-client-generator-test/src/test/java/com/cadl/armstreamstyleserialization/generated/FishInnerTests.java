// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package com.cadl.armstreamstyleserialization.generated;

import com.azure.core.util.BinaryData;
import com.cadl.armstreamstyleserialization.fluent.models.FishInner;
import org.junit.jupiter.api.Assertions;

public final class FishInnerTests {
    @org.junit.jupiter.api.Test
    public void testDeserialize() throws Exception {
        FishInner model = BinaryData.fromString("{\"kind\":\"Fish\",\"age\":992383820,\"dna\":\"mhquvgjxp\"}")
            .toObject(FishInner.class);
        Assertions.assertEquals(992383820, model.age());
        Assertions.assertEquals("mhquvgjxp", model.dna());
    }
}