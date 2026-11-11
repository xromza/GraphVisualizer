// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Node, Edge, AlgorithmStep } from '@/lib/api';
import { GraphRenderer } from '@/lib/graph-renderer';

/** Контекст-«магнитофон»: любой метод — vi.fn(), любое свойство можно присваивать. */
function makeCtx() {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(props, {
    get(_t, key: string) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: vi.fn() });
      if (key in props) return props[key];
      return (calls[key] ??= vi.fn());
    },
    set(_t, key: string, v) { props[key] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const nodesOf = (...ns: [string, number, number][]) =>
  new Map<string, Node>(ns.map(([id, x, y]) => [id, { id, label: id, x, y }]));
const edge = (id: string, s: string, t: string, weight = 1): Edge => ({ id, sourceId: s, targetId: t, weight });

let canvas: HTMLCanvasElement;
let calls: ReturnType<typeof makeCtx>['calls'];
let r: GraphRenderer;
let rafQueue: FrameRequestCallback[];
let now: number;

const ptr = (type: string, init: Partial<PointerEventInit> & { clientX?: number; clientY?: number } = {}, target: EventTarget = canvas) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, pointerType: 'mouse', ...init }));

beforeEach(() => {
  now = 1000;
  rafQueue = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), matches: false }));

  const { ctx, calls: c } = makeCtx();
  calls = c;
  canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} });
  r = new GraphRenderer(canvas);
});

afterEach(() => {
  r.destroy();
  canvas.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flushFrames = (advanceMs: number) => {
  now += advanceMs;
  const q = rafQueue; rafQueue = [];
  q.forEach(cb => cb(now));
};

describe('GraphRenderer: камера', () => {
  it('screenToWorld и worldToScreen взаимно обратны', () => {
    r.pan = { x: 40, y: -20 }; r.zoom = 2;
    const w = r.screenToWorld(140, 80);
    expect(w).toEqual({ x: 50, y: 50 });
    expect(r.worldToScreen(w.x, w.y)).toEqual({ x: 140, y: 80 });
  });

  it('setupCanvas учитывает devicePixelRatio и размеры', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    r.resize();
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.style.width).toBe('800px');
    expect(calls.scale).toHaveBeenCalledWith(2, 2);
  });

  it('колесо мыши масштабирует вокруг курсора и ограничивает зум', () => {
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100, cancelable: true }));
    expect(r.zoom).toBeCloseTo(1.08);
    // точка под курсором остаётся на месте
    expect(r.worldToScreen(100, 100).x).toBeCloseTo(100);

    for (let i = 0; i < 100; i++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, clientX: 0, clientY: 0 }));
    expect(r.zoom).toBe(4);
    for (let i = 0; i < 200; i++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, clientX: 0, clientY: 0 }));
    expect(r.zoom).toBe(0.2);
  });
});

