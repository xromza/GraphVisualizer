package ru.xromza.graphvisual.dto;

import java.util.List;
import java.util.Map;

import ru.xromza.graphvisual.types.AlgorithmStatus;

public record AlgorithmStepDto(
        int stepNumber,
        String activeNodeId,
        List<String> visitedNodes,
        Map<String, Double> distances,
        AlgorithmStatus status) {
}
