package ru.xromza.graphvisual.algorithm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import ru.xromza.graphvisual.dto.AlgorithmListEntryDto;

class AlgorithmRegistryTest {

    private final BfsAlgorithm bfs = new BfsAlgorithm();
    private final DijkstraAlgorithm dijkstra = new DijkstraAlgorithm();
    private final AlgorithmRegistry registry = new AlgorithmRegistry(List.of(bfs, dijkstra));

    @Test
    void getAlgorithm_returnsRegisteredImplementationById() {
        assertThat(registry.getAlgorithm("bfs")).isSameAs(bfs);
        assertThat(registry.getAlgorithm("dijkstra")).isSameAs(dijkstra);
    }

    @Test
    void getAlgorithm_unknownIdIsRejected() {
        assertThatThrownBy(() -> registry.getAlgorithm("nope"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Такого алгоритма нет");
    }

    @Test
    void getAvailableAlgorithms_listsIdAndNameOfEveryAlgorithm() {
        assertThat(registry.getAvailableAlgorithms()).containsExactlyInAnyOrder(
                new AlgorithmListEntryDto("bfs", "BFS"),
                new AlgorithmListEntryDto("dijkstra", "Алгоритм Дейкстры"));
    }

    @Test
    void getAvailableAlgorithms_emptyRegistryGivesEmptyList() {
        assertThat(new AlgorithmRegistry(List.of()).getAvailableAlgorithms()).isEmpty();
    }
}
