package ru.xromza.graphvisual.model;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

public record Graph(
        Map<String, Node> nodes,
        Map<String, List<Edge>> adjacencyList) {
    public void addNode(Node node) {
        nodes.put(node.id(), node);
    }

    public void addEdge(Edge edge) {
        adjacencyList.computeIfAbsent(edge.id(), k -> new ArrayList<Edge>()).add(edge);
    }

    public List<Edge> getNeighbors(String nodeId) {
        // TODO getNeighbors
        return List.of();
    }

    public Collection<Node> getNodes() {
        return nodes.values();
    }
}
