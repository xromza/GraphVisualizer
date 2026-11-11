package ru.xromza.graphvisual.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.github.bucket4j.distributed.ExpirationAfterWriteStrategy;
import io.github.bucket4j.distributed.proxy.AsyncProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;

@Configuration
public class RateLimiterConfig {
    @Value("${spring.data.redis.host}")
    private String redisHost;

    @Value("${spring.data.redis.port}")
    private int redisPort;

    @Bean RedisClient redisClient() {
        RedisURI redisURI = RedisURI.builder()
                .withHost(redisHost)
                .withPort(redisPort)
                .build();
        return RedisClient.create(redisURI);
    }

    /**
     * Создаёт асинхронный менеджер бакетов на Redis (CAS-режим). Неиспользуемые бакеты истекают,
     * когда успевают пополниться до максимума (не дольше минуты).
     *
     * @param redisClient клиент Redis
     * @return менеджер распределённых бакетов
     */
    @Bean AsyncProxyManager<byte[]> asyncProxyManager(RedisClient redisClient) {
        return Bucket4jLettuce
                .casBasedBuilder(redisClient)
                .expirationAfterWrite(
                        ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(Duration.ofMinutes(1)))
                .build()
                .asAsync();
    }
}
