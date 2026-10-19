package ru.xromza.graphvisual.model;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public record Graph(
        Map<String, Node> nodes,
        Map<String, List<Edge>> adjacencyList) {

    public static Graph of(Map<String, Node> nodes, List<Edge> flatEdges, boolean isDirected) {
        Map<String, List<Edge>> adjacency = flatEdges.stream().collect(Collectors.groupingBy(Edge::sourceId));
        if (!isDirected) {
            for (Edge edge : flatEdges) {
                if (edge.sourceId() != edge.targetId()) {
                    adjacency.computeIfAbsent(edge.targetId(), e -> new ArrayList<>())
                            .add(new Edge(edge.targetId(), edge.targetId(), edge.sourceId(), edge.weight()));
                }
            }
        }

        return new Graph(nodes, adjacency);
    }

    public List<Edge> getNeighbors(String nodeId) {
        return adjacencyList.getOrDefault(nodeId, List.of());
    }

    public Collection<Node> getNodes() {
        return nodes.values();
    }
}
