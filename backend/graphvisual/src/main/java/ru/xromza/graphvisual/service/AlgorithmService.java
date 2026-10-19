package ru.xromza.graphvisual.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.algorithm.AlgorithmRegistry;
import ru.xromza.graphvisual.algorithm.GraphAlgorithm;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;
import ru.xromza.graphvisual.types.AlgorithmStatus;

@Service
@RequiredArgsConstructor
public class AlgorithmService {

    private final AlgorithmRegistry algorithmRegistry;

    public void consumeVisualization(Graph graph, String startNodeId, String targetNodeId, String algorithmType,
            Sinks.Many<AlgorithmStepDto> sink) {

        GraphAlgorithm algorithm = algorithmRegistry.getAlgorithm(algorithmType);
        try {
            algorithm.compute(graph, startNodeId, targetNodeId, step -> {
                sink.tryEmitNext(step);
                if (AlgorithmStatus.COMPLETED.equals(step.status())) {
                    sink.tryEmitComplete();
                }
            });
        } catch (Exception e) {
            sink.tryEmitError(e);
        }
    }
}
