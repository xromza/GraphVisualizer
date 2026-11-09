package ru.xromza.graphvisual.algorithm;

import static org.assertj.core.api.Assertions.assertThat;
import static ru.xromza.graphvisual.TestGraphs.activeNodes;
import static ru.xromza.graphvisual.TestGraphs.edge;
import static ru.xromza.graphvisual.TestGraphs.graphOf;
import static ru.xromza.graphvisual.TestGraphs.run;
import static ru.xromza.graphvisual.types.AlgorithmStatus.COMPLETED;

import java.util.List;

import org.junit.jupiter.api.Test;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;

class DfsAlgorithmTest extends AbstractGraphAlgorithmTest {

    @Override
    protected GraphAlgorithm algorithm() {
        return new DfsAlgorithm();
    }

    @Test
    void exposesIdAndName() {
        assertThat(algorithm().getId()).isEqualTo("dfs");
        assertThat(algorithm().getName()).isEqualTo("DFS");
    }

    @Test
    void goesDeepBeforeWide() {
        var graph = graphOf(true, List.of("a", "b", "c", "d"),
                edge("a", "b", 1), edge("a", "c", 1), edge("b", "d", 1));

        List<AlgorithmStepDto> steps = run(algorithm(), graph, "a", null);

        assertThat(activeNodes(steps.subList(0, 4))).containsExactly("a", "b", "d", "c");
    }

    @Test
    void nodeQueuedTwiceIsProcessedOnlyOnce() {
        // c кладётся в стек и из a, и из b; вторая запись должна быть пропущена.
        var graph = graphOf(true, List.of("a", "b", "c"),
                edge("a", "b", 1), edge("a", "c", 1), edge("b", "c", 1));

        List<AlgorithmStepDto> steps = run(algorithm(), graph, "a", null);

        assertThat(steps).hasSize(4);
        assertThat(activeNodes(steps.subList(0, 3))).containsExactly("a", "b", "c");
        assertThat(steps.get(2).path()).containsExactly("a", "b", "c");
        assertThat(steps.get(3).status()).isEqualTo(COMPLETED);
        assertThat(steps.get(3).distances()).containsEntry("c", 2.0);
    }
}
