package ru.xromza.graphvisual.algorithm;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import ru.xromza.graphvisual.dto.AlgorithmListEntryDto;

@Service
public class AlgorithmRegistry {
    private final Map<String, GraphAlgorithm> algorithmMap;

    public AlgorithmRegistry(List<GraphAlgorithm> algorithms) {
        this.algorithmMap = algorithms.stream()
                .collect(Collectors.toMap(GraphAlgorithm::getId, Function.identity()));
    }

    public List<AlgorithmListEntryDto> getAvailableAlgorithms() {
        return algorithmMap.values().stream().map(a -> new AlgorithmListEntryDto(a.getId(), a.getName())).toList();
    }

    public GraphAlgorithm getAlgorithm(String algorithmId) {
        return Optional.ofNullable(algorithmMap.get(algorithmId))
                .orElseThrow(() -> new IllegalStateException("Такого алгоритма нет"));
    }

}
