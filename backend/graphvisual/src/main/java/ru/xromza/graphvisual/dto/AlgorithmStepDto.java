package ru.xromza.graphvisual.dto;

import java.util.List;
import java.util.Map;
import java.util.Set;

import ru.xromza.graphvisual.types.AlgorithmStatus;

public record AlgorithmStepDto(
        int stepNumber,
        String activeNodeId,
        Set<String> visitedNodes,
        Map<String, Double> distances,
        AlgorithmStatus status,
        List<String> path) {
}
