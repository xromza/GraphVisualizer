package ru.xromza.graphvisual.dto;

import java.util.List;

/**
 * Запрос на запуск алгоритма с потоковой выдачей шагов.
 *
 * <p>Узлы и рёбра передаются в компактном виде (массивы значений):
 * узел — {@code [id, label, x, y]}, ребро — {@code [id, sourceId, targetId, weight]}.
 *
 * @param algorithmType   идентификатор алгоритма (например, {@code dijkstra}, {@code astar}, {@code bfs}, {@code dfs})
 * @param startNodeId     идентификатор стартового узла
 * @param targetNodeId    идентификатор целевого узла
 * @param waypointNodeIds промежуточные узлы, которые маршрут должен пройти по порядку (может быть {@code null})
 * @param nodes           список узлов в формате {@code [id, label, x, y]}
 * @param edges           список рёбер в формате {@code [id, sourceId, targetId, weight]}
 * @param directed        {@code true}, если граф направленный
 */
public record AlgorithmRunRequest(
        String algorithmType,
        String startNodeId,
        String targetNodeId,
        List<String> waypointNodeIds,
        List<List<Object>> nodes,
        List<List<Object>> edges,
        boolean directed) {

}
