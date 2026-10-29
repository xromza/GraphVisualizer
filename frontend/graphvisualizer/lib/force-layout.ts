import type { Node, Edge } from './api';

interface ForceOptions {
  /** Предохранитель на случай, если система не успокаивается. */
  iterations?: number;
  onTick?: () => void;
  onDone?: () => void;
}

/**
 * Силовое авто-размещение графа (Force-Directed Graph Layout).
 * Возвращает функцию отмены анимации.
 */
export function applyForceDirectedLayout(
  nodesMap: Map<string, Node>,
  edges: Edge[],
  center: { x: number; y: number },
  options: ForceOptions = {}
): () => void {
  const { iterations = 600, onTick, onDone } = options;
  const nodes = Array.from(nodesMap.values());

  if (nodes.length < 2) {
    onDone?.();
    return () => {};
  }

  // Физические коэффициенты
  const idealDistance = 140; // Желаемая длина ребра
  const kRepulsion = 18000;  // Сила отталкивания вершин
  const kSpring = 0.04;      // Коэффициент жесткости ребер-пружин
  const kGravity = 0.02;     // Сила притяжения к центру
  const damping = 0.82;      // Затухание скорости
  const maxSpeed = 30;       // Ограничение скорости за шаг
  const restSpeed = 0.15;    // Система в равновесии, если ни один узел не движется быстрее (px/кадр)
  const restFrames = 6;      // ...на протяжении стольких кадров подряд

  // Скорости вершин
  const velocities = new Map<string, { vx: number; vy: number }>();
  nodes.forEach(n => velocities.set(n.id, { vx: 0, vy: 0 }));

  // Если узлы наложены друг на друга в одной точке — разбрасываем их со случайным сдвигом
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < 10) {
        const angle = Math.random() * Math.PI * 2;
        nodes[j].x += Math.cos(angle) * 40;
        nodes[j].y += Math.sin(angle) * 40;
      }
    }
  }

  let currentIteration = 0;
  let calmFrames = 0;
  let animId: number;

  const step = () => {
    // 1. Отталкивание между ВСЕМИ парами вершин (Кулон)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const u = nodes[i];
        const v = nodes[j];

        const dx = v.x - u.x;
        const dy = v.y - u.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 1) dist = 1;

        const force = Math.min(kRepulsion / (dist * dist), 50);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        const uVel = velocities.get(u.id)!;
        const vVel = velocities.get(v.id)!;

        uVel.vx -= fx;
        uVel.vy -= fy;
        vVel.vx += fx;
        vVel.vy += fy;
      }
    }

    // 2. Притяжение связанных вершин вдоль рёбер (пружины Гука)
    edges.forEach(edge => {
      const u = nodesMap.get(edge.sourceId);
      const v = nodesMap.get(edge.targetId);
      if (!u || !v || u === v) return;

      const dx = v.x - u.x;
      const dy = v.y - u.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 1) dist = 1;

      const displacement = dist - idealDistance;
      const force = displacement * kSpring;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      const uVel = velocities.get(u.id)!;
      const vVel = velocities.get(v.id)!;

      uVel.vx += fx;
      uVel.vy += fy;
      vVel.vx -= fx;
      vVel.vy -= fy;
    });

    // 3. Притяжение к центру экрана и обновление позиций
    let fastest = 0;
    nodes.forEach(node => {
      const vel = velocities.get(node.id)!;

      // Гравитация к центру
      vel.vx += (center.x - node.x) * kGravity;
      vel.vy += (center.y - node.y) * kGravity;

      // Затухание
      vel.vx *= damping;
      vel.vy *= damping;

      // Ограничение максимальной скорости
      const speed = Math.hypot(vel.vx, vel.vy);
      if (speed > maxSpeed) {
        vel.vx = (vel.vx / speed) * maxSpeed;
        vel.vy = (vel.vy / speed) * maxSpeed;
      }

      node.x += vel.vx;
      node.y += vel.vy;
      fastest = Math.max(fastest, Math.hypot(vel.vx, vel.vy));
    });

    calmFrames = fastest < restSpeed ? calmFrames + 1 : 0;

    onTick?.();

    currentIteration++;
    if (calmFrames < restFrames && currentIteration < iterations) {
      animId = requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };

  animId = requestAnimationFrame(step);

  return () => cancelAnimationFrame(animId);
}