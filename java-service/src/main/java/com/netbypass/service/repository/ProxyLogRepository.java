package com.netbypass.service.repository;

import com.netbypass.service.entity.ProxyLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Spring Data JPA repository for {@link ProxyLog}.
 *
 * Spring auto-implements all CRUD operations. Custom queries are added for
 * common dashboard views (e.g. recent logs, success-only logs).
 */
@Repository
public interface ProxyLogRepository extends JpaRepository<ProxyLog, UUID> {

    /**
     * Fetch the most recent proxy logs ordered by creation time descending.
     *
     * @param pageable pagination spec (e.g. PageRequest.of(0, 20))
     * @return page of proxy logs
     */
    Page<ProxyLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * Count total successful proxy requests.
     */
    long countBySuccessTrue();

    /**
     * Count total failed proxy requests.
     */
    long countBySuccessFalse();

    /**
     * Average latency across all recorded requests.
     */
    @Query("SELECT AVG(p.latencyMs) FROM ProxyLog p WHERE p.latencyMs IS NOT NULL")
    Double averageLatency();
}
