// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package com.azure.resourcemanager.resources.models;

import com.azure.core.http.rest.PagedIterable;
import com.azure.core.http.rest.Response;
import com.azure.core.util.Context;

/**
 * Resource collection API of Nesteds.
 */
public interface Nesteds {
    /**
     * Get a NestedProxyResource.
     * 
     * @param resourceGroupName The name of the resource group. The name is case insensitive.
     * @param topLevelTrackedResourceName arm resource name for path.
     * @param nextedProxyResourceName Name of the nested resource.
     * @param context The context to associate with this operation.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a NestedProxyResource along with {@link Response}.
     */
    Response<NestedProxyResource> getWithResponse(String resourceGroupName, String topLevelTrackedResourceName,
        String nextedProxyResourceName, Context context);

    /**
     * Get a NestedProxyResource.
     * 
     * @param resourceGroupName The name of the resource group. The name is case insensitive.
     * @param topLevelTrackedResourceName arm resource name for path.
     * @param nextedProxyResourceName Name of the nested resource.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a NestedProxyResource.
     */
    NestedProxyResource get(String resourceGroupName, String topLevelTrackedResourceName,
        String nextedProxyResourceName);

    /**
     * Delete a NestedProxyResource.
     * 
     * @param resourceGroupName The name of the resource group. The name is case insensitive.
     * @param topLevelTrackedResourceName arm resource name for path.
     * @param nextedProxyResourceName Name of the nested resource.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     */
    void delete(String resourceGroupName, String topLevelTrackedResourceName, String nextedProxyResourceName);

    /**
     * Delete a NestedProxyResource.
     * 
     * @param resourceGroupName The name of the resource group. The name is case insensitive.
     * @param topLevelTrackedResourceName arm resource name for path.
     * @param nextedProxyResourceName Name of the nested resource.
     * @param context The context to associate with this operation.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     */
    void delete(String resourceGroupName, String topLevelTrackedResourceName, String nextedProxyResourceName,
        Context context);

    /**
     * List NestedProxyResource resources by TopLevelTrackedResource.
     * 
     * @param resourceGroupName The name of the resource group. The name is case insensitive.
     * @param topLevelTrackedResourceName arm resource name for path.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response of a NestedProxyResource list operation as paginated response with {@link PagedIterable}.
     */
    PagedIterable<NestedProxyResource> listByTopLevelTrackedResource(String resourceGroupName,
        String topLevelTrackedResourceName);

    /**
     * List NestedProxyResource resources by TopLevelTrackedResource.
     * 
     * @param resourceGroupName The name of the resource group. The name is case insensitive.
     * @param topLevelTrackedResourceName arm resource name for path.
     * @param context The context to associate with this operation.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response of a NestedProxyResource list operation as paginated response with {@link PagedIterable}.
     */
    PagedIterable<NestedProxyResource> listByTopLevelTrackedResource(String resourceGroupName,
        String topLevelTrackedResourceName, Context context);

    /**
     * Get a NestedProxyResource.
     * 
     * @param id the resource ID.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a NestedProxyResource along with {@link Response}.
     */
    NestedProxyResource getById(String id);

    /**
     * Get a NestedProxyResource.
     * 
     * @param id the resource ID.
     * @param context The context to associate with this operation.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a NestedProxyResource along with {@link Response}.
     */
    Response<NestedProxyResource> getByIdWithResponse(String id, Context context);

    /**
     * Delete a NestedProxyResource.
     * 
     * @param id the resource ID.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     */
    void deleteById(String id);

    /**
     * Delete a NestedProxyResource.
     * 
     * @param id the resource ID.
     * @param context The context to associate with this operation.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws com.azure.core.management.exception.ManagementException thrown if the request is rejected by server.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     */
    void deleteByIdWithResponse(String id, Context context);

    /**
     * Begins definition for a new NestedProxyResource resource.
     * 
     * @param name resource name.
     * @return the first stage of the new NestedProxyResource definition.
     */
    NestedProxyResource.DefinitionStages.Blank define(String name);
}
