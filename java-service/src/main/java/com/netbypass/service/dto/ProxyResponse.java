package com.netbypass.service.dto;

import lombok.Builder;
import lombok.Data;

/**
 * DTO representing the result of a proxied HTTP request.
 *
 * Returned by {@code POST /api/proxy} and contains the full response
 * metadata plus a content preview (first 2000 chars).
 */
@Data
@Builder
public class ProxyResponse {

    /** HTTP status code from the target server (0 if connection failed) */
    private int statusCode;

    /** True if statusCode is in the 2xx range */
    private boolean success;

    /** Round-trip latency in milliseconds */
    private long latencyMs;

    /** Content-Type header from target response */
    private String contentType;

    /** Response body size in bytes */
    private long responseSize;

    /** First 2000 characters of the response body */
    private String preview;

    /** Full raw response body (base64 encoded for binary content) */
    private String body;

    /** Error message if the request failed */
    private String errorMessage;

    /** The original target URL that was proxied */
    private String targetUrl;

    /** HTTP method used (GET, POST, etc.) */
    private String method;
}
