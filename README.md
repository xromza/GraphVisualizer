# Graph Visualizer

Визуализатор алгоритмов на графах с пошаговой анимацией через SSE.

## Возможности

- **Интерактивное построение графов**: добавление узлов, рёбер с весами
- **Направленные и ненаправленные графы**: поддержка обоих типов
- **Алгоритмы поиска**: BFS, DFS, Dijkstra, A*
- **Пошаговая визуализация**: в реальном времени через Server-Sent Events
- **Современный UI**: темная тема с четкой визуализацией состояний

## Технологии

### Backend
- Spring Boot 3 + Spring WebFlux
- Reactive Streams (SSE)
- Java 21

### Frontend
- Next.js 16 (App Router)
- TypeScript
- Canvas API для рендеринга графов
- Tailwind CSS

## Быстрый старт

### Backend

```bash
cd backend/graphvisual
./mvnw spring-boot:run
```

Backend запустится на http://localhost:8080

### Frontend

```bash
cd frontend/graphvisualizer
npm install
npm run dev
```

Frontend запустится на http://localhost:3000

## Использование

1. **Построение графа**:
   - Выберите инструмент "Добавить узел" и кликните на canvas
   - Выберите "Добавить ребро", укажите вес, кликните на два узла
   - Для направленного графа включите чекбокс

2. **Запуск алгоритма**:
   - Выберите алгоритм из выпадающего списка
   - Выберите начальный и конечный узлы
   - Нажмите "Запустить визуализацию"

3. **Визуализация**:
   - Оранжевый узел — текущий активный
   - Голубые узлы — посещенные
   - Бирюзовый путь — найденный маршрут
   - Цифры под узлами — расстояния от начальной точки

## API Endpoints

### GET /api/v1/algorithm/all
Получить список доступных алгоритмов

**Response:**
```json
[
  { "id": "dijkstra", "name": "Dijkstra" },
  { "id": "astar", "name": "A*" },
  { "id": "bfs", "name": "BFS" },
  { "id": "dfs", "name": "DFS" }
]
```

### POST /api/v1/algorithm
Запустить алгоритм с SSE-стримом

**Request:**
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

**Response (SSE):**
```
event: newStep
data: {"stepNumber":1,"activeNodeId":"node-1","visitedNodes":["node-1"],"distances":{"node-1":0},"status":"PROCESSING","path":[]}

event: newStep
data: {"stepNumber":2,"activeNodeId":"node-2","visitedNodes":["node-1","node-2"],"distances":{"node-1":0,"node-2":5},"status":"PROCESSING","path":[]}
```

## Структура проекта

```
GraphVisualizer/
├── backend/
│   └── graphvisual/
│       └── src/main/java/ru/xromza/graphvisual/
│           ├── algorithm/      # Реализация алгоритмов
│           ├── config/         # Spring конфигурация
│           ├── controller/     # REST контроллеры
│           ├── dto/           # Data Transfer Objects
│           ├── model/         # Модели данных
│           ├── service/       # Бизнес-логика
│           └── storage/       # SSE-клиенты
└── frontend/
    └── graphvisualizer/
        ├── app/              # Next.js App Router
        ├── components/       # React компоненты
        └── lib/             # Утилиты и API клиент
            ├── api.ts           # REST/SSE клиент
            ├── graph-builder.ts # Построение графа
            └── graph-renderer.ts # Canvas рендеринг
```

## Цветовая схема

- **Background**: `#0B0E14` (темный)
- **Surface**: `#0F172A` (slate)
- **Nodes**: `#1E293B` (slate-800)
- **Active**: `#F97316` (оранжевый)
- **Visited**: `#22D3EE` (cyan)
- **Path**: `#4FD1C5` (teal)
- **Selected**: `#38BDF8` (sky)
- **Text**: `#F8FAFC` (почти белый)
