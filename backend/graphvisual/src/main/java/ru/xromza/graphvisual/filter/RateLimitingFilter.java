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
