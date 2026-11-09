package ru.xromza.graphvisual.algorithm;

import static org.assertj.core.api.Assertions.assertThat;
import static ru.xromza.graphvisual.TestGraphs.edge;
import static ru.xromza.graphvisual.TestGraphs.graphOf;
import static ru.xromza.graphvisual.TestGraphs.run;
import static ru.xromza.graphvisual.types.AlgorithmStatus.COMPLETED;
import static ru.xromza.graphvisual.types.AlgorithmStatus.PROCESSING;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;

/**
 * Свойства, общие для всех алгоритмов поиска. Наследники подставляют реализацию
 * и добавляют проверки, специфичные для конкретного алгоритма.
 */
abstract class AbstractGraphAlgorithmTest {

    protected abstract GraphAlgorithm algorithm();

    /** Цепочка a-b-c-d (вес рёбер 1) и изолированный узел e. */
    protected static Graph chain() {
        return graphOf(false, List.of("a", "b", "c", "d", "e"),
                edge("a", "b", 1), edge("b", "c", 1), edge("c", "d", 1));
    }

    private static AlgorithmStepDto last(List<AlgorithmStepDto> steps) {
        return steps.get(steps.size() - 1);
    }

    @Test
    void nullGraph_emitsSingleCompletedStep() {
        assertThat(run(algorithm(), null, "a", "b")).containsExactly(
                new AlgorithmStepDto(1, "a", Set.of(), Map.of(), COMPLETED, List.of()));
    }

    @Test
    void unknownSource_emitsSingleCompletedStep() {
        assertThat(run(algorithm(), chain(), "nope", "d")).containsExactly(
                new AlgorithmStepDto(1, "nope", Set.of(), Map.of(), COMPLETED, List.of()));
    }

    @Test
    void sourceEqualsTarget_completesImmediately() {
        assertThat(run(algorithm(), chain(), "a", "a")).containsExactly(
                new AlgorithmStepDto(1, "a", Set.of("a"), Map.of("a", 0.0), COMPLETED, List.of("a")));
    }

    @Test
    void reachableTarget_completesWithFullPathAndDistance() {
        List<AlgorithmStepDto> steps = run(algorithm(), chain(), "a", "d");

        AlgorithmStepDto done = last(steps);
        assertThat(done.status()).isEqualTo(COMPLETED);
        assertThat(done.activeNodeId()).isEqualTo("d");
        assertThat(done.path()).containsExactly("a", "b", "c", "d");
        assertThat(done.distances()).containsEntry("d", 3.0);
        assertThat(done.visitedNodes()).containsExactlyInAnyOrder("a", "b", "c", "d");
        assertThat(steps.subList(0, steps.size() - 1)).allMatch(s -> s.status() == PROCESSING);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = { "e", "unknown" })
    void noReachableTarget_exploresEverythingAndCompletesWithEmptyPath(String target) {
        List<AlgorithmStepDto> steps = run(algorithm(), chain(), "a", target);

        AlgorithmStepDto done = last(steps);
        assertThat(done.status()).isEqualTo(COMPLETED);
        assertThat(done.path()).isEmpty();
        assertThat(done.visitedNodes()).containsExactlyInAnyOrder("a", "b", "c", "d");
        assertThat(steps.subList(0, steps.size() - 1)).allMatch(s -> s.status() == PROCESSING);
    }

    @Test
    void stepNumbersAreSequentialFromOne() {
        List<AlgorithmStepDto> steps = run(algorithm(), chain(), "a", "e");

        for (int i = 0; i < steps.size(); i++) {
            assertThat(steps.get(i).stepNumber()).isEqualTo(i + 1);
        }
    }

    @Test
    void processingStepPathLeadsFromSourceToActiveNode() {
        List<AlgorithmStepDto> processing = run(algorithm(), chain(), "a", "e").stream()
                .filter(s -> s.status() == PROCESSING)
                .toList();

        assertThat(processing).isNotEmpty().allSatisfy(s -> {
            assertThat(s.path()).startsWith("a");
            assertThat(s.path()).endsWith(s.activeNodeId());
        });
    }

    @Test
    void stepsAreSnapshotsAndNotAffectedByLaterProgress() {
        List<AlgorithmStepDto> steps = run(algorithm(), chain(), "a", "d");

        assertThat(steps.get(0).visitedNodes()).containsExactly("a");
        assertThat(steps.get(0).distances()).containsOnlyKeys("a");
        assertThat(last(steps).visitedNodes()).hasSize(4);
    }

    @Test
    void directedEdgesAreOnlyTraversedForward() {
        Graph directed = graphOf(true, List.of("a", "b"), edge("a", "b", 1));

        assertThat(last(run(algorithm(), directed, "a", "b")).path()).containsExactly("a", "b");
        assertThat(last(run(algorithm(), directed, "b", "a")).path()).isEmpty();
    }
}
