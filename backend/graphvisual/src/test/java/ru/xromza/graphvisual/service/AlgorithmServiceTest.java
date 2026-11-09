package ru.xromza.graphvisual.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static ru.xromza.graphvisual.TestGraphs.edge;
import static ru.xromza.graphvisual.TestGraphs.graphOf;
import static ru.xromza.graphvisual.types.AlgorithmStatus.COMPLETED;
import static ru.xromza.graphvisual.types.AlgorithmStatus.PROCESSING;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import reactor.core.publisher.Signal;
import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.algorithm.AlgorithmRegistry;
import ru.xromza.graphvisual.algorithm.BfsAlgorithm;
import ru.xromza.graphvisual.algorithm.DijkstraAlgorithm;
import ru.xromza.graphvisual.algorithm.GraphAlgorithm;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;

class AlgorithmServiceTest {

    /** Что видит подписчик потока: шаги и способ завершения. */
    private record Outcome(List<AlgorithmStepDto> steps, Signal<AlgorithmStepDto> terminal) {

        AlgorithmStepDto last() {
            return steps.get(steps.size() - 1);
        }

        boolean completed() {
            return terminal.isOnComplete();
        }
    }

    @FunctionalInterface
    private interface Script {
        void run(Graph graph, String from, String to, Consumer<AlgorithmStepDto> out);
    }

    private static GraphAlgorithm scripted(Script script) {
        return new GraphAlgorithm() {
            @Override
            public String getId() {
                return "scripted";
            }

            @Override
            public String getName() {
                return "Scripted";
            }

            @Override
            public void compute(Graph graph, String sourceId, String sourceB, Consumer<AlgorithmStepDto> out) {
                script.run(graph, sourceId, sourceB, out);
            }
        };
    }

    /** Линия a-b-c-d-e с весами 1, 2, 3, 4 и изолированный узел x. */
    private static Graph line() {
        return graphOf(false, List.of("a", "b", "c", "d", "e", "x"),
                edge("a", "b", 1), edge("b", "c", 2), edge("c", "d", 3), edge("d", "e", 4));
    }

    private static Outcome run(GraphAlgorithm algorithm, Graph graph, String start, String target,
            List<String> waypoints) {
        AlgorithmService service = new AlgorithmService(new AlgorithmRegistry(List.of(algorithm)));
        Sinks.Many<AlgorithmStepDto> sink = Sinks.many().replay().all();

        service.consumeVisualization(graph, start, target, waypoints, algorithm.getId(), sink);

        List<Signal<AlgorithmStepDto>> signals = sink.asFlux().materialize().collectList()
                .block(Duration.ofSeconds(2));
        List<AlgorithmStepDto> steps = new ArrayList<>();
        signals.stream().filter(Signal::isOnNext).forEach(s -> steps.add(s.get()));
        return new Outcome(steps, signals.get(signals.size() - 1));
    }

    @Test
    void unknownAlgorithm_isRejectedBeforeAnythingIsEmitted() {
        AlgorithmService service = new AlgorithmService(new AlgorithmRegistry(List.of(new BfsAlgorithm())));
        Sinks.Many<AlgorithmStepDto> sink = Sinks.many().replay().all();

        assertThatThrownBy(() -> service.consumeVisualization(line(), "a", "e", null, "nope", sink))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Такого алгоритма нет");
    }

    @Test
    void withoutWaypoints_streamsTheAlgorithmRunAndCompletes() {
        Outcome outcome = run(new DijkstraAlgorithm(), line(), "a", "e", null);

        assertThat(outcome.completed()).isTrue();
        assertThat(outcome.last().status()).isEqualTo(COMPLETED);
        assertThat(outcome.last().path()).containsExactly("a", "b", "c", "d", "e");
        assertThat(outcome.last().distances()).containsEntry("e", 10.0);
    }

    @Test
    void severalWaypoints_areVisitedInOrderWithAccumulatedPathAndDistance() {
        Outcome outcome = run(new DijkstraAlgorithm(), line(), "a", "e", List.of("c", "d"));

        assertThat(outcome.completed()).isTrue();
        assertThat(outcome.steps()).extracting(AlgorithmStepDto::stepNumber)
                .containsExactlyElementsOf(IntStream.rangeClosed(1, outcome.steps().size()).boxed().toList());
        assertThat(outcome.steps().stream().filter(s -> s.status() == COMPLETED)).hasSize(1);

        AlgorithmStepDto done = outcome.last();
        assertThat(done.path()).containsExactly("a", "b", "c", "d", "e");
        // Расстояния второго и третьего участков отсчитываются от начала всего маршрута.
        assertThat(done.distances()).containsEntry("d", 6.0).containsEntry("e", 10.0);
        assertThat(done.visitedNodes()).containsExactlyInAnyOrder("a", "b", "c", "d", "e");
    }

