package com.netbypass.service.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity mapping to the proxy_logs table in Supabase PostgreSQL.
 *
 * Every request proxied through the NetBypass service is recorded here
 * with full metadata: URL, HTTP method, status code, latency, success flag,
 * content type, response size, and any error message.
 */
@Entity
@Table(name = "proxy_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProxyLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "target_url", nullable = false, length = 2048)
    private String targetUrl;

    @Column(name = "method", nullable = false, length = 10)
    @Builder.Default
    private String method = "GET";

    @Column(name = "status_code")
    private Integer statusCode;

    @Column(name = "latency_ms")
    private Long latencyMs;

    @Column(name = "success")
    @Builder.Default
    private Boolean success = false;

    @Column(name = "error_message", length = 1024)
    private String errorMessage;

    @Column(name = "content_type", length = 256)
    private String contentType;

    @Column(name = "response_size")
    private Long responseSize;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;
}
