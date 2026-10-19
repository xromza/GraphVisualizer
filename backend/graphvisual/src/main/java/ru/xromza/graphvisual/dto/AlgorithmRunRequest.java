package ru.xromza.graphvisual.dto;

import java.util.List;
import java.util.Map;

import ru.xromza.graphvisual.model.Edge;
import ru.xromza.graphvisual.model.Node;

public record AlgorithmRunRequest(
        String algorithmType,
        String startNodeId,
        String targetNodeId,
        Map<String, Node> nodes,
        List<Edge> edges,
        boolean directed) {

}
