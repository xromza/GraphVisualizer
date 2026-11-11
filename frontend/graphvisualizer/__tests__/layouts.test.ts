import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@/lib/api';
import { applyCircularLayout, applyGridLayout, applyHierarchicalLayout } from '@/lib/layouts';

const mk = (ids: string[]) =>
  new Map<string, Node>(ids.map(id => [id, { id, label: id, x: 0, y: 0 }]));
const edge = (s: string, t: string): Edge => ({ id: `${s}${t}`, sourceId: s, targetId: t, weight: 1 });
const center = { x: 500, y: 400 };

describe('applyCircularLayout', () => {
  it('places nodes on a circle of the given radius around the center', () => {
    const nodes = mk(['A', 'B', 'C', 'D']);
    applyCircularLayout(nodes, center, 100);
    for (const n of nodes.values()) {
      expect(Math.hypot(n.x - center.x, n.y - center.y)).toBeCloseTo(100);
    }
    expect(nodes.get('A')).toMatchObject({ x: 600, y: 400 });
  });

  it('handles an empty graph', () => {
    expect(() => applyCircularLayout(new Map(), center)).not.toThrow();
  });
});

describe('applyGridLayout', () => {
  it('arranges 4 nodes in a centered 2x2 grid', () => {
    const nodes = mk(['A', 'B', 'C', 'D']);
    applyGridLayout(nodes, center, 100);
    expect(nodes.get('A')).toMatchObject({ x: 450, y: 350 });
    expect(nodes.get('B')).toMatchObject({ x: 550, y: 350 });
    expect(nodes.get('C')).toMatchObject({ x: 450, y: 450 });
    expect(nodes.get('D')).toMatchObject({ x: 550, y: 450 });
  });

  it('wraps rows by ceil(sqrt(n)) columns', () => {
    const nodes = mk(['A', 'B', 'C', 'D', 'E']);
    applyGridLayout(nodes, center, 100);
    expect(nodes.get('D')!.y).toBe(nodes.get('E')!.y);
    expect(nodes.get('A')!.x).toBe(nodes.get('D')!.x);
  });

  it('handles an empty graph', () => {
    expect(() => applyGridLayout(new Map(), center)).not.toThrow();
  });
});

describe('applyHierarchicalLayout', () => {
  it('layers nodes by BFS distance from the start node', () => {
    const nodes = mk(['A', 'B', 'C', 'D']);
    applyHierarchicalLayout(nodes, [edge('A', 'B'), edge('A', 'C'), edge('B', 'D')], 'A', center, 100, 100);
    const y = (id: string) => nodes.get(id)!.y;
    expect(y('B')).toBe(y('A') + 100);
    expect(y('C')).toBe(y('A') + 100);
    expect(y('D')).toBe(y('A') + 200);
    expect(nodes.get('B')!.x).not.toBe(nodes.get('C')!.x);
  });

  it('treats edges as undirected', () => {
    const nodes = mk(['A', 'B']);
    applyHierarchicalLayout(nodes, [edge('B', 'A')], 'A', center, 100, 100);
    expect(nodes.get('B')!.y).toBeGreaterThan(nodes.get('A')!.y);
  });

  it('falls back to the first node when start is null/unknown', () => {
    const nodes = mk(['A', 'B']);
    applyHierarchicalLayout(nodes, [edge('A', 'B')], 'ZZZ', center, 100, 100);
    expect(nodes.get('A')!.y).toBeLessThan(nodes.get('B')!.y);
  });

  it('puts isolated nodes on level 0', () => {
    const nodes = mk(['A', 'B', 'X']);
    applyHierarchicalLayout(nodes, [edge('A', 'B')], 'A', center, 100, 100);
    expect(nodes.get('X')!.y).toBe(nodes.get('A')!.y);
  });

  it('ignores edges that reference missing nodes', () => {
    const nodes = mk(['A']);
    expect(() => applyHierarchicalLayout(nodes, [edge('A', 'Q')], 'A', center)).not.toThrow();
  });

  it('handles an empty graph', () => {
    expect(() => applyHierarchicalLayout(new Map(), [], null, center)).not.toThrow();
  });
});
