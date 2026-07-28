package com.netbypass.service.repository;

import com.netbypass.service.entity.ProxyRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link ProxyRule}.
 *
 * Provides CRUD operations for proxy allow/block rules.
 * Rules are loaded and checked by the {@link com.netbypass.service.service.ProxyService}
 * before each request is forwarded.
 */
@Repository
public interface ProxyRuleRepository extends JpaRepository<ProxyRule, UUID> {

    /**
     * Fetch all enabled rules ordered by creation time descending.
     */
    List<ProxyRule> findByEnabledTrueOrderByCreatedAtDesc();

    /**
     * Fetch all rules (including disabled) ordered by creation time descending.
     */
    List<ProxyRule> findAllByOrderByCreatedAtDesc();
}
