package ru.xromza.graphvisual.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.reactor.netty.NettyReactiveWebServerFactory;

import io.netty.channel.ChannelOption;
import reactor.netty.http.server.HttpServer;

class NettyCustomizerConfigTest {

    @Test
    void customizer_registersServerCustomizerWithKeepAliveAndOwnLoopResources() {
        NettyReactiveWebServerFactory factory = new NettyReactiveWebServerFactory();

        new NettyCustomizerConfig().customizer().customize(factory);

        assertThat(factory.getServerCustomizers()).hasSize(1);
        HttpServer customized = factory.getServerCustomizers().iterator().next().apply(HttpServer.create());
        try {
            assertThat(customized.configuration().childOptions().get(ChannelOption.SO_KEEPALIVE)).isEqualTo(true);
            assertThat(customized.configuration().loopResources()).isNotNull();
        } finally {
            customized.configuration().loopResources().dispose();
        }
    }
}