describe('GraphRenderer: взаимодействие', () => {
  let nodes: Map<string, Node>;
  beforeEach(() => {
    nodes = nodesOf(['A', 100, 100], ['B', 300, 100]);
    r.setGraph(nodes, [edge('e1', 'A', 'B', 5)]);
  });

  it('панорамирование фона сдвигает камеру без клика', () => {
    const bg = vi.fn(); r.onCanvasBackgroundClick = bg;
    ptr('pointerdown', { clientX: 500, clientY: 400 });
    ptr('pointermove', { clientX: 540, clientY: 430 }, window);
    ptr('pointerup', { clientX: 540, clientY: 430 }, window);
    expect(r.pan).toEqual({ x: 40, y: 30 });
    expect(bg).not.toHaveBeenCalled();
  });

  it('клик по пустому месту вызывает onCanvasBackgroundClick', () => {
    const bg = vi.fn(); r.onCanvasBackgroundClick = bg;
    ptr('pointerdown', { clientX: 500, clientY: 400 });
    ptr('pointerup', { clientX: 500, clientY: 400 }, window);
    expect(bg).toHaveBeenCalledOnce();
  });

  it('клик по узлу вызывает onNodeClick, а перетаскивание двигает узел', () => {
    const click = vi.fn(); const move = vi.fn();
    r.onNodeClick = click; r.onNodeMove = move;

    ptr('pointerdown', { clientX: 100, clientY: 100 });
    ptr('pointerup', { clientX: 100, clientY: 100 }, window);
    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.calls[0][0].id).toBe('A');

    click.mockClear();
    ptr('pointerdown', { clientX: 105, clientY: 100 });
    ptr('pointermove', { clientX: 205, clientY: 150 }, window);
    ptr('pointerup', { clientX: 205, clientY: 150 }, window);
    expect(nodes.get('A')).toMatchObject({ x: 200, y: 150 }); // смещение захвата сохраняется
    expect(move).toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('клик по подписи веса вызывает onEdgeClick', () => {
    const ec = vi.fn(); r.onEdgeClick = ec;
    ptr('pointerdown', { clientX: 200, clientY: 100 });
    ptr('pointerup', { clientX: 200, clientY: 100 }, window);
    expect(ec).toHaveBeenCalledOnce();
    expect(ec.mock.calls[0][0].id).toBe('e1');
  });

  it('клик у ребра в пределах допуска попадает, вдали — нет', () => {
    const ec = vi.fn(); const bg = vi.fn(); r.onEdgeClick = ec; r.onCanvasBackgroundClick = bg;
    ptr('pointerdown', { clientX: 150, clientY: 108 });
    ptr('pointerup', { clientX: 150, clientY: 108 }, window);
    expect(ec).toHaveBeenCalledOnce();
    ptr('pointerdown', { clientX: 150, clientY: 160 });
    ptr('pointerup', { clientX: 150, clientY: 160 }, window);
    expect(bg).toHaveBeenCalledOnce();
  });

  it('isInteractive=false отключает клики', () => {
    r.isInteractive = false;
    const click = vi.fn(); const bg = vi.fn(); r.onNodeClick = click; r.onCanvasBackgroundClick = bg;
    ptr('pointerdown', { clientX: 100, clientY: 100 });
    ptr('pointerup', { clientX: 100, clientY: 100 }, window);
    ptr('pointerdown', { clientX: 500, clientY: 400 });
    ptr('pointerup', { clientX: 500, clientY: 400 }, window);
    expect(click).not.toHaveBeenCalled();
    expect(bg).not.toHaveBeenCalled();
  });

  it('наведение обновляет hover и курсор', () => {
    ptr('pointermove', { clientX: 100, clientY: 100 }, window);
    expect(r.hoveredNodeId).toBe('A');
    expect(canvas.style.cursor).toBe('pointer');
    ptr('pointermove', { clientX: 200, clientY: 100 }, window);
    expect(r.hoveredNodeId).toBeNull();
    expect(r.hoveredEdgeId).toBe('e1');
    ptr('pointermove', { clientX: 600, clientY: 500 }, window);
    expect(r.hoveredEdgeId).toBeNull();
    expect(canvas.style.cursor).toBe('default');
  });

  it('правая кнопка мыши игнорируется', () => {
    ptr('pointerdown', { clientX: 500, clientY: 400, button: 2 });
    ptr('pointermove', { clientX: 540, clientY: 430 }, window);
    expect(r.pan).toEqual({ x: 0, y: 0 });
  });

  it('щипок двумя пальцами масштабирует, затем остаётся панорамирование', () => {
    ptr('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 300 });
    ptr('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 400, clientY: 300 });
    ptr('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 500, clientY: 300 }, window);
    expect(r.zoom).toBeCloseTo(2);
    ptr('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 500, clientY: 300 }, window);
    const bg = vi.fn(); r.onCanvasBackgroundClick = bg;
    ptr('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 300 }, window);
    expect(bg).not.toHaveBeenCalled(); // жест не считается кликом
  });

  it('pointercancel сбрасывает перетаскивание', () => {
    ptr('pointerdown', { clientX: 100, clientY: 100 });
    ptr('pointercancel', {}, window);
    ptr('pointermove', { clientX: 300, clientY: 300 }, window);
    expect(nodes.get('A')).toMatchObject({ x: 100, y: 100 });
  });

  it('destroy снимает обработчики', () => {
    r.destroy();
    const bg = vi.fn(); r.onCanvasBackgroundClick = bg;
    ptr('pointerdown', { clientX: 500, clientY: 400 });
    ptr('pointerup', { clientX: 500, clientY: 400 }, window);
    expect(bg).not.toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe('GraphRenderer: отрисовка', () => {
  const nodes = () => nodesOf(['A', 100, 100], ['B', 300, 100], ['C', 200, 250]);
  const edges = () => [edge('e1', 'A', 'B', 2), edge('e2', 'B', 'C', 3.5)];
  const texts = () => calls.fillText?.mock.calls.map(c => String(c[0])) ?? [];

  it('render рисует подписи узлов и весов рёбер', () => {
    r.setGraph(nodes(), edges());
    now += 500; // новые узлы появляются плавно: в нулевой момент alpha = 0
    r.render();
    expect(texts()).toEqual(expect.arrayContaining(['A', 'B', 'C', '2', '3.5']));
    expect(calls.clearRect).toHaveBeenCalled();
    expect(calls.arc).toHaveBeenCalled();
  });

  it('направленный граф рисует стрелки, ненаправленный — нет', () => {
    r.setGraph(nodes(), edges(), false);
    const undirectedFills = calls.fill?.mock.calls.length ?? 0;
    r.setGraph(nodes(), edges(), true);
    expect(calls.fill.mock.calls.length).toBeGreaterThan(undirectedFills);
  });

  it('состояние визуализации: расстояния, путь, посещённые', () => {
    r.setGraph(nodes(), edges());
    const step: AlgorithmStep = {
      stepNumber: 2, activeNodeId: 'B', visitedNodes: ['A', 'B'],
      distances: { A: 0, B: 2 }, status: 'PROCESSING', path: ['A', 'B', 'C'],
    };
    r.setVisualizationState({ ...step, distances: { A: 0, B: 2, C: Infinity } });
    now += 500;
    calls.fillText?.mockClear();
    r.render();
    expect(texts()).toEqual(expect.arrayContaining(['0.0', '2.0', '∞']));
    r.setVisualizationState(null);
    expect(() => r.render()).not.toThrow();
  });

  it('путь учитывает направление ребра', () => {
    const step = (path: string[]): AlgorithmStep =>
      ({ stepNumber: 1, activeNodeId: null, visitedNodes: [], distances: {}, status: 'COMPLETED', path });
    const pathEdges = (directed: boolean, path: string[]) => {
      r.setGraph(nodesOf(['A', 0, 0], ['B', 100, 0]), [edge('e', 'A', 'B')], directed);
      r.setVisualizationState(step(path));
      return (r as unknown as { getPathEdges(): Set<string> }).getPathEdges();
    };
    expect(pathEdges(false, ['B', 'A']).has('e')).toBe(true);
    expect(pathEdges(true, ['B', 'A']).has('e')).toBe(false);
    expect(pathEdges(true, ['A', 'B']).has('e')).toBe(true);
    expect(pathEdges(true, ['A']).size).toBe(0);
  });

  it('start/target/waypoints/selected рисуются без ошибок', () => {
    r.setGraph(nodes(), edges());
    r.setStartAndTarget('A', 'C');
    r.setWaypoints(['B']);
    now += 500;
    r.hoveredNodeId = 'B';
    r.hoveredEdgeId = 'e1';
    expect(() => r.render(new Set(['A']))).not.toThrow();
    now += 1000;
    expect(() => r.setStartAndTarget(null, null)).not.toThrow();
    expect(() => r.render()).not.toThrow();
  });

  it('рёбра к несуществующим узлам пропускаются', () => {
    expect(() => r.setGraph(nodesOf(['A', 0, 0]), [edge('x', 'A', 'ZZ')])).not.toThrow();
  });
});

describe('GraphRenderer: анимации', () => {
  it('новые узлы анимируются, затем цикл останавливается', () => {
    r.setGraph(nodesOf(['A', 100, 100]), []);
    expect(rafQueue).toHaveLength(1);
    flushFrames(100);
    expect(rafQueue).toHaveLength(1); // ещё идёт (220мс)
    flushFrames(200);
    expect(rafQueue).toHaveLength(0); // завершилась
  });

  it('уходящие узлы и рёбра убираются по истечении времени', () => {
    const exitingNodes = new Map([['A', { id: 'A', label: 'A', x: 0, y: 0, exitingSince: now }]]);
    const exitingEdges = new Map([['e', { ...edge('e', 'A', 'B'), exitingSince: now }]]);
    r.setGraph(new Map(), [], false, exitingNodes, exitingEdges);
    flushFrames(50);
    expect(exitingNodes.size).toBe(1);
    expect(rafQueue).toHaveLength(1);
    flushFrames(200);
    expect(exitingNodes.size).toBe(0);
    expect(exitingEdges.size).toBe(0);
    expect(rafQueue).toHaveLength(0);
  });

  it('смена темы сбрасывает палитру и перерисовывает', () => {
    let handler: () => void = () => {};
    vi.stubGlobal('matchMedia', () => ({ addEventListener: (_: string, h: () => void) => { handler = h; }, removeEventListener: vi.fn() }));
    const r2 = new GraphRenderer(canvas);
    calls.clearRect?.mockClear();
    handler();
    expect(calls.clearRect).toHaveBeenCalled();
    r2.destroy();
  });
});
