import { test as base, expect, type Page, type Route } from '@playwright/test';

export interface Step {
  stepNumber: number;
  activeNodeId: string | null;
  visitedNodes: string[];
  distances: Record<string, number>;
  status: 'PROCESSING' | 'COMPLETED' | 'ERROR';
  path: string[];
}

export interface BackendMock {
  /** Тела POST /algorithm/run, полученные от фронтенда. */
  runRequests: Record<string, unknown>[];
  /** Шаги, которые «бэкенд» отдаст по SSE. */
  setSteps(steps: Step[]): void;
  /** Следующий запуск вернёт HTTP-статус. */
  failRunWith(status: number): void;
  /** Список алгоритмов недоступен. */
  failAlgorithms(): void;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

export const ALGORITHMS = [
  { id: 'DIJKSTRA', name: 'Алгоритм Дейкстры' },
  { id: 'BFS', name: 'Поиск в ширину' },
];

export const defaultSteps = (): Step[] => [
  { stepNumber: 1, activeNodeId: 'A', visitedNodes: ['A'], distances: { A: 0 }, status: 'PROCESSING', path: [] },
  { stepNumber: 2, activeNodeId: 'B', visitedNodes: ['A', 'B'], distances: { A: 0, B: 1 }, status: 'PROCESSING', path: [] },
  { stepNumber: 3, activeNodeId: 'B', visitedNodes: ['A', 'B'], distances: { A: 0, B: 1 }, status: 'COMPLETED', path: ['A', 'B'] },
];

const sse = (steps: Step[]) => steps.map(s => `data: ${JSON.stringify(s)}\n\n`).join('');

/** Подменяет весь бэкенд (/algorithm/*) на уровне браузера. */
export async function mockBackend(page: Page): Promise<BackendMock> {
  let steps = defaultSteps();
  let runStatus = 200;
  let algorithmsDown = false;
  const runRequests: Record<string, unknown>[] = [];

  await page.route('**/algorithm/**', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (req.url().endsWith('/algorithm/all')) {
      if (algorithmsDown) return route.fulfill({ status: 500, headers: CORS, body: 'down' });
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(ALGORITHMS) });
    }

    if (req.url().endsWith('/algorithm/run')) {
      runRequests.push(req.postDataJSON());
      if (runStatus !== 200) {
        const status = runStatus;
        runStatus = 200;
        return route.fulfill({ status, headers: CORS, body: 'error' });
      }
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(steps) });
    }
    return route.continue();
  });

  return {
    runRequests,
    setSteps: s => { steps = s; },
    failRunWith: s => { runStatus = s; },
    failAlgorithms: () => { algorithmsDown = true; },
  };
}

export const test = base.extend<{ backend: BackendMock }>({
  backend: [async ({ page }, use) => use(await mockBackend(page)), { auto: true }],
});

export { expect };

/** Простой граф A→B (вес 3) + C. Координаты в мировых единицах. */
export const SAMPLE_GRAPH = {
  nodes: [
    { id: 'A', label: 'A', x: 200, y: 300 },
    { id: 'B', label: 'B', x: 400, y: 300 },
    { id: 'C', label: 'C', x: 300, y: 450 },
  ],
  edges: [{ id: 'e1', sourceId: 'A', targetId: 'B', weight: 3 }],
  directed: false,
};

/** Загружает граф через модалку «Импорт». */
export async function importGraph(page: Page, graph: unknown) {
  await page.getByRole('button', { name: 'Импорт' }).click();
  await page.getByPlaceholder('Вставьте JSON сюда...').fill(JSON.stringify(graph));
  await page.getByRole('button', { name: 'Применить' }).click();
}

/** Читает граф через модалку «Экспорт». */
export async function exportGraph(page: Page) {
  await page.getByRole('button', { name: 'Экспорт' }).click();
  const text = await page.getByPlaceholder('Вставьте JSON сюда...').inputValue();
  await page.getByRole('button', { name: 'Готово' }).click();
  return JSON.parse(text) as { nodes: { id: string; label: string; x: number; y: number }[]; edges: { sourceId: string; targetId: string; weight: number }[]; directed: boolean };
}

/** Выбор значения в кастомном <select> по порядку на панели. */
export async function pick(page: Page, trigger: string | RegExp, option: string) {
  await page.getByRole('button', { name: trigger }).first().click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0); // дождаться закрытия списка
}
