package ru.xromza.graphvisual.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.WebFilterChain;

import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.distributed.AsyncBucketProxy;
import io.github.bucket4j.distributed.proxy.AsyncProxyManager;
import io.github.bucket4j.distributed.proxy.RemoteAsyncBucketBuilder;
import reactor.core.publisher.Mono;

@SuppressWarnings("unchecked")
class RateLimitingFilterTest {

    private AsyncProxyManager<byte[]> manager;
    private AsyncBucketProxy bucket;
    private WebFilterChain chain;
    private RateLimitingFilter filter;
    private ArgumentCaptor<byte[]> key;
    private ArgumentCaptor<Supplier<CompletableFuture<BucketConfiguration>>> configSupplier;

    @BeforeEach
    void setUp() {
        manager = mock(AsyncProxyManager.class);
        RemoteAsyncBucketBuilder<byte[]> builder = mock(RemoteAsyncBucketBuilder.class);
        bucket = mock(AsyncBucketProxy.class);
        chain = mock(WebFilterChain.class);
        key = ArgumentCaptor.forClass(byte[].class);
        configSupplier = ArgumentCaptor.forClass(Supplier.class);

        when(manager.builder()).thenReturn(builder);
        when(builder.build(key.capture(), configSupplier.capture())).thenReturn(bucket);
        when(chain.filter(any())).thenReturn(Mono.empty());
        filter = new RateLimitingFilter(manager);
    }

    private void bucketAllows(boolean allowed) {
        when(bucket.tryConsume(1)).thenReturn(CompletableFuture.completedFuture(allowed));
    }

    private static MockServerWebExchange exchange(MockServerHttpRequest.BaseBuilder<?> request) {
        return MockServerWebExchange.from(request.build());
    }

    private String limitedKey() {
        return new String(key.getValue(), StandardCharsets.UTF_8);
    }

    @Test
    void otherEndpoints_passThroughWithoutTouchingTheLimiter() {
        var exchange = exchange(MockServerHttpRequest.get("/api/v1/algorithm/all"));

        filter.filter(exchange, chain).block();

        verify(chain).filter(exchange);
        verifyNoInteractions(manager);
    }

    @Test
    void runEndpoint_withinLimitContinuesTheChain() throws Exception {
        bucketAllows(true);
        var exchange = exchange(MockServerHttpRequest.post("/api/v1/algorithm/run")
                .remoteAddress(new InetSocketAddress(InetAddress.getByName("192.0.2.7"), 5000)));

        filter.filter(exchange, chain).block();

        verify(chain).filter(exchange);
        assertThat(exchange.getResponse().getStatusCode()).isNull();
        assertThat(limitedKey()).isEqualTo("192.0.2.7");
    }

    @Test
    void runEndpoint_overLimitIsAnsweredWith429AndChainIsNotCalled() {
        bucketAllows(false);
        var exchange = exchange(MockServerHttpRequest.post("/api/v1/algorithm/run"));

        filter.filter(exchange, chain).block();

        verify(chain, never()).filter(any());
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(exchange.getResponse().isCommitted()).isTrue();
    }

    @Test
    void clientIsIdentifiedByFirstForwardedForAddress() {
        bucketAllows(true);
        var exchange = exchange(MockServerHttpRequest.post("/api/v1/algorithm/run")
                .header("X-Forwarded-For", " 203.0.113.5 , 10.0.0.1"));

        filter.filter(exchange, chain).block();

        assertThat(limitedKey()).isEqualTo("203.0.113.5");
    }

    @Test
    void blankForwardedFor_fallsBackToRemoteAddress() throws Exception {
        bucketAllows(true);
        var exchange = exchange(MockServerHttpRequest.post("/api/v1/algorithm/run")
                .header("X-Forwarded-For", "  ")
                .remoteAddress(new InetSocketAddress(InetAddress.getByName("198.51.100.9"), 5000)));

        filter.filter(exchange, chain).block();

        assertThat(limitedKey()).isEqualTo("198.51.100.9");
    }

    @Test
    void unknownClient_isLimitedAsAnonymous() {
        bucketAllows(true);
        var exchange = exchange(MockServerHttpRequest.post("/api/v1/algorithm/run"));

        filter.filter(exchange, chain).block();

        assertThat(limitedKey()).isEqualTo("anonymous");
    }

    @Test
    void newBucketsAllow50RequestsPerMinute() {
        bucketAllows(true);
        filter.filter(exchange(MockServerHttpRequest.post("/api/v1/algorithm/run")), chain).block();

        BucketConfiguration configuration = configSupplier.getValue().get().join();

        assertThat(configuration.getBandwidths()).hasSize(1);
        assertThat(configuration.getBandwidths()[0].getCapacity()).isEqualTo(50);
        assertThat(configuration.getBandwidths()[0].getRefillPeriodNanos())
                .isEqualTo(java.time.Duration.ofMinutes(1).toNanos());
    }
}
