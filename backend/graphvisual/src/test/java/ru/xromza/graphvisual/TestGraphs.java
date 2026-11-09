package ru.xromza.graphvisual;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import ru.xromza.graphvisual.algorithm.GraphAlgorithm;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Edge;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.model.Node;

/** Небольшие помощники для сборки графов и запуска алгоритмов в тестах. */
public final class TestGraphs {

    private TestGraphs() {
    }

    public static Node node(String id, double x, double y) {
        return new Node(id, id, x, y);
    }

    public static Edge edge(String from, String to, double weight) {
        return new Edge(from + "->" + to, from, to, weight);
    }

    /** Граф, все узлы которого лежат в (0, 0) — эвристика A* в нём нулевая. */
    public static Graph graphOf(boolean directed, List<String> nodeIds, Edge... edges) {
        return graphWithNodes(directed, nodeIds.stream().map(id -> node(id, 0, 0)).toList(), edges);
    }

    public static Graph graphWithNodes(boolean directed, List<Node> nodes, Edge... edges) {
        Map<String, Node> byId = new LinkedHashMap<>();
        nodes.forEach(n -> byId.put(n.id(), n));
        return Graph.of(byId, List.of(edges), directed);
    }

    public static List<AlgorithmStepDto> run(GraphAlgorithm algorithm, Graph graph, String from, String to) {
        List<AlgorithmStepDto> steps = new ArrayList<>();
        algorithm.compute(graph, from, to, steps::add);
        return steps;
    }

    public static List<String> activeNodes(List<AlgorithmStepDto> steps) {
        return steps.stream().map(AlgorithmStepDto::activeNodeId).toList();
    }
}
