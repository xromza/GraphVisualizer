package ru.xromza.graphvisual.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import reactor.core.publisher.Sinks;
import ru.xromza.graphvisual.dto.AlgorithmStepDto;

class ClientStorageTest {

    private final ClientStorage storage = new ClientStorage();

    @SuppressWarnings("unchecked")
    private Map<UUID, Set<Sinks.Many<AlgorithmStepDto>>> registered() {
        return (Map<UUID, Set<Sinks.Many<AlgorithmStepDto>>>) ReflectionTestUtils.getField(storage, "userSinks");
    }

    @Test
    void addClient_nullIdIsRejected() {
        assertThatThrownBy(() -> storage.addClient(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("clientId cannot be null");
    }

    @Test
    void addClient_registersNewSinkUnderClientId() {
        UUID id = UUID.randomUUID();

        Sinks.Many<AlgorithmStepDto> sink = storage.addClient(id);

        assertThat(sink).isNotNull();
        assertThat(registered()).containsOnlyKeys(id);
        assertThat(registered().get(id)).containsExactly(sink);
    }

    @Test
    void addClient_sameClientGetsIndependentSinks() {
        UUID id = UUID.randomUUID();

        Sinks.Many<AlgorithmStepDto> first = storage.addClient(id);
        Sinks.Many<AlgorithmStepDto> second = storage.addClient(id);

        assertThat(second).isNotSameAs(first);
        assertThat(registered().get(id)).containsExactlyInAnyOrder(first, second);
    }

    @Test
    void removeClient_keepsClientWhileOtherSinksRemain() {
        UUID id = UUID.randomUUID();
        Sinks.Many<AlgorithmStepDto> first = storage.addClient(id);
        Sinks.Many<AlgorithmStepDto> second = storage.addClient(id);

        storage.removeClient(id, first);

        assertThat(registered().get(id)).containsExactly(second);
    }

    @Test
    void removeClient_dropsClientWhenLastSinkIsRemoved() {
        UUID id = UUID.randomUUID();
        Sinks.Many<AlgorithmStepDto> sink = storage.addClient(id);

        storage.removeClient(id, sink);

        assertThat(registered()).isEmpty();
    }

    @Test
    void removeClient_unknownClientIsIgnored() {
        UUID id = UUID.randomUUID();
        Sinks.Many<AlgorithmStepDto> sink = storage.addClient(id);

        storage.removeClient(UUID.randomUUID(), sink);

        assertThat(registered().get(id)).containsExactly(sink);
    }
}
