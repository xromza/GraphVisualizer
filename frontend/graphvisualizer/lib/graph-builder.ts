import type { Node, Edge } from './api';
import { getNextNodeLabel } from './graph-renderer';

export interface ExitingNode extends Node {
  exitingSince: number;
}

export interface ExitingEdge extends Edge {
  exitingSince: number;
}

export class GraphBuilder {
  nodes: Map<string, Node> = new Map();
  edges: Edge[] = [];
  
  exitingNodes: Map<string, ExitingNode> = new Map();
  exitingEdges: Map<string, ExitingEdge> = new Map();

  private nextNodeId = 1;
  private nextEdgeId = 1;

  addNode(x: number, y: number, customLabel?: string): Node {
    const existingLabels = Array.from(this.nodes.values()).map(n => n.label);
    const label = customLabel || getNextNodeLabel(existingLabels);
    const id = label;

    const node: Node = { id, label, x, y };
    this.nodes = new Map(this.nodes);
    this.nodes.set(id, node);
    return node;
  }

  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.exitingNodes.set(nodeId, { ...node, exitingSince: performance.now() });
      const newNodes = new Map(this.nodes);
      newNodes.delete(nodeId);
      this.nodes = newNodes;
    }

    const connectedEdges = this.edges.filter(
      e => e.sourceId === nodeId || e.targetId === nodeId
    );
    for (const edge of connectedEdges) {
      if (!this.exitingEdges.has(edge.id)) {
        this.exitingEdges.set(edge.id, { ...edge, exitingSince: performance.now() });
      }
    }

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

    this.edges = [...this.edges, edge];
    return edge;
  }

  removeEdge(edgeId: string): void {
    const edge = this.edges.find(e => e.id === edgeId);
    if (edge) {
      this.exitingEdges.set(edgeId, { ...edge, exitingSince: performance.now() });
    }
    this.edges = this.edges.filter(e => e.id !== edgeId);
  }

  updateNodePosition(nodeId: string, x: number, y: number): void {
    const node = this.nodes.get(nodeId);
    if (node && (node.x !== x || node.y !== y)) {
      node.x = x;
      node.y = y;
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
    this.nodes = new Map();
    this.edges = [];
    this.exitingNodes.clear();
    this.exitingEdges.clear();
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