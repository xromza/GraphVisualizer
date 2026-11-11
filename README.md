<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="material/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="material/logo.svg">
  <img src="material/logo.svg" alt="Graph Visualizer" width="480">
</picture>

**Стройте. Запускайте. Разбирайтесь.**

Интерактивный визуализатор алгоритмов на графах с пошаговой анимацией в реальном времени через Server-Sent Events.

[![Java](https://img.shields.io/badge/Java-%23ED8B00.svg?logo=openjdk&logoColor=white)](https://openjdk.org/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-6DB33F?logo=springboot&logoColor=fff)](https://spring.io/projects/spring-boot)
[![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-%2338B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)](https://docs.docker.com/compose/)
[![nginx](https://img.shields.io/badge/nginx-009639?logo=nginx&logoColor=fff)](https://nginx.org/)
[![Redis](https://img.shields.io/badge/Redis-%23DD0031.svg?logo=redis&logoColor=white)](https://redis.io/)
[![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-F46800?logo=grafana&logoColor=white)](https://grafana.com/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-000?logo=opentelemetry&logoColor=fff)](https://opentelemetry.io/)
[![Playwright](https://custom-icon-badges.demolab.com/badge/Playwright-2EAD33?logo=playwright&logoColor=fff)](https://playwright.dev/)
[![GPLv3](https://img.shields.io/badge/GPLv3-FFFFFF)](LICENSE)
[![Instruction coverage](https://img.shields.io/badge/Instruction%20coverage-100%25-brightgreen)](#тестирование)
[![Branch coverage](https://img.shields.io/badge/Branch%20coverage-100%25-brightgreen)](#тестирование)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](#участие-в-разработке)


</div>

<p align="center">
  <a href="demo/demo-60fps.mp4">
    <img src="demo/demo-last-frame.png" alt="Graph Visualizer — демо" width="820">
  </a>
  <br>
  <sub>▶ Нажмите, чтобы посмотреть демо (<a href="demo/demo-60fps.mp4">60 fps</a> · <a href="demo/demo-30fps.mp4">30 fps</a> · <a href="demo/promo.mp4">промо</a>)</sub>
</p>

<p align="center">
  <img src="demo/demo-dijkstra.png" alt="Алгоритм Дейкстры: найден кратчайший маршрут A → C → E → G → H" width="820">
  <br>
  <sub>Алгоритм Дейкстры: пошаговый проигрыватель, расстояния под узлами и найденный маршрут A → C → E → G → H (длина 13)</sub>
</p>

---

## Содержание

- [Возможности](#возможности)
- [Технологический стек](#технологический-стек)
- [Архитектура](#архитектура)
- [Быстрый старт](#быстрый-старт)
- [Использование](#использование)
- [API](#api)
- [Наблюдаемость](#наблюдаемость)
- [Тестирование](#тестирование)
- [Структура проекта](#структура-проекта)
- [Документация](#документация)
- [Участие в разработке](#участие-в-разработке)
- [Лицензия](#лицензия)

## Возможности

- **Интерактивный редактор графов** — узлы, рёбра с весами, waypoint-точки, адаптивный интерфейс.
- **Направленные и ненаправленные графы.**
- **Алгоритмы поиска пути:** BFS, DFS, Dijkstra, A\*.
- **Пошаговая визуализация в реальном времени** — каждый шаг алгоритма приходит с сервера как SSE-событие и сразу отрисовывается на Canvas.
- **Расширяемость** — новый алгоритм это одна реализация `GraphAlgorithm`, регистрируемая в `AlgorithmRegistry`.
- **Защита от злоупотреблений** — rate limiting на Bucket4j с хранением состояния в Redis.
- **Готовая observability-обвязка** — Prometheus, Grafana, Loki, OpenTelemetry.
- **Высокое покрытие тестами** — 100% инструкций и 100% ветвлений (по отчёту JaCoCo).

## Технологический стек

| Слой | Технологии |
|---|---|
| **Backend** | Java 25, Spring Boot 4.1, Spring WebFlux (Reactor, SSE), Lombok |
| **Rate limiting** | Bucket4j + Lettuce, Redis |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, Canvas API, Tailwind CSS, Framer Motion, Lucide |
| **Observability** | Spring Actuator, Micrometer + Prometheus, OpenTelemetry, Loki (logback appender), Grafana, cAdvisor, node-exporter |
| **Инфраструктура** | Docker, Docker Compose, Nginx (reverse proxy, HTTPS-конфиг в `nginx.https.conf`) |
| **Качество** | JUnit, WebFlux Test, JaCoCo, ESLint, Playwright |

## Архитектура

```
 Браузер ──▶ Nginx ──┬──▶ Frontend (Next.js :3000)
                     └──▶ Backend  (Spring WebFlux :8080) ──▶ Redis (rate limit)
                                         │
                                         └──▶ Prometheus · Loki · OpenTelemetry ──▶ Grafana
```

Клиент отправляет граф и параметры запуска одним `POST`-запросом, а сервер в ответ стримит
последовательность шагов алгоритма (`text/event-stream`). Фронтенд применяет каждый шаг
к состоянию визуализации по мере поступления. Диаграммы C4, BPMN, IDEF0 и sequence лежат в [`docs/`](docs).

## Быстрый старт

### Вариант 1 — Docker Compose (весь стек)

Требуется Docker с плагином Compose.

```bash
git clone git@github.com:xromza/GraphVisualizer.git
cd GraphVisualizer
docker compose up --build
```

| Сервис | Адрес |
|---|---|
| Приложение (через Nginx) | http://localhost |
| Grafana | http://localhost:3000 (`admin` / `admin` — смените пароль в `docker-compose.yml`) |
| Prometheus | http://localhost:9090 |
| cAdvisor | http://localhost:8081 |

> Конфигурация Nginx с HTTPS (`nginx.https.conf`) рассчитана на сертификаты Let's Encrypt в `/etc/letsencrypt`.

### Вариант 2 — локальная разработка

**Требования:** JDK 25, Node.js 20+, Redis (для rate limiter).

```bash
# Redis
docker run -d --name redis -p 6379:6379 redis:latest

# Backend → http://localhost:8080
cd backend/graphvisual
./mvnw spring-boot:run

# Frontend → http://localhost:3000
cd frontend/graphvisualizer
npm install
npm run dev
```

## Использование

1. **Постройте граф.** Выберите инструмент «Добавить узел» и кликайте по canvas. Для ребра задайте вес и кликните по двум узлам. Для направленного графа включите соответствующий переключатель.
2. **Выберите алгоритм** (BFS, DFS, Dijkstra, A\*), начальный и конечный узлы.
3. **Запустите визуализацию** и наблюдайте работу алгоритма шаг за шагом.

| Обозначение | Значение |
|---|---|
| 🟠 Оранжевый узел | Текущий обрабатываемый узел |
| 🔵 Голубые узлы | Посещённые |
| 🟢 Бирюзовый путь | Найденный маршрут |
| Числа под узлами | Расстояние от начальной вершины |

## API

Базовый путь: `/api/v1`.

### `GET /algorithm/all`

Список доступных алгоритмов.

```json
[
  { "id": "dijkstra", "name": "Dijkstra" },
  { "id": "astar", "name": "A*" },
  { "id": "bfs", "name": "BFS" },
  { "id": "dfs", "name": "DFS" }
]
```

### `POST /algorithm/run`

Запускает алгоритм и возвращает поток шагов в формате SSE (`text/event-stream`).

**Запрос:**

```json
{
  "algorithmType": "dijkstra",
  "startNodeId": "node-1",
  "targetNodeId": "node-5",
  "directed": false,
  "nodes": {
    "node-1": { "id": "node-1", "label": "A", "x": 100, "y": 100 }
  },
  "edges": [
    { "id": "edge-1", "sourceId": "node-1", "targetId": "node-2", "weight": 5 }
  ]
}
```

**Ответ (SSE):**

```
event: newStep
data: {"stepNumber":1,"activeNodeId":"node-1","visitedNodes":["node-1"],"distances":{"node-1":0},"status":"PROCESSING","path":[]}

event: newStep
data: {"stepNumber":2,"activeNodeId":"node-2","visitedNodes":["node-1","node-2"],"distances":{"node-1":0,"node-2":5},"status":"PROCESSING","path":[]}
```

При превышении лимита запросов сервер возвращает ошибку в формате `ErrorResponse`.

## Наблюдаемость

- **Метрики:** `/actuator/prometheus` → Prometheus → Grafana.
- **Health-check:** `/actuator/health` (используется в healthcheck контейнеров).
- **Логи:** Logback → Loki → Grafana (`logback-spring.xml`).
- **Трассировка:** OpenTelemetry (`spring-boot-starter-opentelemetry`).
- **Ресурсы хоста и контейнеров:** node-exporter и cAdvisor.

## Тестирование

```bash
# Backend: тесты + отчёт JaCoCo (backend/graphvisual/target/site/jacoco)
cd backend/graphvisual
./mvnw verify

# Frontend: линтинг
cd frontend/graphvisualizer
npm run lint
```

## Структура проекта

```
GraphVisualizer/
├── backend/graphvisual/
│   └── src/main/java/ru/xromza/graphvisual/
│       ├── algorithm/      # BFS, DFS, Dijkstra, A*, реестр алгоритмов
│       ├── config/         # CORS, rate limiter, Netty, обработка ошибок
│       ├── controller/     # REST + SSE контроллер
│       ├── dto/            # Data Transfer Objects, rate limiting filter
│       ├── model/          # Graph, Node, Edge
│       ├── service/        # Оркестрация запуска алгоритмов
│       └── storage/        # Хранилище SSE-клиентов
├── frontend/graphvisualizer/
│   ├── app/                # Next.js App Router
│   ├── components/         # React-компоненты
│   └── lib/                # api.ts, graph-builder.ts, graph-renderer.ts
├── docs/                   # C4, BPMN, IDEF0, sequence-диаграммы
├── demo/                   # Демо- и промо-видео
├── docker-compose.yml      # Приложение + observability-стек
├── nginx.conf              # Reverse proxy (HTTP)
├── nginx.https.conf        # Reverse proxy (HTTPS)
└── prometheus.yml
```

## Документация

Архитектурные диаграммы проекта:

- **C4:** [контекст](docs/c4/C4_L1_context.svg) · [контейнеры](docs/c4/C4_L2_containers.svg)
- **BPMN:** [бизнес-процесс](docs/bpmn/bpmn-diagram.svg)
- **IDEF0:** [A-0](docs/idef0/A-0_context.svg) · [A0](docs/idef0/A0_decomposition.svg) · [A4](docs/idef0/A4_decomposition.svg)
- **Sequence:** [визуализация графа](docs/sequence/graph_visualization.svg)

## Участие в разработке

Pull request'ы и идеи приветствуются.

1. Сделайте fork и создайте ветку: `git checkout -b feat/my-feature`.
2. Следуйте [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `chore:` …).
3. Добавьте тесты для нового поведения — проект держит покрытие на высоком уровне.
4. Откройте Pull Request.

### Добавление нового алгоритма

1. Реализуйте интерфейс `GraphAlgorithm` в пакете `algorithm/`.
2. Зарегистрируйте реализацию в `AlgorithmRegistry`.
3. Добавьте тест по образцу `AbstractGraphAlgorithmTest`.

## Лицензия

Проект распространяется под лицензией [GNU GPLv3](LICENSE).

---

<div align="center">
<sub>Сделано с ❤️ <a href="https://github.com/xromza">xromza</a></sub>
</div>
