import { test, expect, importGraph, exportGraph, SAMPLE_GRAPH } from './fixtures';

test.describe('редактор графа', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('клик по холсту в режиме «Узел» создаёт узлы A, B', async ({ page }) => {
    await page.getByRole('button', { name: 'Узел', exact: true }).click();
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 300, y: 300 } });
    await canvas.click({ position: { x: 500, y: 300 } });
    const g = await exportGraph(page);
    expect(g.nodes.map(n => n.label)).toEqual(['A', 'B']);
  });

  test('горячая клавиша N включает режим добавления узла', async ({ page }) => {
    await page.keyboard.press('n');
    await page.locator('canvas').click({ position: { x: 300, y: 300 } });
    expect((await exportGraph(page)).nodes).toHaveLength(1);
  });

  test('ребро создаётся двумя кликами по узлам с выбранным весом', async ({ page }) => {
    await importGraph(page, { ...SAMPLE_GRAPH, edges: [] });
    await page.keyboard.press('e');
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: await screenX(page, 'A'), y: await screenY(page, 'A') } });
    await expect(page.getByText('Выберите второй узел')).toBeVisible();
    await canvas.click({ position: { x: await screenX(page, 'B'), y: await screenY(page, 'B') } });
    const g = await exportGraph(page);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ sourceId: 'A', targetId: 'B', weight: 1 });
  });

  test('Escape отменяет выбор первого узла ребра', async ({ page }) => {
    await importGraph(page, SAMPLE_GRAPH);
    await page.keyboard.press('e');
    await page.locator('canvas').click({ position: { x: await screenX(page, 'A'), y: await screenY(page, 'A') } });
    await expect(page.getByText('Выберите второй узел')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Выберите второй узел')).toHaveCount(0);
  });

  test('режим «Удалить» удаляет узел вместе с рёбрами', async ({ page }) => {
    await importGraph(page, SAMPLE_GRAPH);
    await page.keyboard.press('d');
    await page.locator('canvas').click({ position: { x: await screenX(page, 'A'), y: await screenY(page, 'A') } });
    const g = await exportGraph(page);
    expect(g.nodes.map(n => n.id)).toEqual(['B', 'C']);
    expect(g.edges).toHaveLength(0);
  });

  test('«Очистить холст» требует подтверждения', async ({ page }) => {
    await importGraph(page, SAMPLE_GRAPH);
    await page.getByRole('button', { name: 'Очистить холст' }).click();
    await expect(page.getByText('Очистить холст?')).toBeVisible();
    await page.keyboard.press('Escape');
    expect((await exportGraph(page)).nodes).toHaveLength(3);

    await page.getByRole('button', { name: 'Очистить холст' }).click();
    await page.getByRole('button', { name: 'Очистить', exact: true }).click();
    expect((await exportGraph(page)).nodes).toHaveLength(0);
  });

  test('«Случайный граф» валидирует число и создаёт узлы', async ({ page }) => {
    await page.getByRole('button', { name: 'Случайный граф…' }).click();
    const input = page.getByRole('alertdialog').getByRole('textbox');
    await input.fill('1');
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page.getByText('Введите число от 2 до 1000.')).toBeVisible();
    await input.fill('7');
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect.poll(async () => (await exportGraph(page)).nodes.length).toBe(7);
  });
});

test.describe('импорт / экспорт', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('экспорт возвращает то, что импортировали', async ({ page }) => {
    await importGraph(page, SAMPLE_GRAPH);
    const g = await exportGraph(page);
    expect(g.nodes).toEqual(SAMPLE_GRAPH.nodes);
    expect(g.edges[0]).toMatchObject({ sourceId: 'A', targetId: 'B', weight: 3 });
    expect(g.directed).toBe(false);
  });

  test('флаг directed из JSON включает переключатель', async ({ page }) => {
    await importGraph(page, { ...SAMPLE_GRAPH, directed: true });
    expect((await exportGraph(page)).directed).toBe(true);
  });

  test('невалидный JSON и неверная структура показывают ошибку', async ({ page }) => {
    await page.getByRole('button', { name: 'Импорт' }).click();
    const area = page.getByPlaceholder('Вставьте JSON сюда...');
    await area.fill('{oops');
    await page.getByRole('button', { name: 'Применить' }).click();
    await expect(page.locator('p[role=alert]')).toContainText('Не удалось прочитать JSON');
    await area.fill('{"nodes": []}');
    await page.getByRole('button', { name: 'Применить' }).click();
    await expect(page.locator('p[role=alert]')).toContainText('Неверный формат');
  });

  test('Escape закрывает модалку', async ({ page }) => {
    await page.getByRole('button', { name: 'Импорт' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Вставьте JSON сюда...')).toHaveCount(0);
  });
});

// Преобразование мировых координат в экранные: без пан/зума в начале сессии камера может быть смещена,
// поэтому находим положение узла по его фактическому отрисованному месту через публичный экспорт + центр холста.
async function screenX(page: import('@playwright/test').Page, id: string) { return (await screenPos(page, id)).x; }
async function screenY(page: import('@playwright/test').Page, id: string) { return (await screenPos(page, id)).y; }
async function screenPos(page: import('@playwright/test').Page, id: string) {
  const g = await exportGraph(page);
  const n = g.nodes.find(n => n.id === id)!;
  // Начальная камера: мировые координаты = экранные (после импорта камера не меняется).
  return { x: n.x, y: n.y };
}
