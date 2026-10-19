package ru.xromza.graphvisual.dto;

import java.time.LocalDateTime;

public record ErrorResponse(
    String name,
    String description,
    String endpoint,
    LocalDateTime timestamp
) {
    
}
