import type { Node, Edge } from '@/lib/api';

// 1. Круговое размещение (Circular)
export function applyCircularLayout(
  nodes: Map<string, Node>,
  center: { x: number; y: number },
  radius = 250
) {
  const nodeArray = Array.from(nodes.values());
  const count = nodeArray.length;
  if (count === 0) return;

  nodeArray.forEach((node, index) => {
    const angle = (index / count) * 2 * Math.PI;
    node.x = center.x + radius * Math.cos(angle);
    node.y = center.y + radius * Math.sin(angle);
  });
}

// 2. Сеточное размещение (Grid)
export function applyGridLayout(
  nodes: Map<string, Node>,
  center: { x: number; y: number },
  step = 100
) {
  const nodeArray = Array.from(nodes.values());
  const count = nodeArray.length;
  if (count === 0) return;

  const cols = Math.ceil(Math.sqrt(count));
  const startX = center.x - ((cols - 1) * step) / 2;
  const startY = center.y - ((Math.ceil(count / cols) - 1) * step) / 2;

  nodeArray.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    node.x = startX + col * step;
    node.y = startY + row * step;
  });
}

// 3. Иерархическое / Слоеное размещение (BFS Layers)
export function applyHierarchicalLayout(
  nodes: Map<string, Node>,
  edges: Edge[],
  startNodeId: string | null,
  center: { x: number; y: number },
  levelHeight = 120,
  nodeWidth = 140
) {
  const nodeArray = Array.from(nodes.values());
  if (nodeArray.length === 0) return;

  // Строим список смежности
  const adj = new Map<string, string[]>();
  nodes.forEach((_, id) => adj.set(id, []));
  edges.forEach(e => {
    if (nodes.has(e.sourceId) && nodes.has(e.targetId)) {
      adj.get(e.sourceId)?.push(e.targetId);
      adj.get(e.targetId)?.push(e.sourceId);
    }
  });

  // Определяем корень (старт) или берем первый попавшийся узел
  const root = (startNodeId && nodes.has(startNodeId)) ? startNodeId : nodeArray[0].id;

  // Распределяем узлы по уровням (слоям) через BFS
  const levels = new Map<string, number>();
  const queue: string[] = [root];
  levels.set(root, 0);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLevel = levels.get(curr)!;

    for (const neighbor of adj.get(curr) || []) {
      if (!levels.has(neighbor)) {
        levels.set(neighbor, currLevel + 1);
        queue.push(neighbor);
      }
    }
  }

  // Если есть изолированные узлы, у которых уровень не определился
  nodeArray.forEach(n => {
    if (!levels.has(n.id)) levels.set(n.id, 0);
  });

  // Группируем узлы по уровням
  const layers = new Map<number, string[]>();
  levels.forEach((lvl, id) => {
    if (!layers.has(lvl)) layers.set(lvl, []);
    layers.get(lvl)!.push(id);
  });

  // Расставляем координаты
  const maxLayer = Math.max(...Array.from(layers.keys()));
  const startY = center.y - (maxLayer * levelHeight) / 2;

  layers.forEach((layerNodes, lvl) => {
    const rowWidth = layerNodes.length * nodeWidth;
    const startX = center.x - rowWidth / 2;

    layerNodes.forEach((id, idx) => {
      const node = nodes.get(id);
      if (node) {
        node.x = startX + idx * nodeWidth + nodeWidth / 2;
        node.y = startY + lvl * levelHeight;
      }
    });
  });
}