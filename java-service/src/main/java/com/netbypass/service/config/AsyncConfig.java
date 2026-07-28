package com.netbypass.service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Async executor configuration for non-blocking log persistence.
 *
 * The {@link com.netbypass.service.service.ProxyService#saveLogAsync} method
 * runs on this thread pool so that database writes never delay the HTTP response
 * returned to the proxied client.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "logExecutor")
    public Executor logExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("proxy-log-");
        executor.initialize();
        return executor;
    }
}
