import { describe, it, expect, beforeEach } from 'vitest';
import { GraphBuilder } from '@/lib/graph-builder';
import { getNextNodeLabel } from '@/lib/graph-renderer';

describe('getNextNodeLabel', () => {
  it('starts with A', () => expect(getNextNodeLabel([])).toBe('A'));
  it('skips used labels', () => expect(getNextNodeLabel(['A', 'B'])).toBe('C'));
  it('fills gaps', () => expect(getNextNodeLabel(['A', 'C'])).toBe('B'));
  it('wraps after Z with a cycle suffix', () => {
    const all = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    expect(getNextNodeLabel(all)).toBe('A1');
  });
});

describe('GraphBuilder', () => {
  let g: GraphBuilder;
  beforeEach(() => { g = new GraphBuilder(); });

  it('adds nodes with auto labels and ids equal to labels', () => {
    const a = g.addNode(1, 2);
    const b = g.addNode(3, 4);
    expect(a).toEqual({ id: 'A', label: 'A', x: 1, y: 2 });
    expect(b.id).toBe('B');
    expect(g.nodes.size).toBe(2);
  });

  it('supports custom labels', () => {
    expect(g.addNode(0, 0, 'X').id).toBe('X');
  });

  it('replaces the nodes map on add (new reference)', () => {
    const before = g.nodes;
    g.addNode(0, 0);
    expect(g.nodes).not.toBe(before);
  });

  it('adds edges with default weight and unique ids', () => {
    g.addNode(0, 0); g.addNode(1, 1);
    const e1 = g.addEdge('A', 'B')!;
    const e2 = g.addEdge('B', 'A', 5)!;
    expect(e1.weight).toBe(1);
    expect(e2.weight).toBe(5);
    expect(e1.id).not.toBe(e2.id);
    expect(g.edges).toHaveLength(2);
  });

  it('rejects edges to unknown nodes', () => {
    g.addNode(0, 0);
    expect(g.addEdge('A', 'Z')).toBeNull();
    expect(g.addEdge('Z', 'A')).toBeNull();
    expect(g.edges).toHaveLength(0);
  });

  it('removeNode drops incident edges and records them as exiting', () => {
    g.addNode(0, 0); g.addNode(1, 1); g.addNode(2, 2);
    const ab = g.addEdge('A', 'B')!;
    const bc = g.addEdge('B', 'C')!;
    const ac = g.addEdge('A', 'C')!;
    g.removeNode('B');
    expect(g.nodes.has('B')).toBe(false);
    expect(g.edges.map(e => e.id)).toEqual([ac.id]);
    expect(g.exitingNodes.has('B')).toBe(true);
    expect([...g.exitingEdges.keys()].sort()).toEqual([ab.id, bc.id].sort());
  });

  it('removeNode on unknown id is a no-op', () => {
    g.addNode(0, 0);
    g.removeNode('nope');
    expect(g.nodes.size).toBe(1);
    expect(g.exitingNodes.size).toBe(0);
  });

  it('removeEdge removes and marks exiting', () => {
    g.addNode(0, 0); g.addNode(1, 1);
    const e = g.addEdge('A', 'B')!;
    g.removeEdge(e.id);
    expect(g.edges).toHaveLength(0);
    expect(g.exitingEdges.has(e.id)).toBe(true);
  });

  it('updateNodePosition / updateEdgeWeight mutate in place', () => {
    g.addNode(0, 0); g.addNode(1, 1);
    const e = g.addEdge('A', 'B')!;
    g.updateNodePosition('A', 10, 20);
    g.updateEdgeWeight(e.id, 9);
    expect(g.nodes.get('A')).toMatchObject({ x: 10, y: 20 });
    expect(g.edges[0].weight).toBe(9);
    g.updateNodePosition('missing', 1, 1); // не падает
  });

  it('getNodesAsRecord returns an id-keyed object', () => {
    g.addNode(0, 0); g.addNode(1, 1);
    expect(Object.keys(g.getNodesAsRecord())).toEqual(['A', 'B']);
  });

  it('findNodeAt respects radius', () => {
    g.addNode(100, 100);
    expect(g.findNodeAt(110, 100)?.id).toBe('A');
    expect(g.findNodeAt(200, 200)).toBeNull();
    expect(g.findNodeAt(130, 100, 40)?.id).toBe('A');
    expect(g.findNodeAt(130, 100)).toBeNull();
  });

  it('clear resets everything including id counters', () => {
    g.addNode(0, 0); g.addNode(1, 1);
    g.addEdge('A', 'B');
    g.removeNode('A');
    g.clear();
    expect(g.nodes.size).toBe(0);
    expect(g.edges).toHaveLength(0);
    expect(g.exitingNodes.size).toBe(0);
    expect(g.exitingEdges.size).toBe(0);
    g.addNode(0, 0); g.addNode(1, 1);
    expect(g.addEdge('A', 'B')!.id).toBe('edge-1');
  });
});
