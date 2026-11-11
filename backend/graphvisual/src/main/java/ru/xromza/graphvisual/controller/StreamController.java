package ru.xromza.graphvisual.controller;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.algorithm.AlgorithmRegistry;
import ru.xromza.graphvisual.dto.AlgorithmListEntryDto;
import ru.xromza.graphvisual.dto.AlgorithmRunRequest;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.service.AlgorithmService;
import ru.xromza.graphvisual.storage.ClientStorage;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * REST-контроллер алгоритмов: отдаёт список алгоритмов и запускает выбранный алгоритм
 * со стримингом шагов через Server-Sent Events.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/algorithm")
public class StreamController {
    private final ClientStorage clientStorage;

    private final AlgorithmService algorithmService;

    private final AlgorithmRegistry algorithmRegistry;

    /**
     * {@code GET /api/v1/algorithm/all}
     *
     * @return список доступных алгоритмов
     */
    @GetMapping(path = "all")
    public Mono<List<AlgorithmListEntryDto>> getAlgorithms() {
        return Mono.just(algorithmRegistry.getAvailableAlgorithms());
    }

    /**
     * {@code POST /api/v1/algorithm/run}
     *
     * <p>Запускает алгоритм и возвращает поток событий {@code newStep}. Пока алгоритм не завершился,
     * каждые 3 секунды отправляется комментарий {@code ping}, чтобы соединение не закрывалось прокси.
     *
     * @param request     граф и параметры запуска
     * @param httpRequest исходный HTTP-запрос
     * @return поток шагов алгоритма в формате SSE
     */
    @PostMapping(path="run", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<AlgorithmStepDto>> runAlgorithmSse(
            @RequestBody AlgorithmRunRequest request,
            ServerHttpRequest httpRequest) {

        UUID userToken = UUID.randomUUID();
        Sinks.Many<AlgorithmStepDto> sink = clientStorage.addClient(userToken);
        Graph graph = Graph.of(request.nodes(), request.edges(), request.directed());

        algorithmService.consumeVisualization(graph, request.startNodeId(), request.targetNodeId(),
                request.waypointNodeIds(), request.algorithmType(), sink);

        Flux<ServerSentEvent<AlgorithmStepDto>> stepStream = sink.asFlux()
                .map(step -> ServerSentEvent.<AlgorithmStepDto>builder()
                        .id(UUID.randomUUID().toString())
                        .event("newStep")
                        .data(step)
                        .build())
                .doFinally(signalType -> clientStorage.removeClient(userToken, sink))
                .share();

        Flux<ServerSentEvent<AlgorithmStepDto>> pingStream = Flux.interval(Duration.ofSeconds(3))
                .map(seq -> ServerSentEvent.<AlgorithmStepDto>builder()
                        .comment("ping")
                        .build());

        return Flux.merge(
                stepStream,
                pingStream.takeUntilOther(stepStream.then()));
    }

}
