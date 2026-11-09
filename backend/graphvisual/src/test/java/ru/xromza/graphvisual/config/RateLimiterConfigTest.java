package ru.xromza.graphvisual.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import io.github.bucket4j.distributed.proxy.AsyncProxyManager;
import io.lettuce.core.RedisClient;
import io.lettuce.core.codec.RedisCodec;

class RateLimiterConfigTest {

    private final RateLimiterConfig config = new RateLimiterConfig();

    @Test
    void redisClient_isCreatedFromConfiguredHostAndPort() {
        ReflectionTestUtils.setField(config, "redisHost", "redis.example");
        ReflectionTestUtils.setField(config, "redisPort", 6380);

        RedisClient client = config.redisClient();
        try {
            assertThat(client).isNotNull();
        } finally {
            client.shutdown();
        }
    }

    @Test
    void asyncProxyManager_isBuiltOnTopOfTheRedisClient() {
        // Менеджер Bucket4j подключается к Redis в конструкторе, поэтому клиент подменяем.
        RedisClient client = mock(RedisClient.class, RETURNS_DEEP_STUBS);

        AsyncProxyManager<byte[]> manager = config.asyncProxyManager(client);

        assertThat(manager).isNotNull();
        verify(client).connect(any(RedisCodec.class));
    }
}
