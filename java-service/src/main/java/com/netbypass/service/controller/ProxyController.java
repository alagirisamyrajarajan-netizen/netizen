package com.netbypass.service.controller;

import com.netbypass.service.dto.CreateRuleRequest;
import com.netbypass.service.dto.ProxyResponse;
import com.netbypass.service.entity.ProxyLog;
import com.netbypass.service.entity.ProxyRule;
import com.netbypass.service.repository.ProxyLogRepository;
import com.netbypass.service.repository.ProxyRuleRepository;
import com.netbypass.service.service.ProxyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST controller exposing all NetBypass API endpoints.
 *
 * <pre>
 *   GET  /api/proxy?url=&method=      → Proxy a GET request
 *   POST /api/proxy                    → Proxy a POST request with body
 *   GET  /api/logs?limit=N             → Recent proxy request logs
 *   GET  /api/rules                    → List all proxy rules
 *   POST /api/rules                    → Create a new proxy rule
 *   GET  /api/status                   → Service health check
 * </pre>
 *
 * CORS is configured globally in {@link com.netbypass.service.config.CorsConfig}
 * so the Next.js frontend on Vercel can call these endpoints freely.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class ProxyController {

    private final ProxyService     proxyService;
    private final ProxyLogRepository  logRepository;
    private final ProxyRuleRepository ruleRepository;

    // ─────────────────────────────────────────────────────────────────
    //  PROXY ENDPOINT
    // ─────────────────────────────────────────────────────────────────

    /**
     * GET /api/proxy?url=<targetUrl>
     *
     * Proxies a GET request to the given URL through our server,
     * bypassing any local WiFi restrictions on the caller's network.
     */
    @GetMapping("/proxy")
    public ResponseEntity<ProxyResponse> proxyGet(
            @RequestParam("url") String url) {

        log.info("→ GET proxy request for: {}", url);
        ProxyResponse result = proxyService.proxy(url, "GET", null, null);
        return buildProxyResponse(result);
    }

    /**
     * POST /api/proxy?url=<targetUrl>
     * Body: raw request body to forward
     *
     * Proxies a POST request with an optional body.
     */
    @PostMapping("/proxy")
    public ResponseEntity<ProxyResponse> proxyPost(
            @RequestParam("url")                                  String url,
            @RequestBody(required = false)                        String body,
            @RequestHeader(value = "Content-Type", required = false) String contentType) {

        log.info("→ POST proxy request for: {}", url);
        ProxyResponse result = proxyService.proxy(url, "POST", body, contentType);
        return buildProxyResponse(result);
    }

    private ResponseEntity<ProxyResponse> buildProxyResponse(ProxyResponse result) {
        if (result.getErrorMessage() != null && result.getStatusCode() == 403) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(result);
        }
        if (result.getErrorMessage() != null && result.getStatusCode() == 0) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(result);
        }
        if (result.getErrorMessage() != null && result.getStatusCode() == 400) {
            return ResponseEntity.badRequest().body(result);
        }
        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────────
    //  LOGS ENDPOINT
    // ─────────────────────────────────────────────────────────────────

    /**
     * GET /api/logs?limit=20
     *
     * Returns the most recent proxy request logs from Supabase,
     * ordered by timestamp descending.
     */
    @GetMapping("/logs")
    public ResponseEntity<Map<String, Object>> getLogs(
            @RequestParam(value = "limit", defaultValue = "20") int limit) {

        int safedLimit = Math.min(Math.max(limit, 1), 100);
        Page<ProxyLog> page = logRepository.findAllByOrderByCreatedAtDesc(
                PageRequest.of(0, safedLimit));

        // Build stats
        long totalSuccess = logRepository.countBySuccessTrue();
        long totalFailed  = logRepository.countBySuccessFalse();
        Double avgLatency = logRepository.averageLatency();

        Map<String, Object> response = new HashMap<>();
        response.put("logs",         page.getContent());
        response.put("total",        page.getTotalElements());
        response.put("totalSuccess", totalSuccess);
        response.put("totalFailed",  totalFailed);
        response.put("avgLatencyMs", avgLatency != null ? Math.round(avgLatency) : 0);
        response.put("demo",         false);

        return ResponseEntity.ok(response);
    }

    // ─────────────────────────────────────────────────────────────────
    //  RULES ENDPOINT
    // ─────────────────────────────────────────────────────────────────

    /**
     * GET /api/rules
     *
     * Returns all proxy rules (allow/block) ordered by creation date descending.
     */
    @GetMapping("/rules")
    public ResponseEntity<Map<String, Object>> getRules() {
        List<ProxyRule> rules = ruleRepository.findAllByOrderByCreatedAtDesc();
        Map<String, Object> response = new HashMap<>();
        response.put("rules", rules);
        response.put("demo",  false);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/rules
     * Body: { "pattern": "*.example.com", "action": "allow", "description": "..." }
     *
     * Creates a new proxy allow/block rule.
     * Validates pattern and action using Bean Validation.
     */
    @PostMapping("/rules")
    public ResponseEntity<Map<String, Object>> createRule(
            @Valid @RequestBody CreateRuleRequest request) {

        ProxyRule newRule = ProxyRule.builder()
                .pattern(request.getPattern())
                .action(request.getAction())
                .description(request.getDescription())
                .enabled(true)
                .build();

        ProxyRule saved = ruleRepository.save(newRule);
        log.info("New proxy rule created: {} → {}", saved.getPattern(), saved.getAction());

        Map<String, Object> response = new HashMap<>();
        response.put("rule", saved);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // ─────────────────────────────────────────────────────────────────
    //  STATUS / HEALTH CHECK
    // ─────────────────────────────────────────────────────────────────

    /**
     * GET /api/status
     *
     * Returns service health info including DB connectivity.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        boolean dbConnected;
        try {
            logRepository.count();
            dbConnected = true;
        } catch (Exception e) {
            dbConnected = false;
        }

        Map<String, Object> status = new HashMap<>();
        status.put("status",          dbConnected ? "operational" : "degraded");
        status.put("version",         "1.0.0");
        status.put("runtime",         "Java " + System.getProperty("java.version"));
        status.put("framework",       "Spring Boot 3.2");
        status.put("dbConnected",     dbConnected);
        status.put("timestamp",       OffsetDateTime.now().toString());
        status.put("engine",          "java.net.http.HttpClient (JDK 11+)");

        return ResponseEntity.ok(status);
    }
}
