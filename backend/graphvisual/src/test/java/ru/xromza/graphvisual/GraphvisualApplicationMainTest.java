package ru.xromza.graphvisual;

import static org.mockito.Mockito.mockStatic;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.boot.SpringApplication;

class GraphvisualApplicationMainTest {

	@Test
	void main_startsSpringApplicationWithGivenArguments() {
		String[] args = { "--spring.main.web-application-type=none" };

		try (MockedStatic<SpringApplication> spring = mockStatic(SpringApplication.class)) {
			GraphvisualApplication.main(args);

			spring.verify(() -> SpringApplication.run(GraphvisualApplication.class, args));
		}
	}

}
