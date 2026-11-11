package ru.xromza.graphvisual.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.algorithm.AlgorithmRegistry;
import ru.xromza.graphvisual.algorithm.GraphAlgorithm;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.types.AlgorithmStatus;

/**
 * Сервис запуска алгоритмов: собирает маршрут из участков и отправляет шаги в приёмник клиента.
 */
@Service
@RequiredArgsConstructor
public class AlgorithmService {

    private final AlgorithmRegistry algorithmRegistry;

    /**
     * Ищет путь start -> waypoints (по порядку) -> target. Каждый участок считается выбранным
     * алгоритмом отдельно; шаги участков склеиваются в один поток с общей нумерацией,
     * накопленным путём и расстояниями, отсчитанными от начала всего маршрута.
     */
    public void consumeVisualization(Graph graph, String startNodeId, String targetNodeId,
            List<String> waypointNodeIds, String algorithmType, Sinks.Many<AlgorithmStepDto> sink) {

        GraphAlgorithm algorithm = algorithmRegistry.getAlgorithm(algorithmType);
        try {
            List<String> stops = buildStops(graph, startNodeId, targetNodeId, waypointNodeIds);

            AtomicInteger stepNumber = new AtomicInteger(1);
            List<String> routeSoFar = new ArrayList<>(List.of(startNodeId));
            double offset = 0;

            for (int leg = 0; leg < stops.size() - 1; leg++) {
                boolean lastLeg = leg == stops.size() - 2;
                String from = stops.get(leg);
                String to = stops.get(leg + 1);

                List<String> prefix = List.copyOf(routeSoFar);
                double distanceOffset = offset;
                AlgorithmStepDto[] lastStep = new AlgorithmStepDto[1];

                algorithm.compute(graph, from, to, step -> {
                    lastStep[0] = step;
                    boolean legDone = AlgorithmStatus.COMPLETED.equals(step.status());
                    if (legDone && !lastLeg && !step.path().isEmpty()) {
                        // Промежуточный участок: итог придёт следующим участком.
                        return;
                    }
                    sink.tryEmitNext(shift(step, stepNumber.getAndIncrement(), prefix, distanceOffset));
                    if (legDone) {
                        sink.tryEmitComplete();
                    }
                });

                AlgorithmStepDto done = lastStep[0];
                if (done == null || done.path().isEmpty()) {
                    // Участок недостижим: поток уже завершён пустым путём (или алгоритм ничего не вернул).
                    if (done == null) {
                        sink.tryEmitNext(new AlgorithmStepDto(stepNumber.getAndIncrement(), from, Set.of(), Map.of(),
                                AlgorithmStatus.COMPLETED, List.of()));
                        sink.tryEmitComplete();
                    }
                    return;
                }

                routeSoFar.addAll(done.path().subList(1, done.path().size()));
                offset += done.distances().getOrDefault(to, 0.0);
            }
        } catch (Exception e) {
            sink.tryEmitError(e);
        }
    }

    /** Старт, существующие промежуточные узлы по порядку, цель; соседние повторы убираются. */
    private List<String> buildStops(Graph graph, String start, String target, List<String> waypoints) {
        List<String> stops = new ArrayList<>();
        stops.add(start);
        if (waypoints != null) {
            waypoints.stream()
                    .filter(id -> graph != null && graph.nodes().containsKey(id))
                    .forEach(stops::add);
        }
        stops.add(target);

        List<String> result = new ArrayList<>();
        for (String id : stops) {
            if (result.isEmpty() || !result.get(result.size() - 1).equals(id)) {
                result.add(id);
            }
        }
        return result;
    }

    /** Переносит шаг участка в координаты всего маршрута. */
    private AlgorithmStepDto shift(AlgorithmStepDto step, int number, List<String> prefix, double offset) {
        Map<String, Double> distances = new HashMap<>();
        step.distances().forEach((id, d) -> distances.put(id, d + offset));

        List<String> path = step.path();
        if (!path.isEmpty()) {
            path = new ArrayList<>(prefix);
            path.addAll(step.path().subList(1, step.path().size()));
        } else if (!AlgorithmStatus.COMPLETED.equals(step.status())) {
            path = prefix;
        }

        Set<String> visited = new HashSet<>(step.visitedNodes());
        visited.addAll(prefix);
        return new AlgorithmStepDto(number, step.activeNodeId(), visited, distances, step.status(), path);
    }
}
