package com.netbypass.service.service;

import com.netbypass.service.dto.ProxyResponse;
import com.netbypass.service.entity.ProxyLog;
import com.netbypass.service.repository.ProxyLogRepository;
import com.netbypass.service.repository.ProxyRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Core proxy engine for the NetBypass service.
 *
 * This is where the network bypass actually happens:
 *
 *   1. The client (WiFi user) sends a URL to our service.
 *   2. We validate it (SSRF protection, protocol check).
 *   3. We check proxy rules (allow/block patterns).
 *   4. We forward the request server-side using {@link HttpClient} (JDK 11+).
 *   5. We stream the response back to the caller.
 *   6. We persist the request log to Supabase via JPA (asynchronously).
 *
 * By routing through this server (deployed on Railway's cloud), requests
 * bypass the local WiFi firewall entirely — the user's device only connects
 * to our service, not the target directly.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ProxyService {

    private final ProxyLogRepository proxyLogRepository;
    private final ProxyRuleRepository proxyRuleRepository;

    /** JDK 11+ HttpClient — reused across requests for connection pooling */
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_2)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    private static final int MAX_TIMEOUT_SECONDS = 30;
    private static final int PREVIEW_MAX_LENGTH   = 2000;

    /** Private IP ranges — blocked to prevent SSRF attacks */
    private static final List<Pattern> SSRF_BLOCKED = Arrays.asList(
            Pattern.compile("localhost",                          Pattern.CASE_INSENSITIVE),
            Pattern.compile("127\\.\\d+\\.\\d+\\.\\d+"),
            Pattern.compile("10\\.\\d+\\.\\d+\\.\\d+"),
            Pattern.compile("192\\.168\\.\\d+\\.\\d+"),
            Pattern.compile("172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+"),
            Pattern.compile("169\\.254\\.\\d+\\.\\d+"),          // link-local
            Pattern.compile("0\\.0\\.0\\.0"),
            Pattern.compile("\\[::1\\]"),                         // IPv6 loopback
            Pattern.compile("metadata\\.google\\.internal",      Pattern.CASE_INSENSITIVE)
    );

    // ─────────────────────────────────────────────────────────────────
    //  Public API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Proxies a GET or POST request to the given target URL.
     *
     * @param targetUrl  the URL to fetch on behalf of the client
     * @param method     HTTP method ("GET" or "POST")
     * @param body       request body (for POST requests)
     * @param contentType Content-Type header to forward for POST
     * @return           proxy result with status, latency, and body preview
     */
    public ProxyResponse proxy(String targetUrl, String method, String body, String contentType) {
        long start = System.currentTimeMillis();

        // 1. Validate URL
        ValidationResult validation = validate(targetUrl);
        if (!validation.valid()) {
            return errorResponse(targetUrl, method, validation.message(), 0, start);
        }

        // 2. Check proxy rules
        RuleCheckResult ruleCheck = checkRules(targetUrl);
        if (ruleCheck.blocked()) {
            return errorResponse(targetUrl, method,
                    "Blocked by proxy rule: " + ruleCheck.matchedPattern(), 403, start);
        }

        // 3. Build HTTP request
        try {
            HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(targetUrl))
                    .timeout(Duration.ofSeconds(MAX_TIMEOUT_SECONDS))
                    .header("User-Agent", "NetBypass/1.0 (Java/Spring Boot; +https://netbypass.vercel.app)")
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "en-US,en;q=0.9");

            if ("POST".equalsIgnoreCase(method) && body != null) {
                String ct = (contentType != null && !contentType.isBlank())
                        ? contentType : "application/json";
                reqBuilder.POST(HttpRequest.BodyPublishers.ofString(body));
                reqBuilder.header("Content-Type", ct);
            } else {
                reqBuilder.GET();
            }

            HttpRequest request = reqBuilder.build();

            // 4. Execute request
            HttpResponse<byte[]> response = HTTP_CLIENT.send(request,
                    HttpResponse.BodyHandlers.ofByteArray());

            long latency       = System.currentTimeMillis() - start;
            int  statusCode    = response.statusCode();
            byte[] rawBody     = response.body();
            String respCt      = response.headers().firstValue("content-type").orElse("text/plain");
            long   size        = rawBody.length;
            boolean success    = statusCode >= 200 && statusCode < 400;

            // Build preview (text only)
            String preview = buildPreview(rawBody, respCt);

            // 5. Persist log asynchronously (don't block the response)
            saveLogAsync(targetUrl, method, statusCode, latency, success, respCt, size, null);

            log.info("PROXY {} {} → {} ({}ms, {}B)", method, targetUrl, statusCode, latency, size);

            return ProxyResponse.builder()
                    .targetUrl(targetUrl)
                    .method(method)
                    .statusCode(statusCode)
                    .success(success)
                    .latencyMs(latency)
                    .contentType(respCt)
                    .responseSize(size)
                    .preview(preview)
                    .body(new String(rawBody, StandardCharsets.UTF_8))
                    .build();

        } catch (Exception ex) {
            log.warn("PROXY FAILED {} {} → {}", method, targetUrl, ex.getMessage());
            return errorResponse(targetUrl, method, ex.getMessage(), 0, start);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  Private helpers
    // ─────────────────────────────────────────────────────────────────

    /** Validates the URL format, protocol, and SSRF safety. */
    private ValidationResult validate(String targetUrl) {
        if (targetUrl == null || targetUrl.isBlank()) {
            return new ValidationResult(false, "URL must not be blank");
        }
        try {
            URI uri = URI.create(targetUrl);
            String scheme = uri.getScheme();
            if (scheme == null || (!scheme.equals("http") && !scheme.equals("https"))) {
                return new ValidationResult(false, "Only HTTP and HTTPS protocols are allowed");
            }
        } catch (IllegalArgumentException e) {
            return new ValidationResult(false, "Invalid URL format: " + e.getMessage());
        }

        // SSRF check
        for (Pattern blocked : SSRF_BLOCKED) {
            if (blocked.matcher(targetUrl).find()) {
                return new ValidationResult(false,
                        "Access to internal/private addresses is not permitted");
            }
        }
        return new ValidationResult(true, null);
    }

    /** Checks URL against enabled proxy rules. Returns first match. */
    private RuleCheckResult checkRules(String targetUrl) {
        var rules = proxyRuleRepository.findByEnabledTrueOrderByCreatedAtDesc();
        for (var rule : rules) {
            if (matchesGlob(targetUrl, rule.getPattern())) {
                if ("block".equals(rule.getAction())) {
                    return new RuleCheckResult(true, rule.getPattern());
                }
                // Explicit allow — stop checking further
                return new RuleCheckResult(false, null);
            }
        }
        // No matching rule → allow by default
        return new RuleCheckResult(false, null);
    }

    /**
     * Simple glob matching: "*" matches any sequence of chars, "?" matches one.
     * Converts glob to regex for matching.
     */
    private boolean matchesGlob(String url, String glob) {
        // Strip "https?://" from url for pattern matching
        String urlHost = url.replaceFirst("^https?://", "");
        String patternRegex = glob
                .replace(".", "\\.")
                .replace("*", ".*")
                .replace("?", ".");
        return urlHost.matches("(?i)" + patternRegex + ".*");
    }

    /** Builds a text preview of the response body (first PREVIEW_MAX_LENGTH chars). */
    private String buildPreview(byte[] body, String contentType) {
        if (body == null || body.length == 0) return "";
        boolean isText = contentType != null && (
                contentType.contains("text") ||
                contentType.contains("json") ||
                contentType.contains("xml") ||
                contentType.contains("javascript") ||
                contentType.contains("svg")
        );
        if (!isText) return "[Binary content — " + body.length + " bytes]";
        String text = new String(body, StandardCharsets.UTF_8);
        return text.length() > PREVIEW_MAX_LENGTH
                ? text.substring(0, PREVIEW_MAX_LENGTH) + "\n... (truncated)"
                : text;
    }

    /** Saves a proxy log entry asynchronously so it doesn't block the HTTP response. */
    @Async
    protected void saveLogAsync(String targetUrl, String method, int statusCode,
                                long latencyMs, boolean success,
                                String contentType, long responseSize, String errorMessage) {
        try {
            ProxyLog logEntry = ProxyLog.builder()
                    .targetUrl(targetUrl)
                    .method(method)
                    .statusCode(statusCode)
                    .latencyMs(latencyMs)
                    .success(success)
                    .contentType(contentType)
                    .responseSize(responseSize)
                    .errorMessage(errorMessage)
                    .build();
            proxyLogRepository.save(logEntry);
        } catch (Exception ex) {
            log.warn("Failed to save proxy log: {}", ex.getMessage());
        }
    }

    /** Builds an error ProxyResponse and persists a failed log entry. */
    private ProxyResponse errorResponse(String targetUrl, String method,
                                         String errorMessage, int statusCode, long start) {
        long latency = System.currentTimeMillis() - start;
        saveLogAsync(targetUrl, method, statusCode, latency, false, null, 0, errorMessage);
        return ProxyResponse.builder()
                .targetUrl(targetUrl)
                .method(method)
                .statusCode(statusCode)
                .success(false)
                .latencyMs(latency)
                .errorMessage(errorMessage)
                .build();
    }

    // ─────────────────────────────────────────────────────────────────
    //  Inner record types (Java 16+)
    // ─────────────────────────────────────────────────────────────────

    private record ValidationResult(boolean valid, String message) {}
    private record RuleCheckResult(boolean blocked, String matchedPattern) {}
}
