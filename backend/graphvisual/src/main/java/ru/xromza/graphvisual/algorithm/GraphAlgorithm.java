package ru.xromza.graphvisual.algorithm;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import ru.xromza.graphvisual.dto.AlgorithmStepDto;
import ru.xromza.graphvisual.model.Graph;

/**
 * Алгоритм поиска пути на графе с пошаговой выдачей прогресса.
 *
 * <p>Чтобы добавить новый алгоритм, реализуйте этот интерфейс и объявите реализацию Spring-компонентом —
 * {@link AlgorithmRegistry} подхватит её автоматически.
 */
public interface GraphAlgorithm {

    /**
     * Возвращает идентификатор алгоритма.
     *
     * @return уникальный машинный идентификатор алгоритма
     */
    String getId();

    /**
     * Возвращает название алгоритма.
     *
     * @return отображаемое название алгоритма
     */
    String getName();

    /**
     * Выполняет поиск пути от {@code sourceId} до {@code sourceB} и передаёт каждый шаг слушателю.
     *
     * <p>Если граф не задан или в нём нет стартового узла, выдаётся единственный шаг со статусом
     * {@link ru.xromza.graphvisual.types.AlgorithmStatus#COMPLETED} и пустым путём. Если цель достигнута,
     * последний шаг содержит найденный путь, иначе (цель недостижима или не указана) обход завершается
     * шагом с пустым путём.
     *
     * @param graph        граф, по которому выполняется поиск
     * @param sourceId      идентификатор стартового узла
     * @param sourceB       идентификатор целевого узла
     * @param stepListener  получатель шагов алгоритма
     */
    public void compute(Graph graph, String sourceId, String sourceB, Consumer<AlgorithmStepDto> stepListener);

    /**
     * Восстанавливает путь от старта до {@code target} по карте родителей.
     *
     * @param parentMap карта «узел → его предшественник»
     * @param target    узел, до которого строится путь
     * @return узлы пути от начала до {@code target} включительно
     */
    default List<String> buildPathTo(Map<String, String> parentMap, String target) {
        List<String> path = new ArrayList<>();
        for (String at = target; at != null; at = parentMap.get(at)) {
            path.add(at);
        }
        Collections.reverse(path);
        return path;
    }
}
