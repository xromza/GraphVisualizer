import type { Node, Edge } from './api';
import { getNextNodeLabel } from './graph-renderer';

export class GraphBuilder {
  nodes: Map<string, Node> = new Map();
  edges: Edge[] = [];
  private nextNodeId = 1;
  private nextEdgeId = 1;


  addNode(x: number, y: number, customLabel?: string): Node {
    const existingLabels = Array.from(this.nodes.values()).map(n => n.label);

    const label = customLabel || getNextNodeLabel(existingLabels);
    const id = label; // или уникальный id, если требуется

    const node: Node = { id, label, x, y };
    this.nodes.set(id, node);
    return node;
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.edges = this.edges.filter(
      e => e.sourceId !== nodeId && e.targetId !== nodeId
    );
  }

  addEdge(sourceId: string, targetId: string, weight: number = 1): Edge | null {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return null;
    }

    const edge: Edge = {
      id: `edge-${this.nextEdgeId++}`,
      sourceId,
      targetId,
      weight,
    };
    this.edges.push(edge);
    return edge;
  }

  removeEdge(edgeId: string): void {
    this.edges = this.edges.filter(e => e.id !== edgeId);
  }

  updateNodePosition(nodeId: string, x: number, y: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.set(nodeId, { ...node, x, y });
    }
  }

  updateEdgeWeight(edgeId: string, weight: number): void {
    const edge = this.edges.find(e => e.id === edgeId);
    if (edge) {
      edge.weight = weight;
    }
  }

  getNodesAsRecord(): Record<string, Node> {
    return Object.fromEntries(this.nodes);
  }

  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.nextNodeId = 1;
    this.nextEdgeId = 1;
  }

  findNodeAt(x: number, y: number, radius: number = 25): Node | null {
    for (const node of this.nodes.values()) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        return node;
      }
    }
    return null;
  }
}
