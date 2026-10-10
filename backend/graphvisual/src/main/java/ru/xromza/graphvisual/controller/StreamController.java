package ru.xromza.graphvisual.controller;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.storage.ClientStorage;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/algo")
public class StreamController {
    private final ClientStorage clientStorage;

    @GetMapping(path = "algorithms", version = "1")
    public Mono<List<String>> getAlgorithms() {
        return Mono.just(List.of("Test"));
    }

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE, version = "1")
    public Flux<ServerSentEvent<AlgorithmStepDto>> runAlgorithmSse(
            @RequestParam String algorithmType,
            @RequestParam String startNodeId,
            @RequestParam String targetNodeId,
            @RequestParam Graph graphDto) {

        UUID userToken = UUID.randomUUID();

        Sinks.Many<AlgorithmStepDto> sink = clientStorage.addClient(userToken);

        Flux<ServerSentEvent<AlgorithmStepDto>> notificationsStream = sink.asFlux()
                .map(step -> ServerSentEvent.<AlgorithmStepDto>builder()
                        .id(UUID.randomUUID().toString())
                        .event("newStep")
                        .data(step)
                        .build())
                .doFinally(signalType -> clientStorage.removeClient(userToken, sink))
                .share();

        Flux<ServerSentEvent<AlgorithmStepDto>> pingStream = Flux.interval(Duration.ofSeconds(10))
                .map(seq -> ServerSentEvent.<AlgorithmStepDto>builder()
                        .comment("ping")
                        .build());

        return Flux.merge(
                notificationsStream,
                pingStream.takeUntilOther(notificationsStream.then())).onErrorResume(e -> Flux.empty());
    }
}
