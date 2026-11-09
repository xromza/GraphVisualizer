package ru.xromza.graphvisual.algorithm;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;

/** Проверяет метод buildPathTo, который интерфейс отдаёт всем алгоритмам. */
class GraphAlgorithmTest {

    private final GraphAlgorithm algorithm = new GraphAlgorithm() {
        @Override
        public String getId() {
            return "stub";
        }

        @Override
        public String getName() {
            return "Stub";
        }

        @Override
        public void compute(Graph graph, String sourceId, String sourceB, Consumer<AlgorithmStepDto> stepListener) {
        }
    };

    @Test
    void buildPathTo_followsParentsBackToTheRootAndReturnsRootFirst() {
        Map<String, String> parents = Map.of("d", "c", "c", "b", "b", "a");

        assertThat(algorithm.buildPathTo(parents, "d")).containsExactly("a", "b", "c", "d");
    }

    @Test
    void buildPathTo_nodeWithoutParentIsItsOwnPath() {
        assertThat(algorithm.buildPathTo(Map.of(), "a")).containsExactly("a");
    }

    @Test
    void buildPathTo_nullTargetGivesEmptyPath() {
        assertThat(algorithm.buildPathTo(Map.of(), null)).isEmpty();
    }
}
