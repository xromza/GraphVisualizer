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

    public Sinks.Many<AlgorithmStepDto> addClient(UUID employeeUid) {
        if (employeeUid == null) {
            throw new IllegalArgumentException("employeeUid cannot be null");
        }
        Sinks.Many<AlgorithmStepDto> sink = Sinks.many().multicast().onBackpressureBuffer(16, false);

        userSinks.computeIfAbsent(employeeUid, k -> ConcurrentHashMap.newKeySet()).add(sink);

        return sink;
    }

    public void removeClient(UUID employeeUid, Sinks.Many<AlgorithmStepDto> sink) {
        Set<Sinks.Many<AlgorithmStepDto>> sinks = userSinks.get(employeeUid);

        if (sinks != null) {
            sinks.remove(sink);

            if (sinks.isEmpty()) {
                userSinks.remove(employeeUid, sinks);
            }
        }
    }

    public Set<Sinks.Many<AlgorithmStepDto>> getSinksByEmployeeUid(UUID employeeUid) {
        if (employeeUid == null) {
            return null;
        }
        return userSinks.get(employeeUid);
    }
}
