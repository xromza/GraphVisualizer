package ru.xromza.graphvisual.model;

public record Edge(
        String id,
        String sourceId,
        String targetId,
        double weight) {
}
