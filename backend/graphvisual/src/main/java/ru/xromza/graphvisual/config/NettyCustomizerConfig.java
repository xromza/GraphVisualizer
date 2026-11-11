package ru.xromza.graphvisual.config;

import org.springframework.boot.reactor.netty.NettyReactiveWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

import io.netty.channel.ChannelOption;
import reactor.netty.resources.LoopResources;

@Component
public class NettyCustomizerConfig {
    /**
     * Задаёт пул потоков {@code scale-netty} (1 селектор, 4 рабочих потока, демоны) и включает TCP keep-alive,
     * чтобы долгоживущие SSE-соединения не обрывались.
     *
     * @return кастомайзер фабрики Netty-сервера
     */
    @Bean
    public WebServerFactoryCustomizer<NettyReactiveWebServerFactory> customizer() {
        return factory -> factory.addServerCustomizers(httpServer -> httpServer
                .runOn(LoopResources.create("scale-netty", 1, 4, true))
                .childOption(ChannelOption.SO_KEEPALIVE, true));
    }
}
