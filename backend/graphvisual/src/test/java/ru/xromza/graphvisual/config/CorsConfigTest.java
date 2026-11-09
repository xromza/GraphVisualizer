package ru.xromza.graphvisual.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.reactive.config.CorsRegistry;

class CorsConfigTest {

    /** getCorsConfigurations() у реестра protected — открываем его для проверки. */
    private static class ExposedRegistry extends CorsRegistry {
        Map<String, CorsConfiguration> configurations() {
            return getCorsConfigurations();
        }
    }

    @Test
    void addCorsMappings_allowsAnyOriginForAllPaths() {
        ExposedRegistry registry = new ExposedRegistry();

        new CorsConfig().addCorsMappings(registry);

        assertThat(registry.configurations()).containsOnlyKeys("/**");
        CorsConfiguration cors = registry.configurations().get("/**");
        assertThat(cors.getAllowedOriginPatterns()).containsExactly("*");
        assertThat(cors.getAllowedMethods()).containsExactly("GET", "POST", "PUT", "DELETE", "OPTIONS");
        assertThat(cors.getAllowedHeaders()).containsExactly("*");
        assertThat(cors.getAllowCredentials()).isTrue();
        assertThat(cors.getMaxAge()).isEqualTo(3600L);
    }
}
