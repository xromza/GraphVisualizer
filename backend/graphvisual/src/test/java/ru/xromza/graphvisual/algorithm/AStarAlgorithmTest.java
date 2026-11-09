package ru.xromza.graphvisual.algorithm;

import static org.assertj.core.api.Assertions.assertThat;
import static ru.xromza.graphvisual.TestGraphs.activeNodes;
import static ru.xromza.graphvisual.TestGraphs.edge;
import static ru.xromza.graphvisual.TestGraphs.graphOf;
import static ru.xromza.graphvisual.TestGraphs.graphWithNodes;
import static ru.xromza.graphvisual.TestGraphs.node;
import static ru.xromza.graphvisual.TestGraphs.run;

import java.util.List;

import org.junit.jupiter.api.Test;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;

class AStarAlgorithmTest extends AbstractGraphAlgorithmTest {

    @Override
    protected GraphAlgorithm algorithm() {
        return new AStarAlgorithm();
    }

    @Test
    void exposesIdAndName() {
        assertThat(algorithm().getId()).isEqualTo("astar");
        assertThat(algorithm().getName()).isEqualTo("A*");
    }

    @Test
    void heuristicSteersSearchTowardsTarget() {
        // d равноудалён от a, как и b, но лежит в стороне от цели c.
        var graph = graphWithNodes(false,
                List.of(node("a", 0, 0), node("b", 200, 0), node("c", 400, 0), node("d", 0, 200)),
                edge("a", "b", 1), edge("b", "c", 1), edge("a", "d", 1));

        List<AlgorithmStepDto> steps = run(algorithm(), graph, "a", "c");

        assertThat(activeNodes(steps)).containsExactly("a", "b", "c");
        AlgorithmStepDto done = steps.get(2);
        assertThat(done.path()).containsExactly("a", "b", "c");
        assertThat(done.visitedNodes()).doesNotContain("d");
    }

    @Test
    void outdatedQueueEntriesAreSkipped() {
        // b попадает в очередь дважды (g=5 и g=2); устаревшая запись не даёт шага.
        var graph = graphOf(true, List.of("a", "b", "c"),
                edge("a", "b", 5), edge("a", "c", 1), edge("c", "b", 1));

        List<AlgorithmStepDto> steps = run(algorithm(), graph, "a", null);

        assertThat(activeNodes(steps)).containsExactly("a", "c", "b", "b");
        assertThat(steps.get(3).distances()).containsEntry("b", 2.0);
    }

    @Test
    void edgeLeadingToUnknownNodeIsTraversedWithZeroHeuristic() {
        var graph = graphWithNodes(true,
                List.of(node("a", 0, 0), node("t", 400, 0)),
                edge("a", "ghost", 1), edge("a", "t", 3));

        List<AlgorithmStepDto> steps = run(algorithm(), graph, "a", "t");

        assertThat(activeNodes(steps)).containsExactly("a", "ghost", "t");
        assertThat(steps.get(2).path()).containsExactly("a", "t");
    }
}
