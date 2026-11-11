import { test, expect, importGraph, pick, SAMPLE_GRAPH, type Step } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await importGraph(page, SAMPLE_GRAPH);
});

async function setupRoute(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'Алгоритм Дейкстры' })).toBeVisible(); // загрузились из /algorithm/all
  await pick(page, 'Не выбран', 'A');
  await pick(page, 'Не выбран', 'B');
  await expect(page.getByRole('button', { name: 'Не выбран' })).toHaveCount(0);
}

/** Пробел запускает обход, только если фокус на body. */
async function run(page: import('@playwright/test').Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
}

test('список алгоритмов приходит с бэкенда, первый выбран по умолчанию', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Алгоритм Дейкстры' })).toBeVisible();
});

test('запуск отправляет граф в сжатом формате и доигрывает шаги', async ({ page, backend }) => {
  await setupRoute(page);
  await run(page);

  await expect.poll(() => backend.runRequests.length).toBe(1);
  expect(backend.runRequests[0]).toMatchObject({
    algorithmType: 'DIJKSTRA',
    startNodeId: 'A',
    targetNodeId: 'B',
    directed: false,
    nodes: [['A', 'A', 200, 300], ['B', 'B', 400, 300], ['C', 'C', 300, 450]],
    edges: [['e1', 'A', 'B', 3]],
  });
  // после завершения доступна навигация по шагам
  await expect(page.getByRole('button', { name: 'Шаг назад' })).toBeEnabled({ timeout: 10_000 });
});

test('навигация по шагам: назад, в начало, вперёд, в конец', async ({ page }) => {
  await setupRoute(page);
  await run(page);
  const back = page.getByRole('button', { name: 'Шаг назад' });
  const fwd = page.getByRole('button', { name: 'Шаг вперёд' });
  await expect(back).toBeEnabled({ timeout: 10_000 });
  await expect(fwd).toBeDisabled(); // на последнем шаге

  await page.getByRole('button', { name: 'В начало' }).click();
  await expect(back).toBeDisabled();
  await expect(fwd).toBeEnabled();

  await page.keyboard.press('ArrowRight');
  await expect(back).toBeEnabled();
  await page.keyboard.press('End');
  await expect(fwd).toBeDisabled();
  await page.keyboard.press('Home');
  await expect(back).toBeDisabled();
});

test('статус ERROR показывает сообщение', async ({ page, backend }) => {
  const steps: Step[] = [{ stepNumber: 1, activeNodeId: null, visitedNodes: [], distances: {}, status: 'ERROR', path: [] }];
  backend.setSteps(steps);
  await setupRoute(page);
  await run(page);
  await expect(page.getByText('Алгоритм завершился с ошибкой')).toBeVisible();
});

test('HTTP 500 от бэкенда показывает ошибку, а повторный запуск работает', async ({ page, backend }) => {
  backend.failRunWith(500);
  await setupRoute(page);
  await run(page);
  await expect(page.getByText('HTTP error! status: 500')).toBeVisible();

  await page.keyboard.press('p'); // панель могла закрыться при запуске
  await run(page);
  await expect.poll(() => backend.runRequests.length).toBe(2);
});

test('запуск без выбранных узлов ничего не отправляет', async ({ page, backend }) => {
  await expect(page.getByRole('button', { name: 'Алгоритм Дейкстры' })).toBeVisible();
  await run(page);
  await page.waitForTimeout(300);
  expect(backend.runRequests).toHaveLength(0);
});
