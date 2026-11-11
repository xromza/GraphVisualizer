import { test, expect, importGraph, pick, SAMPLE_GRAPH, type Step } from './fixtures';

/**
 * Скриншот-тесты холста. Снимаем только область с графом, чтобы панели и подсказки не влияли.
 * Базовые снимки зависят от ОС и шрифтов: обновлять через `npm run test:e2e -- --update-snapshots`
 * (в CI — в том же окружении, где они генерируются).
 */
const CLIP = { x: 120, y: 230, width: 400, height: 280 };

test.use({ colorScheme: 'light', reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await importGraph(page, SAMPLE_GRAPH);
  await page.waitForTimeout(600); // дождаться анимации появления узлов
});

const shot = (page: import('@playwright/test').Page) =>
  expect(page).toHaveScreenshot({ clip: CLIP, animations: 'disabled', maxDiffPixelRatio: 0.02 });

test('ненаправленный граф', async ({ page }) => {
  await shot(page);
});

test('направленный граф со стрелками', async ({ page }) => {
  await importGraph(page, { ...SAMPLE_GRAPH, directed: true });
  await page.waitForTimeout(600);
  await shot(page);
});

test('завершённый обход: путь и расстояния', async ({ page, backend }) => {
  const done: Step[] = [
    { stepNumber: 1, activeNodeId: 'A', visitedNodes: ['A'], distances: { A: 0 }, status: 'PROCESSING', path: [] },
    { stepNumber: 2, activeNodeId: 'B', visitedNodes: ['A', 'B'], distances: { A: 0, B: 3 }, status: 'COMPLETED', path: ['A', 'B'] },
  ];
  backend.setSteps(done);
  await expect(page.getByRole('button', { name: 'Алгоритм Дейкстры' })).toBeVisible();
  await pick(page, 'Не выбран', 'A');
  await pick(page, 'Не выбран', 'B');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Шаг назад' })).toBeEnabled({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await shot(page);
});
