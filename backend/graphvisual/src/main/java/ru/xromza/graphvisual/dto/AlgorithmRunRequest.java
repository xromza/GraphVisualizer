package ru.xromza.graphvisual.dto;

import java.util.List;

public record AlgorithmRunRequest(
        String algorithmType,
        String startNodeId,
        String targetNodeId,
        List<String> waypointNodeIds,
        List<List<Object>> nodes,
        List<List<Object>> edges,
        boolean directed) {

}
