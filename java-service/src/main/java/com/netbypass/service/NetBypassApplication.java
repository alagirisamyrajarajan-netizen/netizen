package com.netbypass.service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * NetBypass Java Microservice
 *
 * A Spring Boot 3 backend that powers the NetBypass network bypass application.
 * Acts as the core proxy engine and database layer, called by the Next.js
 * frontend deployed on Vercel.
 *
 * Responsibilities:
 *   - HTTP proxy requests via java.net.http.HttpClient (JDK 11+)
 *   - Persist proxy logs and rules to Supabase PostgreSQL via Spring Data JPA
 *   - Expose REST API consumed by the Next.js API gateway
 */
@SpringBootApplication
public class NetBypassApplication {

    public static void main(String[] args) {
        SpringApplication.run(NetBypassApplication.class, args);
    }
}
