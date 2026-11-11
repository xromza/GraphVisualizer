package ru.xromza.graphvisual.model;

/**
 * Узел графа.
 *
 * @param id    идентификатор узла
 * @param label подпись узла
 * @param x     координата X на холсте (используется эвристикой A*)
 * @param y     координата Y на холсте (используется эвристикой A*)
 */
public record Node(
        String id,
        String label,
        double x,
        double y) {

}
