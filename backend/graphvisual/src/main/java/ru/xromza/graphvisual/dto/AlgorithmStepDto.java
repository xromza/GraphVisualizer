package ru.xromza.graphvisual.dto;

import java.util.List;
import java.util.Map;
import java.util.Set;

import ru.xromza.graphvisual.types.AlgorithmStatus;

/**
 * Один шаг работы алгоритма, отправляемый клиенту как SSE-событие {@code newStep}.
 *
 * @param stepNumber   порядковый номер шага, начиная с 1
 * @param activeNodeId узел, обрабатываемый на этом шаге
 * @param visitedNodes узлы, обработанные к этому моменту
 * @param distances    известные расстояния от начала маршрута до узлов
 * @param status       состояние алгоритма
 * @param path         путь до активного узла; на финальном шаге — найденный маршрут (пустой, если цель недостижима)
 */
public record AlgorithmStepDto(
        int stepNumber,
        String activeNodeId,
        Set<String> visitedNodes,
        Map<String, Double> distances,
        AlgorithmStatus status,
        List<String> path) {
}
