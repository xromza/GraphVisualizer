package ru.xromza.graphvisual.config;

import org.springframework.boot.reactor.netty.NettyReactiveWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

import io.netty.channel.ChannelOption;
import reactor.netty.resources.LoopResources;

@Component
public class NettyCustomizerConfig {
    @Bean
    public WebServerFactoryCustomizer<NettyReactiveWebServerFactory> customizer() {
        return factory -> factory.addServerCustomizers(httpServer -> httpServer
                .runOn(LoopResources.create("scale-netty", 1, 4, true))
                .childOption(ChannelOption.SO_KEEPALIVE, true));
    }
}
