package ru.xromza.graphvisual.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;

import reactor.test.StepVerifier;

class GlobalErrorHandlerTest {

    @Test
    void handleExceptions_mapsIllegalStateToBadRequestWithDetails() {
        var request = MockServerHttpRequest.post("/api/v1/algorithm/run").build();

        StepVerifier.create(new GlobalErrorHandler().handleExceptions(new IllegalStateException("плохо"), request))
                .assertNext(response -> {
                    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(response.getBody()).isNotNull();
                    assertThat(response.getBody().name()).isEqualTo("IllegalState");
                    assertThat(response.getBody().description()).isEqualTo("плохо");
                    assertThat(response.getBody().endpoint()).isEqualTo("/api/v1/algorithm/run");
                    assertThat(response.getBody().timestamp()).isNotNull();
                })
                .verifyComplete();
    }
}
