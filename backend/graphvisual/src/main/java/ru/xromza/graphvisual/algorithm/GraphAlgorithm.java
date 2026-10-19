package ru.xromza.graphvisual.algorithm;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;

public interface GraphAlgorithm {

    String getId();

    String getName();

    public void compute(Graph graph, String sourceId, String sourceB, Consumer<AlgorithmStepDto> stepListener);

    default List<String> buildPathTo(Map<String, String> parentMap, String target) {
        List<String> path = new ArrayList<>();
        for (String at = target; at != null; at = parentMap.get(at)) {
            path.add(at);
        }
        Collections.reverse(path);
        return path;
    }
}
