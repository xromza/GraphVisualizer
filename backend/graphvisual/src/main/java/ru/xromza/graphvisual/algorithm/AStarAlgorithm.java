package ru.xromza.graphvisual.algorithm;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.function.Consumer;

import org.springframework.stereotype.Component;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Edge;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.model.Node;
import ru.xromza.graphvisual.types.AlgorithmStatus;

@Component
public class AStarAlgorithm implements GraphAlgorithm {

    public String getId() {
        return "astar";
    }

    public String getName() {
        return "A*";
    }

    @Override
    public void compute(Graph graph, String sourceId, String sourceB, Consumer<AlgorithmStepDto> stepListener) {
        if (graph == null || !graph.nodes().containsKey(sourceId)) {
            stepListener.accept(new AlgorithmStepDto(
                    1, sourceId, Set.of(), Map.of(), AlgorithmStatus.COMPLETED, List.of()));
            return;
        }

        Node targetNode = sourceB != null ? graph.nodes().get(sourceB) : null;
        double averagePixelDistanceBetweenNodes = 200.0; 

        BiFunction<Node, Node, Double> heuristic = (from, to) -> {
            if (from == null || to == null)
                return 0.0;
            double pixelDist = Math.hypot(from.x() - to.x(), from.y() - to.y());
            return pixelDist / averagePixelDistanceBetweenNodes;
        };

        record NodePriority(String id, double gScore, double fScore) {
        }

        PriorityQueue<NodePriority> pq = new PriorityQueue<>(Comparator.comparingDouble(NodePriority::fScore));
        Map<String, Double> gScores = new HashMap<>();
        Map<String, String> parentMap = new HashMap<>();
        Set<String> processed = new HashSet<>(); // Для визуализации посещенных узлов

        int stepNumber = 1;

        Node startNode = graph.nodes().get(sourceId);
        gScores.put(sourceId, 0.0);
        double initialF = heuristic.apply(startNode, targetNode);
        pq.offer(new NodePriority(sourceId, 0.0, initialF));

        String current = null;

        while (!pq.isEmpty()) {
            NodePriority currentEntry = pq.poll();
            current = currentEntry.id();

            // Если этот узел уже был обработан по более короткому пути — пропускаем
            // устаревшую запись из очереди
            if (currentEntry.gScore() > gScores.getOrDefault(current, Double.POSITIVE_INFINITY)) {
                continue;
            }

            processed.add(current);

            boolean isTargetReached = (sourceB != null && sourceB.equals(current));
            List<String> currentPath = buildPathTo(parentMap, current); // Убедитесь, что метод buildPathTo доступен

            if (isTargetReached) {
                List<String> path = new ArrayList<>();
                for (String at = current; at != null; at = parentMap.get(at)) {
                    path.add(at);
                }
                Collections.reverse(path);

                stepListener.accept(new AlgorithmStepDto(
                        stepNumber++,
                        current,
                        new HashSet<>(processed),
                        new HashMap<>(gScores),
                        AlgorithmStatus.COMPLETED,
                        path));
                return;
            }

            stepListener.accept(new AlgorithmStepDto(
                    stepNumber++,
                    current,
                    new HashSet<>(processed),
                    new HashMap<>(gScores),
                    AlgorithmStatus.PROCESSING,
                    currentPath));

            for (Edge edge : graph.getNeighbors(current)) {
                String neighborId = edge.targetId();
                double tentativeGScore = gScores.get(current) + edge.weight();

                // Если нашли более короткий путь к соседу
                if (tentativeGScore < gScores.getOrDefault(neighborId, Double.POSITIVE_INFINITY)) {
                    gScores.put(neighborId, tentativeGScore);
                    parentMap.put(neighborId, current);

                    Node neighborNode = graph.nodes().get(neighborId);
                    double hScore = heuristic.apply(neighborNode, targetNode);
                    double fScore = tentativeGScore + hScore;

                    pq.offer(new NodePriority(neighborId, tentativeGScore, fScore));
                }
            }
        }

        stepListener.accept(new AlgorithmStepDto(
                stepNumber,
                current,
                new HashSet<>(processed),
                new HashMap<>(gScores),
                AlgorithmStatus.COMPLETED,
                List.of()));
    }
}
