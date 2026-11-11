package ru.xromza.graphvisual.model;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Граф со списком смежности.
 *
 * @param nodes         узлы по идентификатору
 * @param adjacencyList  исходящие рёбра по идентификатору узла-источника
 */
public record Graph(
        Map<String, Node> nodes,
        Map<String, List<Edge>> adjacencyList) {

    /**
     * Строит граф из «сырых» данных запроса.
     *
     * @param rawNodes   узлы в формате {@code [id, label, x, y]}
     * @param rawEdges   рёбра в формате {@code [id, sourceId, targetId, weight]}
     * @param isDirected {@code true} для направленного графа
     * @return построенный граф
     */
    public static Graph of(List<List<Object>> rawNodes, List<List<Object>> rawEdges, boolean isDirected) {
        Map<String, Node> nodes = rawNodes.stream()
                .map(raw -> new Node(
                        (String) raw.get(0),
                        (String) raw.get(1),
                        ((Number) raw.get(2)).doubleValue(),
                        ((Number) raw.get(3)).doubleValue()
                ))
                .collect(Collectors.toMap(Node::id, node -> node));

        List<Edge> flatEdges = rawEdges.stream()
                .map(raw -> new Edge(
                        (String) raw.get(0),
                        (String) raw.get(1),
                        (String) raw.get(2),
                        ((Number) raw.get(3)).doubleValue()
                ))
                .collect(Collectors.toList());

        return Graph.of(nodes, flatEdges, isDirected);
    }

    /**
     * Строит список смежности по плоскому списку рёбер.
     *
     * <p>Для ненаправленного графа к каждому ребру (кроме петель) добавляется обратное ребро
     * с идентификатором {@code <id приёмника>-rev}.
     *
     * @param nodes     узлы по идентификатору
     * @param flatEdges рёбра графа
     * @param isDirected {@code true} для направленного графа
     * @return построенный граф
     */
    public static Graph of(Map<String, Node> nodes, List<Edge> flatEdges, boolean isDirected) {
        Map<String, List<Edge>> adjacency = flatEdges.stream()
                .collect(Collectors.groupingBy(
                        Edge::sourceId, 
                        Collectors.toCollection(ArrayList::new)
                ));

        if (!isDirected) {
            for (Edge edge : flatEdges) {
                if (!edge.sourceId().equals(edge.targetId())) {
                    adjacency.computeIfAbsent(edge.targetId(), e -> new ArrayList<>())
                            .add(new Edge(edge.targetId() + "-rev", edge.targetId(), edge.sourceId(), edge.weight()));
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
