package ru.xromza.graphvisual;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import io.github.bucket4j.distributed.proxy.AsyncProxyManager;

@SpringBootTest(properties = { "REDIS_HOST=localhost", "REDIS_PORT=6379" })
class GraphvisualApplicationTests {

	// Реальный менеджер подключается к Redis при создании — для теста контекста он не нужен.
	@MockitoBean
	AsyncProxyManager<byte[]> asyncProxyManager;

	@Test
	void contextLoads() {
	}

}
