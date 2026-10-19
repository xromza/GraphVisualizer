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
                    1,
                    sourceId,
                    Set.of(),
                    Map.of(),
                    AlgorithmStatus.COMPLETED,
                    List.of()));
            return;
        }

        Node targetNode = sourceB != null ? graph.nodes().get(sourceB) : null;

        java.util.function.BiFunction<Node, Node, Double> heuristic = (from, to) -> {
            if (from == null || to == null) {
                return 0.0;
            }
            return Math.hypot(from.x() - to.x(), from.y() - to.y());
        };

        record NodePriority(String id, double fScore) {
        }

        PriorityQueue<NodePriority> pq = new PriorityQueue<>(Comparator.comparingDouble(NodePriority::fScore));
        Set<String> visited = new HashSet<>();
        Map<String, Double> gScores = new HashMap<>();
        Map<String, String> parentMap = new HashMap<>();

        int stepNumber = 1;

        Node startNode = graph.nodes().get(sourceId);
        gScores.put(sourceId, 0.0);
        double initialF = heuristic.apply(startNode, targetNode);
        pq.offer(new NodePriority(sourceId, initialF));

        String current = null;

        while (!pq.isEmpty()) {
            NodePriority currentEntry = pq.poll();
            current = currentEntry.id();

            if (visited.contains(current)) {
                continue;
            }

            visited.add(current);

            boolean isTargetReached = (sourceB != null && sourceB.equals(current));
            List<String> currentPath = buildPathTo(parentMap, current);
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
                        new HashMap<>(gScores),
                        AlgorithmStatus.COMPLETED,
                        path));
                return;
            }

            stepListener.accept(new AlgorithmStepDto(
                    stepNumber++,
                    current,
                    new HashSet<>(visited),
                    new HashMap<>(gScores),
                    AlgorithmStatus.PROCESSING,
                    currentPath));

            for (Edge edge : graph.getNeighbors(current)) {
                String neighborId = edge.targetId();

                if (!visited.contains(neighborId)) {
                    double tentativeGScore = gScores.get(current) + edge.weight();

                    if (tentativeGScore < gScores.getOrDefault(neighborId, Double.POSITIVE_INFINITY)) {
                        gScores.put(neighborId, tentativeGScore);
                        parentMap.put(neighborId, current);

                        Node neighborNode = graph.nodes().get(neighborId);
                        double hScore = heuristic.apply(neighborNode, targetNode);
                        double fScore = tentativeGScore + hScore;

                        pq.offer(new NodePriority(neighborId, fScore));
                    }
                }
            }
        }

        stepListener.accept(new AlgorithmStepDto(
                stepNumber,
                current,
                new HashSet<>(visited),
                new HashMap<>(gScores),
                AlgorithmStatus.COMPLETED,
                List.of()));
    }
}
