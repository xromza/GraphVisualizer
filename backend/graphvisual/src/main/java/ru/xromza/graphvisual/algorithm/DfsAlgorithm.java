package ru.xromza.graphvisual.algorithm;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

import org.springframework.stereotype.Component;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Edge;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.types.AlgorithmStatus;

@Component
public class DfsAlgorithm implements GraphAlgorithm {

    public String getId() {
        return "dfs";
    }

    public String getName() {
        return "DFS";
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

        record StackEntry(String id, String parentId) {}

        Deque<StackEntry> stack = new ArrayDeque<>();
        Set<String> visited = new HashSet<>();
        Map<String, Double> distances = new HashMap<>();
        Map<String, String> parentMap = new HashMap<>();

        int stepNumber = 1;

        stack.push(new StackEntry(sourceId, null));
        distances.put(sourceId, 0.0);

        String current = null;

        while (!stack.isEmpty()) {
            StackEntry entry = stack.pop();
            current = entry.id();

            if (visited.contains(current)) {
                continue;
            }

            visited.add(current);
            if (entry.parentId() != null) {
                parentMap.put(current, entry.parentId());
            }

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

            List<Edge> neighbors = graph.getNeighbors(current);
            for (int i = neighbors.size() - 1; i >= 0; i--) {
                String neighborId = neighbors.get(i).targetId();

                if (!visited.contains(neighborId)) {
                    distances.put(neighborId, distances.get(current) + 1.0);
                    stack.push(new StackEntry(neighborId, current));
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