    @Test
    void stepsOfLaterLegsCarryTheRouteTravelledSoFar() {
        Outcome outcome = run(new DijkstraAlgorithm(), line(), "a", "e", List.of("c"));

        AlgorithmStepDto firstStepOfSecondLeg = outcome.steps().stream()
                .filter(s -> s.status() == PROCESSING && s.activeNodeId().equals("c"))
                .findFirst().orElseThrow();
        assertThat(firstStepOfSecondLeg.path()).containsExactly("a", "b", "c");
        assertThat(firstStepOfSecondLeg.visitedNodes()).contains("a", "b", "c");
    }

    @Test
    void unknownAndRepeatedWaypoints_areIgnored() {
        Outcome plain = run(new DijkstraAlgorithm(), line(), "a", "e", null);

        Outcome noisy = run(new DijkstraAlgorithm(), line(), "a", "e", List.of("ghost", "a", "e", "e"));

        assertThat(noisy.steps()).isEqualTo(plain.steps());
    }

    @Test
    void nullGraph_reportsGuardStepAndIgnoresWaypoints() {
        Outcome outcome = run(new BfsAlgorithm(), null, "a", "e", List.of("c"));

        assertThat(outcome.completed()).isTrue();
        assertThat(outcome.steps()).containsExactly(
                new AlgorithmStepDto(1, "a", Set.of("a"), Map.of(), COMPLETED, List.of()));
    }

    @Test
    void unreachableWaypoint_endsTheRunWithEmptyPathWithoutStartingNextLeg() {
        GraphAlgorithm bfs = spy(new BfsAlgorithm());

        Outcome outcome = run(bfs, line(), "a", "e", List.of("x"));

        assertThat(outcome.completed()).isTrue();
        assertThat(outcome.last().status()).isEqualTo(COMPLETED);
        assertThat(outcome.last().path()).isEmpty();
        assertThat(outcome.steps().stream().filter(s -> s.status() == COMPLETED)).hasSize(1);
        verify(bfs, times(1)).compute(any(), any(), any(), any());
    }

    @Test
    void unreachableTargetAfterWaypoint_endsWithEmptyPathButKeepsRouteInVisited() {
        Outcome outcome = run(new BfsAlgorithm(), line(), "a", "x", List.of("c"));

        assertThat(outcome.completed()).isTrue();
        assertThat(outcome.last().status()).isEqualTo(COMPLETED);
        assertThat(outcome.last().path()).isEmpty();
        assertThat(outcome.last().visitedNodes()).contains("a", "b", "c");
    }

    @Test
    void algorithmThatEmitsNothing_getsFallbackCompletedStep() {
        Outcome outcome = run(scripted((g, from, to, out) -> {
        }), line(), "a", "e", null);

        assertThat(outcome.completed()).isTrue();
        assertThat(outcome.steps()).containsExactly(
                new AlgorithmStepDto(1, "a", Set.of(), Map.of(), COMPLETED, List.of()));
    }

    @Test
    void processingStepWithoutPath_fallsBackToRouteTravelledSoFar() {
        Outcome outcome = run(scripted((g, from, to, out) -> {
            out.accept(new AlgorithmStepDto(1, from, Set.of(from), Map.of(from, 0.0), PROCESSING, List.of()));
            out.accept(new AlgorithmStepDto(2, to, Set.of(from, to), Map.of(to, 2.0), COMPLETED,
                    List.of(from, to)));
        }), line(), "a", "e", null);

        assertThat(outcome.completed()).isTrue();
        assertThat(outcome.steps()).hasSize(2);
        assertThat(outcome.steps().get(0).path()).containsExactly("a");
        assertThat(outcome.last().path()).containsExactly("a", "e");
    }

    @Test
    void algorithmFailure_isSignalledThroughTheSink() {
        IllegalArgumentException failure = new IllegalArgumentException("boom");

        Outcome outcome = run(scripted((g, from, to, out) -> {
            throw failure;
        }), line(), "a", "e", null);

        assertThat(outcome.terminal().isOnError()).isTrue();
        assertThat(outcome.terminal().getThrowable()).isSameAs(failure);
        assertThat(outcome.steps()).isEmpty();
    }

    @Test
    void missingStartNode_isSignalledThroughTheSink() {
        Outcome outcome = run(new BfsAlgorithm(), line(), null, "e", null);

        assertThat(outcome.terminal().isOnError()).isTrue();
        assertThat(outcome.terminal().getThrowable()).isInstanceOf(NullPointerException.class);
    }
}
