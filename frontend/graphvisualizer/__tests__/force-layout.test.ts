import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Node, Edge } from '@/lib/api';
import { applyForceDirectedLayout } from '@/lib/force-layout';

const mk = (pts: Record<string, [number, number]>) =>
  new Map<string, Node>(Object.entries(pts).map(([id, [x, y]]) => [id, { id, label: id, x, y }]));

// Синхронный requestAnimationFrame: выполняем кадры вручную.
let queue: Map<number, FrameRequestCallback>;
let nextId: number;
const flush = (max = 5000) => {
  for (let i = 0; i < max && queue.size; i++) {
    const [id, cb] = queue.entries().next().value!;
    queue.delete(id);
    cb(0);
  }
};

beforeEach(() => {
  queue = new Map(); nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(nextId, cb); return nextId++; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { queue.delete(id); });
});
afterEach(() => vi.unstubAllGlobals());

describe('applyForceDirectedLayout', () => {
  it('finishes immediately for <2 nodes', () => {
    const onDone = vi.fn();
    applyForceDirectedLayout(mk({ A: [0, 0] }), [], { x: 0, y: 0 }, { onDone });
    expect(onDone).toHaveBeenCalledOnce();
    expect(queue.size).toBe(0);
  });

  it('calls onTick per frame and onDone once at the end', () => {
    const onTick = vi.fn(); const onDone = vi.fn();
    const edges: Edge[] = [{ id: 'e', sourceId: 'A', targetId: 'B', weight: 1 }];
    applyForceDirectedLayout(mk({ A: [0, 0], B: [300, 0] }), edges, { x: 150, y: 0 }, { onTick, onDone });
    flush();
    expect(onTick).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('respects the iterations cap', () => {
    const onTick = vi.fn();
    applyForceDirectedLayout(mk({ A: [0, 0], B: [50, 0] }), [], { x: 0, y: 0 }, { iterations: 3, onTick });
    flush();
    expect(onTick.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('pulls a far-apart connected pair toward the ideal edge length', () => {
    const nodes = mk({ A: [0, 0], B: [600, 0] });
    const edges: Edge[] = [{ id: 'e', sourceId: 'A', targetId: 'B', weight: 1 }];
    applyForceDirectedLayout(nodes, edges, { x: 300, y: 0 });
    flush();
    const d = Math.hypot(nodes.get('A')!.x - nodes.get('B')!.x, nodes.get('A')!.y - nodes.get('B')!.y);
    expect(d).toBeLessThan(300);
    expect(d).toBeGreaterThan(30);
  });

  it('pushes apart unconnected close nodes', () => {
    const nodes = mk({ A: [100, 0], B: [130, 0] });
    applyForceDirectedLayout(nodes, [], { x: 115, y: 0 });
    flush();
    expect(Math.abs(nodes.get('A')!.x - nodes.get('B')!.x)).toBeGreaterThan(30);
  });

  it('separates overlapping nodes (no NaN)', () => {
    const nodes = mk({ A: [10, 10], B: [10, 10] });
    applyForceDirectedLayout(nodes, [], { x: 10, y: 10 });
    flush();
    for (const n of nodes.values()) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(nodes.get('A')!.x === nodes.get('B')!.x && nodes.get('A')!.y === nodes.get('B')!.y).toBe(false);
  });

  it('ignores edges with missing endpoints and self-loops', () => {
    const edges: Edge[] = [
      { id: '1', sourceId: 'A', targetId: 'Q', weight: 1 },
      { id: '2', sourceId: 'A', targetId: 'A', weight: 1 },
    ];
    expect(() => {
      applyForceDirectedLayout(mk({ A: [0, 0], B: [100, 0] }), edges, { x: 50, y: 0 });
      flush();
    }).not.toThrow();
  });

  it('cancel function stops the animation', () => {
    const onTick = vi.fn();
    const cancel = applyForceDirectedLayout(mk({ A: [0, 0], B: [50, 0] }), [], { x: 0, y: 0 }, { onTick });
    cancel();
    flush();
    expect(onTick).not.toHaveBeenCalled();
  });
});
