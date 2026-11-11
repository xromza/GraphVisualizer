package ru.xromza.graphvisual.algorithm;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.function.Consumer;

import org.springframework.stereotype.Component;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Edge;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.types.AlgorithmStatus;

/**
 * Реализация: поиск в ширину (BFS). Расстояния суммируют веса рёбер вдоль найденного пути; алгоритм ищет путь с минимальным числом рёбер.
 */
@Component
public class BfsAlgorithm implements GraphAlgorithm {

    public String getId() {
        return "bfs";
    }

    public String getName() {
        return "BFS";
    }

    @Override
    public void compute(Graph graph, String sourceId, String sourceB, Consumer<AlgorithmStepDto> stepListener) {
        if (graph == null || !graph.nodes().containsKey(sourceId)) {
            stepListener.accept(new AlgorithmStepDto(
                    1,
                    sourceId,
                    Set.of(),
                    Map.of(),
                    AlgorithmStatus.COMPLETED,
                    List.of()));
            return;
        }

        Queue<String> queue = new ArrayDeque<>();
        Set<String> visited = new HashSet<>();
        Map<String, Double> distances = new HashMap<>();
        Map<String, String> parentMap = new HashMap<>();

        int stepNumber = 1;

        queue.offer(sourceId);
        visited.add(sourceId);
        distances.put(sourceId, 0.0);

        String current = null;

        while (!queue.isEmpty()) {
            current = queue.poll();
            boolean isTargetReached = (sourceB != null && sourceB.equals(current));

            if (isTargetReached) {
                List<String> path = new ArrayList<>();
                for (String at = current; at != null; at = parentMap.get(at)) {
                    path.add(at);
                }
                Collections.reverse(path);

                stepListener.accept(new AlgorithmStepDto(
                        stepNumber++,
                        current,
                        new HashSet<>(visited),
                        new HashMap<>(distances),
                        AlgorithmStatus.COMPLETED,
                        path));
                return;
            }
            List<String> currentPath = buildPathTo(parentMap, current);
            stepListener.accept(new AlgorithmStepDto(
                    stepNumber++,
                    current,
                    new HashSet<>(visited),
                    new HashMap<>(distances),
                    AlgorithmStatus.PROCESSING,
                    currentPath));

            for (Edge edge : graph.getNeighbors(current)) {
                String neighborId = edge.targetId();

                if (!visited.contains(neighborId)) {
                    visited.add(neighborId);
                    parentMap.put(neighborId, current);
                    distances.put(neighborId, distances.get(current) + edge.weight());
                    queue.offer(neighborId);
                }
            }
        }

        stepListener.accept(new AlgorithmStepDto(
                stepNumber,
                current,
                new HashSet<>(visited),
                new HashMap<>(distances),
                AlgorithmStatus.COMPLETED,
                List.of()));
    }
}
