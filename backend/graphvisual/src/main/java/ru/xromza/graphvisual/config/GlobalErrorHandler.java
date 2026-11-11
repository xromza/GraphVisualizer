package ru.xromza.graphvisual.config;

import java.time.LocalDateTime;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import reactor.core.publisher.Mono;
import ru.xromza.graphvisual.dto.ErrorResponse;

@RestControllerAdvice
public class GlobalErrorHandler {

    /**
     * Преобразует {@link IllegalStateException} (например, неизвестный алгоритм) в ответ {@code 400 Bad Request}.
     *
     * @param e       исключение
     * @param request запрос, при обработке которого оно возникло
     * @return ответ с описанием ошибки
     */
    @ExceptionHandler(IllegalStateException.class)
    public Mono<ResponseEntity<ErrorResponse>> handleExceptions(IllegalStateException e, ServerHttpRequest request) {
        return Mono.just(ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("IllegalState",
                        e.getMessage(),
                        request.getPath().toString(),
                        LocalDateTime.now())));
    }
    
}
