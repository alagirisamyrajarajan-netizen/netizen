package com.netbypass.service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS configuration for the NetBypass Java service.
 *
 * Allows the Next.js frontend (deployed on Vercel) to call this service's
 * REST API from the browser. The allowed origin is configured via
 * {@code app.cors.allowed-origins} in application.properties, defaulting to
 * all origins for development convenience.
 *
 * In production, set this to your actual Vercel deployment URL.
 */
@Configuration
public class CorsConfig {

    @Value("${app.cors.allowed-origins:*}")
    private String allowedOrigins;

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOriginPatterns(allowedOrigins)
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*")
                        .exposedHeaders("X-Proxied-By", "X-Latency-Ms", "X-Status-Code")
                        .maxAge(3600);
            }
        };
    }
}
