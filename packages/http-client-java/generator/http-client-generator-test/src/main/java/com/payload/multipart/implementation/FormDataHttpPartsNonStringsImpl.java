// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package com.payload.multipart.implementation;

import com.azure.core.annotation.BodyParam;
import com.azure.core.annotation.ExpectedResponses;
import com.azure.core.annotation.HeaderParam;
import com.azure.core.annotation.Host;
import com.azure.core.annotation.HostParam;
import com.azure.core.annotation.Post;
import com.azure.core.annotation.ReturnType;
import com.azure.core.annotation.ServiceInterface;
import com.azure.core.annotation.ServiceMethod;
import com.azure.core.annotation.UnexpectedResponseExceptionType;
import com.azure.core.exception.ClientAuthenticationException;
import com.azure.core.exception.HttpResponseException;
import com.azure.core.exception.ResourceModifiedException;
import com.azure.core.exception.ResourceNotFoundException;
import com.azure.core.http.rest.RequestOptions;
import com.azure.core.http.rest.Response;
import com.azure.core.http.rest.RestProxy;
import com.azure.core.util.BinaryData;
import com.azure.core.util.Context;
import com.azure.core.util.FluxUtil;
import reactor.core.publisher.Mono;

/**
 * An instance of this class provides access to all the operations defined in FormDataHttpPartsNonStrings.
 */
public final class FormDataHttpPartsNonStringsImpl {
    /**
     * The proxy service used to perform REST calls.
     */
    private final FormDataHttpPartsNonStringsService service;

    /**
     * The service client containing this operation class.
     */
    private final MultiPartClientImpl client;

    /**
     * Initializes an instance of FormDataHttpPartsNonStringsImpl.
     * 
     * @param client the instance of the service client containing this operation class.
     */
    FormDataHttpPartsNonStringsImpl(MultiPartClientImpl client) {
        this.service = RestProxy.create(FormDataHttpPartsNonStringsService.class, client.getHttpPipeline(),
            client.getSerializerAdapter());
        this.client = client;
    }

    /**
     * The interface defining all the services for MultiPartClientFormDataHttpPartsNonStrings to be used by the proxy
     * service to perform REST calls.
     */
    @Host("{endpoint}")
    @ServiceInterface(name = "MultiPartClientFormD")
    public interface FormDataHttpPartsNonStringsService {
        // @Multipart not supported by RestProxy
        @Post("/multipart/form-data/non-string-float")
        @ExpectedResponses({ 204 })
        @UnexpectedResponseExceptionType(value = ClientAuthenticationException.class, code = { 401 })
        @UnexpectedResponseExceptionType(value = ResourceNotFoundException.class, code = { 404 })
        @UnexpectedResponseExceptionType(value = ResourceModifiedException.class, code = { 409 })
        @UnexpectedResponseExceptionType(HttpResponseException.class)
        Mono<Response<Void>> floatMethod(@HostParam("endpoint") String endpoint,
            @HeaderParam("content-type") String contentType, @BodyParam("multipart/form-data") BinaryData body,
            RequestOptions requestOptions, Context context);

        // @Multipart not supported by RestProxy
        @Post("/multipart/form-data/non-string-float")
        @ExpectedResponses({ 204 })
        @UnexpectedResponseExceptionType(value = ClientAuthenticationException.class, code = { 401 })
        @UnexpectedResponseExceptionType(value = ResourceNotFoundException.class, code = { 404 })
        @UnexpectedResponseExceptionType(value = ResourceModifiedException.class, code = { 409 })
        @UnexpectedResponseExceptionType(HttpResponseException.class)
        Response<Void> floatMethodSync(@HostParam("endpoint") String endpoint,
            @HeaderParam("content-type") String contentType, @BodyParam("multipart/form-data") BinaryData body,
            RequestOptions requestOptions, Context context);
    }

    /**
     * Test content-type: multipart/form-data for non string.
     * 
     * @param body The body parameter.
     * @param requestOptions The options to configure the HTTP request before HTTP client sends it.
     * @throws HttpResponseException thrown if the request is rejected by server.
     * @throws ClientAuthenticationException thrown if the request is rejected by server on status code 401.
     * @throws ResourceNotFoundException thrown if the request is rejected by server on status code 404.
     * @throws ResourceModifiedException thrown if the request is rejected by server on status code 409.
     * @return the {@link Response} on successful completion of {@link Mono}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Mono<Response<Void>> floatMethodWithResponseAsync(BinaryData body, RequestOptions requestOptions) {
        final String contentType = "multipart/form-data";
        return FluxUtil.withContext(
            context -> service.floatMethod(this.client.getEndpoint(), contentType, body, requestOptions, context));
    }

    /**
     * Test content-type: multipart/form-data for non string.
     * 
     * @param body The body parameter.
     * @param requestOptions The options to configure the HTTP request before HTTP client sends it.
     * @throws HttpResponseException thrown if the request is rejected by server.
     * @throws ClientAuthenticationException thrown if the request is rejected by server on status code 401.
     * @throws ResourceNotFoundException thrown if the request is rejected by server on status code 404.
     * @throws ResourceModifiedException thrown if the request is rejected by server on status code 409.
     * @return the {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<Void> floatMethodWithResponse(BinaryData body, RequestOptions requestOptions) {
        final String contentType = "multipart/form-data";
        return service.floatMethodSync(this.client.getEndpoint(), contentType, body, requestOptions, Context.NONE);
    }
}
