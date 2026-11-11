package ru.xromza.graphvisual;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Точка входа приложения Graph Visualizer: реактивный backend, который выполняет алгоритмы на графах
 * и стримит их шаги клиенту через Server-Sent Events.
 */
@SpringBootApplication
public class GraphvisualApplication {

	public static void main(String[] args) {
		SpringApplication.run(GraphvisualApplication.class, args);
	}

}
