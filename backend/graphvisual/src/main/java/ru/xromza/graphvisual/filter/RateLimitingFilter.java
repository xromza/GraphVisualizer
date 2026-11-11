package ru.xromza.graphvisual.filter;

import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.distributed.proxy.AsyncProxyManager;
import reactor.core.publisher.Mono;

/**
 * Фильтр ограничения частоты запросов к {@code /algorithm/run}.
 *
 * <p>Для каждого клиента (по IP) действует token bucket: 50 запросов в минуту, состояние бакетов
 * хранится в Redis через Bucket4j, поэтому лимит общий для всех экземпляров приложения.
 * При превышении лимита возвращается {@code 429 Too Many Requests}. Остальные пути не ограничиваются.
 */
@Component
@Order(-1)
public class RateLimitingFilter implements WebFilter {
    private final AsyncProxyManager<byte[]> asyncProxyManager;

    public RateLimitingFilter(AsyncProxyManager<byte[]> asyncProxyManager) {
        this.asyncProxyManager = asyncProxyManager;
    }

    private BucketConfiguration getBucketConfiguration() {
        return BucketConfiguration.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(50)
                        .refillGreedy(50, Duration.ofMinutes(1))
                        .build())
                .build();
    }

    /**
     * Пропускает запрос дальше по цепочке или отклоняет его, если у клиента закончились токены.
     *
     * @param exchange текущий обмен запрос/ответ
     * @param chain    остальная цепочка фильтров
     * @return завершение обработки запроса
     */
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        if (!path.contains("/algorithm/run")) {
            return chain.filter(exchange);
        }
        String clientIp = resolveTrustedRemoteIp(exchange.getRequest());
        var bucket = asyncProxyManager.builder().build(clientIp.getBytes(),
                () -> CompletableFuture.completedFuture(getBucketConfiguration()));

        return Mono.fromFuture(bucket.tryConsume(1))
                .flatMap(allowed -> {
                    if (allowed) {
                        return chain.filter(exchange);
                    } else {
                        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                        return exchange.getResponse().setComplete();
                    }
                });
    }

    /**
     * Определяет IP клиента: первый адрес из {@code X-Forwarded-For} (приложение работает за reverse proxy),
     * иначе адрес сокета, иначе {@code "anonymous"}.
     *
     * @param request входящий запрос
     * @return строковый идентификатор клиента для бакета
     */
    private String resolveTrustedRemoteIp(ServerHttpRequest request) {
        String forwardedFor = request.getHeaders().getFirst("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            return forwardedFor.split(",")[0].trim();
        }

        InetSocketAddress remoteAddress = request.getRemoteAddress();
        return Optional.ofNullable(remoteAddress)
                .map(addr -> addr.getAddress().getHostAddress())
                .orElse("anonymous");
    }
}
