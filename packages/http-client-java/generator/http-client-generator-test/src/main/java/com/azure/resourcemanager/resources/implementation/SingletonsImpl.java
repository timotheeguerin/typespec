// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package com.azure.resourcemanager.resources.implementation;

import com.azure.core.http.rest.PagedIterable;
import com.azure.core.http.rest.Response;
import com.azure.core.http.rest.SimpleResponse;
import com.azure.core.util.Context;
import com.azure.core.util.logging.ClientLogger;
import com.azure.resourcemanager.resources.fluent.SingletonsClient;
import com.azure.resourcemanager.resources.fluent.models.SingletonTrackedResourceInner;
import com.azure.resourcemanager.resources.models.SingletonTrackedResource;
import com.azure.resourcemanager.resources.models.Singletons;

public final class SingletonsImpl implements Singletons {
    private static final ClientLogger LOGGER = new ClientLogger(SingletonsImpl.class);

    private final SingletonsClient innerClient;

    private final com.azure.resourcemanager.resources.ResourcesManager serviceManager;

    public SingletonsImpl(SingletonsClient innerClient,
        com.azure.resourcemanager.resources.ResourcesManager serviceManager) {
        this.innerClient = innerClient;
        this.serviceManager = serviceManager;
    }

    public Response<SingletonTrackedResource> getByResourceGroupWithResponse(String resourceGroupName,
        Context context) {
        Response<SingletonTrackedResourceInner> inner
            = this.serviceClient().getByResourceGroupWithResponse(resourceGroupName, context);
        if (inner != null) {
            return new SimpleResponse<>(inner.getRequest(), inner.getStatusCode(), inner.getHeaders(),
                new SingletonTrackedResourceImpl(inner.getValue(), this.manager()));
        } else {
            return null;
        }
    }

    public SingletonTrackedResource getByResourceGroup(String resourceGroupName) {
        SingletonTrackedResourceInner inner = this.serviceClient().getByResourceGroup(resourceGroupName);
        if (inner != null) {
            return new SingletonTrackedResourceImpl(inner, this.manager());
        } else {
            return null;
        }
    }

    public SingletonTrackedResource createOrUpdate(String resourceGroupName, SingletonTrackedResourceInner resource) {
        SingletonTrackedResourceInner inner = this.serviceClient().createOrUpdate(resourceGroupName, resource);
        if (inner != null) {
            return new SingletonTrackedResourceImpl(inner, this.manager());
        } else {
            return null;
        }
    }

    public SingletonTrackedResource createOrUpdate(String resourceGroupName, SingletonTrackedResourceInner resource,
        Context context) {
        SingletonTrackedResourceInner inner = this.serviceClient().createOrUpdate(resourceGroupName, resource, context);
        if (inner != null) {
            return new SingletonTrackedResourceImpl(inner, this.manager());
        } else {
            return null;
        }
    }

    public Response<SingletonTrackedResource> updateWithResponse(String resourceGroupName,
        SingletonTrackedResourceInner properties, Context context) {
        Response<SingletonTrackedResourceInner> inner
            = this.serviceClient().updateWithResponse(resourceGroupName, properties, context);
        if (inner != null) {
            return new SimpleResponse<>(inner.getRequest(), inner.getStatusCode(), inner.getHeaders(),
                new SingletonTrackedResourceImpl(inner.getValue(), this.manager()));
        } else {
            return null;
        }
    }

    public SingletonTrackedResource update(String resourceGroupName, SingletonTrackedResourceInner properties) {
        SingletonTrackedResourceInner inner = this.serviceClient().update(resourceGroupName, properties);
        if (inner != null) {
            return new SingletonTrackedResourceImpl(inner, this.manager());
        } else {
            return null;
        }
    }

    public PagedIterable<SingletonTrackedResource> listByResourceGroup(String resourceGroupName) {
        PagedIterable<SingletonTrackedResourceInner> inner
            = this.serviceClient().listByResourceGroup(resourceGroupName);
        return ResourceManagerUtils.mapPage(inner, inner1 -> new SingletonTrackedResourceImpl(inner1, this.manager()));
    }

    public PagedIterable<SingletonTrackedResource> listByResourceGroup(String resourceGroupName, Context context) {
        PagedIterable<SingletonTrackedResourceInner> inner
            = this.serviceClient().listByResourceGroup(resourceGroupName, context);
        return ResourceManagerUtils.mapPage(inner, inner1 -> new SingletonTrackedResourceImpl(inner1, this.manager()));
    }

    private SingletonsClient serviceClient() {
        return this.innerClient;
    }

    private com.azure.resourcemanager.resources.ResourcesManager manager() {
        return this.serviceManager;
    }
}
