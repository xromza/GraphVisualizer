package ru.xromza.graphvisual;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.algorithm.AlgorithmRegistry;
import ru.xromza.graphvisual.algorithm.BfsAlgorithm;
import ru.xromza.graphvisual.algorithm.DijkstraAlgorithm;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Edge;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.model.Node;
import ru.xromza.graphvisual.service.AlgorithmService;
import ru.xromza.graphvisual.types.AlgorithmStatus;

class AlgorithmServiceWaypointsTest {

    private final AlgorithmService service =
            new AlgorithmService(new AlgorithmRegistry(List.of(new DijkstraAlgorithm(), new BfsAlgorithm())));

    private Graph graph() {
        Map<String, Node> nodes = Map.of(
                "a", new Node("a", "a", 0, 0), "b", new Node("b", "b", 0, 0),
                "c", new Node("c", "c", 0, 0), "d", new Node("d", "d", 0, 0),
                "x", new Node("x", "x", 0, 0));
        List<Edge> edges = List.of(
                new Edge("1", "a", "b", 1), new Edge("2", "b", "c", 1),
                new Edge("3", "c", "d", 1), new Edge("4", "a", "d", 1.5));
        return Graph.of(nodes, edges, false);
    }

    private List<AlgorithmStepDto> run(String algo, String from, String to, List<String> via) {
        Sinks.Many<AlgorithmStepDto> sink = Sinks.many().replay().all();
        service.consumeVisualization(graph(), from, to, via, algo, sink);
        return new ArrayList<>(sink.asFlux().collectList().block());
    }

    @Test
    void routeGoesThroughWaypointAndAccumulatesDistance() {
        List<AlgorithmStepDto> steps = run("dijkstra", "a", "d", List.of("c"));
        AlgorithmStepDto last = steps.get(steps.size() - 1);
        assertEquals(AlgorithmStatus.COMPLETED, last.status());
        assertEquals(List.of("a", "b", "c", "d"), last.path());
        assertEquals(3.0, last.distances().get("d"), 1e-9);
        assertEquals(1, steps.stream().filter(s -> s.status() == AlgorithmStatus.COMPLETED).count());
        for (int i = 0; i < steps.size(); i++) assertEquals(i + 1, steps.get(i).stepNumber());
    }

    @Test
    void withoutWaypointsBehaviourIsUnchanged() {
        assertEquals(List.of("a", "d"), run("dijkstra", "a", "d", null).getLast().path());
    }

    @Test
    void unreachableWaypointEndsWithEmptyPath() {
        AlgorithmStepDto last = run("bfs", "a", "d", List.of("x")).getLast();
        assertEquals(AlgorithmStatus.COMPLETED, last.status());
        assertTrue(last.path().isEmpty());
    }
}
