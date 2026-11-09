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

class DijkstraAlgorithmTest extends AbstractGraphAlgorithmTest {

    /** Прямой путь a-c стоит 5, обходной a-b-c — 2. */
    private static Graph shortcut() {
        return graphOf(false, List.of("a", "b", "c"),
                edge("a", "b", 1), edge("b", "c", 1), edge("a", "c", 5));
    }

    @Override
    protected GraphAlgorithm algorithm() {
        return new DijkstraAlgorithm();
    }

    @Test
    void exposesIdAndName() {
        assertThat(algorithm().getId()).isEqualTo("dijkstra");
        assertThat(algorithm().getName()).isEqualTo("Алгоритм Дейкстры");
    }

    @Test
    void prefersCheaperPathOverFewerHops() {
        List<AlgorithmStepDto> steps = run(algorithm(), shortcut(), "a", "c");

        AlgorithmStepDto done = steps.get(steps.size() - 1);
        assertThat(done.path()).containsExactly("a", "b", "c");
        assertThat(done.distances()).containsEntry("c", 2.0);
    }

    @Test
    void outdatedQueueEntriesAreSkipped() {
        // c попадает в очередь дважды (со стоимостью 5 и 2); устаревшая запись не даёт шага.
        List<AlgorithmStepDto> steps = run(algorithm(), shortcut(), "a", null);

        assertThat(steps).hasSize(4);
        assertThat(activeNodes(steps.subList(0, 3))).containsExactly("a", "b", "c");
        assertThat(steps.get(3).distances()).containsEntry("c", 2.0);
    }
}
