package ru.xromza.graphvisual.storage;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Component;

import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;


/**
 * Хранилище активных SSE-подписчиков: для каждого клиента держит набор приёмников ({@link Sinks.Many}),
 * в которые алгоритм отправляет шаги.
 */
@Component
public class ClientStorage {
    private final ConcurrentMap<UUID, Set<Sinks.Many<AlgorithmStepDto>>> userSinks = new ConcurrentHashMap<>();

    /**
     * Регистрирует нового клиента и создаёт для него буферизованный multicast-приёмник (до 1024 шагов).
     *
     * @param clientId идентификатор клиента
     * @return приёмник, в который нужно отправлять шаги этого клиента
     * @throws IllegalArgumentException если {@code clientId} равен {@code null}
     */
    public Sinks.Many<AlgorithmStepDto> addClient(UUID clientId) {
        if (clientId == null) {
            throw new IllegalArgumentException("clientId cannot be null");
        }
        Sinks.Many<AlgorithmStepDto> sink = Sinks.many().multicast().onBackpressureBuffer(1024, false);

        userSinks.computeIfAbsent(clientId, k -> ConcurrentHashMap.newKeySet()).add(sink);

        return sink;
    }

    /**
     * Удаляет приёмник клиента; если у клиента не осталось приёмников, удаляет и самого клиента.
     *
     * @param clientId идентификатор клиента
     * @param sink     приёмник, который нужно удалить
     */
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
