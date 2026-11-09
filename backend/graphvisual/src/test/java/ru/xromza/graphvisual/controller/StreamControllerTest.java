package ru.xromza.graphvisual.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static ru.xromza.graphvisual.types.AlgorithmStatus.COMPLETED;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.test.web.reactive.server.WebTestClient;

import reactor.core.publisher.Sinks;
import reactor.test.StepVerifier;
import ru.xromza.graphvisual.algorithm.AlgorithmRegistry;
import ru.xromza.graphvisual.algorithm.BfsAlgorithm;
import ru.xromza.graphvisual.algorithm.DfsAlgorithm;
import ru.xromza.graphvisual.config.GlobalErrorHandler;
import ru.xromza.graphvisual.dto.AlgorithmListEntryDto;
import ru.xromza.graphvisual.dto.AlgorithmRunRequest;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.service.AlgorithmService;
import ru.xromza.graphvisual.storage.ClientStorage;

class StreamControllerTest {

    private static final String RUN_BODY = """
            {"algorithmType":"%s","startNodeId":"a","targetNodeId":"c","waypointNodeIds":null,
             "nodes":[["a","A",0,0],["b","B",100,0],["c","C",200,0]],
             "edges":[["e1","a","b",1],["e2","b","c",1]],
             "directed":false}""";

    private final AlgorithmRegistry registry = new AlgorithmRegistry(List.of(new BfsAlgorithm(), new DfsAlgorithm()));
    private final ClientStorage storage = spy(new ClientStorage());

    private WebTestClient client() {
        return WebTestClient
                .bindToController(new StreamController(storage, new AlgorithmService(registry), registry))
                .controllerAdvice(new GlobalErrorHandler())
                .build();
    }

    @Test
    void getAlgorithms_listsRegisteredAlgorithms() {
        client().get().uri("/api/v1/algorithm/all").exchange()
                .expectStatus().isOk()
                .expectBodyList(AlgorithmListEntryDto.class)
                .value(list -> assertThat(list).containsExactlyInAnyOrder(
                        new AlgorithmListEntryDto("bfs", "BFS"),
                        new AlgorithmListEntryDto("dfs", "DFS")));
    }

    @Test
    void run_streamsEveryStepAsServerSentEventAndReleasesTheClient() {
        List<ServerSentEvent<AlgorithmStepDto>> events = client().post().uri("/api/v1/algorithm/run")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(RUN_BODY.formatted("bfs"))
                .exchange()
                .expectStatus().isOk()
                .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                .returnResult(new ParameterizedTypeReference<ServerSentEvent<AlgorithmStepDto>>() {
                })
                .getResponseBody().collectList().block(Duration.ofSeconds(5));

        assertThat(events).isNotNull().hasSize(3).allSatisfy(e -> {
            assertThat(e.event()).isEqualTo("newStep");
            assertThat(e.id()).isNotBlank();
        });
        assertThat(events.get(2).data().status()).isEqualTo(COMPLETED);
        assertThat(events.get(2).data().path()).containsExactly("a", "b", "c");
        // share() даёт повторную подписку на завершённый поток, поэтому вызов может быть не один.
        verify(storage, atLeastOnce()).removeClient(any(), any());
    }

    @Test
    void run_unknownAlgorithmIsAnsweredWithBadRequest() {
        client().post().uri("/api/v1/algorithm/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(RUN_BODY.formatted("nope"))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.name").isEqualTo("IllegalState")
                .jsonPath("$.description").isEqualTo("Такого алгоритма нет")
                .jsonPath("$.endpoint").isEqualTo("/api/v1/algorithm/run");
    }

    @Test
    void run_sendsPingCommentsWhileNoStepsArriveAndStopsWhenStreamEnds() {
        AlgorithmService service = mock(AlgorithmService.class);
        AtomicReference<Sinks.Many<AlgorithmStepDto>> sink = new AtomicReference<>();
        doAnswer(inv -> {
            sink.set(inv.getArgument(5));
            return null;
        }).when(service).consumeVisualization(any(), any(), any(), any(), any(), any());
        StreamController controller = new StreamController(storage, service, registry);
        AlgorithmRunRequest request = new AlgorithmRunRequest("bfs", "a", "b", null,
                List.of(List.of("a", "A", 0, 0), List.of("b", "B", 1, 1)),
                List.of(List.of("e1", "a", "b", 1)), false);
        AlgorithmStepDto step = new AlgorithmStepDto(1, "a", Set.of("a"), Map.of("a", 0.0), COMPLETED, List.of("a"));

        StepVerifier.withVirtualTime(() -> controller.runAlgorithmSse(request, null))
                .expectSubscription()
                .thenAwait(Duration.ofSeconds(3))
                .assertNext(ping -> {
                    assertThat(ping.comment()).isEqualTo("ping");
                    assertThat(ping.data()).isNull();
                })
                .then(() -> sink.get().tryEmitNext(step))
                .assertNext(event -> {
                    assertThat(event.event()).isEqualTo("newStep");
                    assertThat(event.data()).isEqualTo(step);
                })
                .then(() -> sink.get().tryEmitComplete())
                .verifyComplete();

        verify(storage, atLeastOnce()).removeClient(any(), any());
    }
}
