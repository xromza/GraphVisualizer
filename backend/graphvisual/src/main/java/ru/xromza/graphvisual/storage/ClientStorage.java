package ru.xromza.graphvisual.storage;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Component;

import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;


@Component
public class ClientStorage {
    private final ConcurrentMap<UUID, Set<Sinks.Many<AlgorithmStepDto>>> userSinks = new ConcurrentHashMap<>();

    public Sinks.Many<AlgorithmStepDto> addClient(UUID clientId) {
        if (clientId == null) {
            throw new IllegalArgumentException("clientId cannot be null");
        }
        Sinks.Many<AlgorithmStepDto> sink = Sinks.many().multicast().onBackpressureBuffer(16, false);

        userSinks.computeIfAbsent(clientId, k -> ConcurrentHashMap.newKeySet()).add(sink);

        return sink;
    }

    public void removeClient(UUID clientId, Sinks.Many<AlgorithmStepDto> sink) {
        Set<Sinks.Many<AlgorithmStepDto>> sinks = userSinks.get(clientId);

        if (sinks != null) {
            sinks.remove(sink);

            if (sinks.isEmpty()) {
                userSinks.remove(clientId, sinks);
            }
        }
    }
}
