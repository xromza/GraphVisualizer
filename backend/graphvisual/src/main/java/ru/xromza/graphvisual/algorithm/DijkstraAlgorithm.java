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
import java.util.function.Consumer;

import org.springframework.stereotype.Component;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Edge;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.types.AlgorithmStatus;

@Component
public class DijkstraAlgorithm implements GraphAlgorithm {

    public String getId() {
        return "dijkstra";
    }

    public String getName() {
        return "Дейкстры";
    }

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

        record NodeDistance(String id, double distance) {
        }

        PriorityQueue<NodeDistance> pq = new PriorityQueue<>(Comparator.comparingDouble(NodeDistance::distance));
        Set<String> visited = new HashSet<>();
        Map<String, Double> distances = new HashMap<>();
        Map<String, String> parentMap = new HashMap<>();

        int stepNumber = 1;

        distances.put(sourceId, 0.0);
        pq.offer(new NodeDistance(sourceId, 0.0));

        String current = null;

        while (!pq.isEmpty()) {
            NodeDistance currentEntry = pq.poll();
            current = currentEntry.id();

            if (visited.contains(current)) {
                continue;
            }

            visited.add(current);

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
                    double newDist = distances.get(current) + edge.weight();

                    if (newDist < distances.getOrDefault(neighborId, Double.POSITIVE_INFINITY)) {
                        distances.put(neighborId, newDist);
                        parentMap.put(neighborId, current); // Запоминаем предка
                        pq.offer(new NodeDistance(neighborId, newDist));
                    }
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
