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
 * JPA entity mapping to the proxy_rules table in Supabase PostgreSQL.
 *
 * Rules define which URLs to allow or block when processed by the proxy engine.
 * Patterns use glob-style matching (e.g. "*.google.com").
 * Each rule has an action: "allow" or "block", and can be enabled/disabled.
 */
@Entity
@Table(name = "proxy_rules")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProxyRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "pattern", nullable = false, length = 512)
    private String pattern;

    /**
     * Must be either "allow" or "block".
     * Enforced at the DB level via a CHECK constraint.
     */
    @Column(name = "action", nullable = false, length = 10)
    private String action;

    @Column(name = "description", length = 512)
    private String description;

    @Column(name = "enabled")
    @Builder.Default
    private Boolean enabled = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;
}
