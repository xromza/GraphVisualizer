package ru.xromza.graphvisual.algorithm;

import static org.assertj.core.api.Assertions.assertThat;
import static ru.xromza.graphvisual.TestGraphs.activeNodes;
import static ru.xromza.graphvisual.TestGraphs.edge;
import static ru.xromza.graphvisual.TestGraphs.graphOf;
import static ru.xromza.graphvisual.TestGraphs.run;

import java.util.List;

import org.junit.jupiter.api.Test;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;

class BfsAlgorithmTest extends AbstractGraphAlgorithmTest {

    /** a -> b, a -> c, b -> d, c -> d: d достижим двумя путями. */
    private static Graph diamond() {
        return graphOf(true, List.of("a", "b", "c", "d"),
                edge("a", "b", 1), edge("a", "c", 2), edge("b", "d", 4), edge("c", "d", 1));
    }

    @Override
    protected GraphAlgorithm algorithm() {
        return new BfsAlgorithm();
    }

    @Test
    void exposesIdAndName() {
        assertThat(algorithm().getId()).isEqualTo("bfs");
        assertThat(algorithm().getName()).isEqualTo("BFS");
    }

    @Test
    void visitsNodesLevelByLevel() {
        List<AlgorithmStepDto> steps = run(algorithm(), diamond(), "a", null);

        assertThat(activeNodes(steps.subList(0, 4))).containsExactly("a", "b", "c", "d");
    }

    @Test
    void discoveredNeighboursCountAsVisitedBeforeTheyAreProcessed() {
        List<AlgorithmStepDto> steps = run(algorithm(), diamond(), "a", null);

        assertThat(steps.get(0).visitedNodes()).containsExactly("a");
        assertThat(steps.get(1).visitedNodes()).containsExactlyInAnyOrder("a", "b", "c");
    }

    @Test
    void firstDiscoveryWinsEvenWhenAnotherPathIsCheaper() {
        List<AlgorithmStepDto> steps = run(algorithm(), diamond(), "a", "d");

        AlgorithmStepDto done = steps.get(steps.size() - 1);
        assertThat(done.path()).containsExactly("a", "b", "d");
        assertThat(done.distances()).containsEntry("d", 5.0);
    }
}
