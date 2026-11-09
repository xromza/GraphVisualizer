package ru.xromza.graphvisual.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class GraphTest {

    private static final Node A = new Node("a", "A", 0, 0);
    private static final Node B = new Node("b", "B", 1, 1);

    @Test
    void of_rawData_parsesNodesAndEdgesFromJsonLikeLists() {
        // Числа из JSON приходят как Integer/Double — оба должны приниматься.
        Graph graph = Graph.of(
                List.of(List.of("a", "A", 10, 20.5), List.of("b", "B", 30.0, 40)),
                List.of(List.of("e1", "a", "b", 3)),
                true);

        assertThat(graph.nodes()).containsEntry("a", new Node("a", "A", 10.0, 20.5))
                .containsEntry("b", new Node("b", "B", 30.0, 40.0));
        assertThat(graph.getNeighbors("a")).containsExactly(new Edge("e1", "a", "b", 3.0));
    }

    @Test
    void of_directedGraphKeepsOnlyForwardEdges() {
        Graph graph = Graph.of(Map.of("a", A, "b", B), List.of(new Edge("e1", "a", "b", 2)), true);

        assertThat(graph.getNeighbors("a")).containsExactly(new Edge("e1", "a", "b", 2));
        assertThat(graph.getNeighbors("b")).isEmpty();
    }

    @Test
    void of_undirectedGraphAddsReverseEdgeWithSameWeight() {
        Graph graph = Graph.of(Map.of("a", A, "b", B), List.of(new Edge("e1", "a", "b", 2)), false);

        assertThat(graph.getNeighbors("a")).containsExactly(new Edge("e1", "a", "b", 2));
        assertThat(graph.getNeighbors("b")).containsExactly(new Edge("b-rev", "b", "a", 2));
    }

    @Test
    void of_undirectedGraphAppendsReverseEdgeToExistingAdjacencyList() {
        Graph graph = Graph.of(Map.of("a", A, "b", B),
                List.of(new Edge("e1", "a", "b", 2), new Edge("e2", "b", "a", 7)), false);

        assertThat(graph.getNeighbors("b")).containsExactly(
                new Edge("e2", "b", "a", 7), new Edge("b-rev", "b", "a", 2));
    }

    @Test
    void of_undirectedSelfLoopDoesNotGetReverseEdge() {
        Graph graph = Graph.of(Map.of("a", A), List.of(new Edge("loop", "a", "a", 1)), false);

        assertThat(graph.getNeighbors("a")).containsExactly(new Edge("loop", "a", "a", 1));
    }

    @Test
    void of_edgeWithoutSourceIsRejected() {
        List<Edge> edges = List.of(new Edge("e1", null, "b", 1));

        assertThatThrownBy(() -> Graph.of(Map.of("b", B), edges, false))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void getNeighbors_unknownNodeHasNoNeighbours() {
        Graph graph = Graph.of(Map.of("a", A), List.of(), true);

        assertThat(graph.getNeighbors("missing")).isEmpty();
    }

    @Test
    void getNodes_returnsAllNodes() {
        Graph graph = Graph.of(Map.of("a", A, "b", B), List.of(), true);

        assertThat(graph.getNodes()).containsExactlyInAnyOrder(A, B);
    }
}
