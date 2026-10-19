import type { Node, Edge, AlgorithmStep } from './api';

interface VisualizationState {
  visitedNodes: Set<string>;
  activeNode: string | null;
  distances: Record<string, number>;
  path: string[];
}

export function getNextNodeLabel(existingLabels: Iterable<string>): string {
  const used = new Set(existingLabels);
  let index = 0;

  while (true) {
    const letter = String.fromCharCode(65 + (index % 26));
    const cycle = Math.floor(index / 26);
    const label = cycle === 0 ? letter : `${letter}${cycle}`;

    if (!used.has(label)) {
      return label;
    }
    index++;
  }
}

export class GraphRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes: Map<string, Node>;
  private edges: Edge[];
  private vizState: VisualizationState | null = null;
  private directed: boolean = false;
  public isInteractive: boolean = true;
  private lastSelectedNodes: Set<string> = new Set();

  public startNodeId: string | null = null;
  public targetNodeId: string | null = null;

  public hoveredNodeId: string | null = null;
  public hoveredEdgeId: string | null = null;

  public pan: { x: number; y: number } = { x: 0, y: 0 };
  public zoom: number = 1;
  private isPanning: boolean = false;
  private panStart: { x: number; y: number } = { x: 0, y: 0 };
  private hasPanned: boolean = false;

  private draggedNode: Node | null = null;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  private dragStartScreenPos: { x: number; y: number } = { x: 0, y: 0 };
  private hasDraggedNode: boolean = false;

  public onNodeMove?: (node: Node) => void;
  public onNodeClick?: (node: Node, screenPos: { x: number; y: number }) => void;
  public onEdgeClick?: (edge: Edge, screenPos: { x: number; y: number }) => void;
  public onCanvasBackgroundClick?: () => void;

  private readonly NODE_RADIUS = 25;

  // ⭐️ ЧЕТКАЯ КОНТРАСТНАЯ ПАЛИТРА
  private readonly DEFAULT_NODE_BG = '#1E293B';      // Непосещенный (темный сланец)
  private readonly DEFAULT_NODE_BORDER = '#475569';

  private readonly VISITED_NODE_BG = '#2E1065';      // Посещенный (глубокий индиго/пурпур)
  private readonly VISITED_NODE_BORDER = '#A855F7';  // Фиолетовый контур

  private readonly PATH_NODE_BG = '#064E3B';         // Узел пути (глубокий изумрудный)
  private readonly PATH_NODE_BORDER = '#34D399';     // Неоново-зеленый контур
  private readonly PATH_EDGE_COLOR = '#10B981';      // Ребро пути (ярко-зеленое)

  private readonly ACTIVE_NODE_BG = '#D97706';       // Активный узел (янтарный)
  private readonly ACTIVE_NODE_BORDER = '#FDE047';

  private readonly HOVER_COLOR = '#38BDF8';          // Подсветка курсора (cyan)
  private readonly DEFAULT_EDGE_COLOR = '#334155';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.nodes = new Map();
    this.edges = [];
    this.setupCanvas();
    this.initEvents();
  }

  private setupCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.pan.x) / this.zoom,
      y: (screenY - this.pan.y) / this.zoom,
    };
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.zoom + this.pan.x,
      y: worldY * this.zoom + this.pan.y,
    };
  }

  public setStartAndTarget(startId: string | null, targetId: string | null): void {
    this.startNodeId = startId;
    this.targetNodeId = targetId;
  }

  private initEvents(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  public destroy(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  private getMousePos(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;

    const screen = this.getMousePos(e);
    const world = this.screenToWorld(screen.x, screen.y);
    const clickedNode = this.getNodeAt(world.x, world.y);

    if (clickedNode && this.isInteractive && e.button === 0) {
      this.draggedNode = clickedNode;
      this.dragStartScreenPos = screen;
      this.hasDraggedNode = false;
      this.dragOffset = { x: world.x - clickedNode.x, y: world.y - clickedNode.y };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    this.isPanning = true;
    this.panStart = { x: screen.x - this.pan.x, y: screen.y - this.pan.y };
    this.hasPanned = false;
  };

  private handleMouseMove = (e: MouseEvent): void => {
    const screen = this.getMousePos(e);
    const world = this.screenToWorld(screen.x, screen.y);

    if (this.draggedNode) {
      const dx = screen.x - this.dragStartScreenPos.x;
      const dy = screen.y - this.dragStartScreenPos.y;

      if (!this.hasDraggedNode && Math.hypot(dx, dy) > 3) {
        this.hasDraggedNode = true;
      }

      if (this.hasDraggedNode) {
        this.draggedNode.x = world.x - this.dragOffset.x;
        this.draggedNode.y = world.y - this.dragOffset.y;
        this.render();
        this.onNodeMove?.(this.draggedNode);
      }
      return;
    }

    if (this.isPanning) {
      const dx = screen.x - (this.panStart.x + this.pan.x);
      const dy = screen.y - (this.panStart.y + this.pan.y);

      if (Math.hypot(dx, dy) > 3) {
        this.hasPanned = true;
      }

      this.pan.x = screen.x - this.panStart.x;
      this.pan.y = screen.y - this.panStart.y;
      this.render();
      return;
    }

    const prevHoverNode = this.hoveredNodeId;
    const prevHoverEdge = this.hoveredEdgeId;

    const hoveredNode = this.getNodeAt(world.x, world.y);
    const hoveredEdge = !hoveredNode ? this.getEdgeAt(world.x, world.y) : null;

    this.hoveredNodeId = hoveredNode ? hoveredNode.id : null;
    this.hoveredEdgeId = hoveredEdge ? hoveredEdge.id : null;

    if (this.hoveredNodeId !== prevHoverNode || this.hoveredEdgeId !== prevHoverEdge) {
      this.render();
    }

    if (this.isInteractive) {
      if (this.hoveredNodeId || this.hoveredEdgeId) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = 'default';
      }
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    const screen = this.getMousePos(e);
    const world = this.screenToWorld(screen.x, screen.y);

    if (this.draggedNode) {
      if (!this.hasDraggedNode && this.isInteractive) {
        this.onNodeClick?.(this.draggedNode, screen);
      }
      this.draggedNode = null;
      this.hasDraggedNode = false;
      this.canvas.style.cursor = this.getNodeAt(world.x, world.y) ? 'pointer' : 'default';
      return;
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'default';

      if (!this.hasPanned && this.isInteractive) {
        const clickedEdge = this.getEdgeAt(world.x, world.y);
        if (clickedEdge) {
          this.onEdgeClick?.(clickedEdge, screen);
        } else {
          this.onCanvasBackgroundClick?.();
        }
      }
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const screen = this.getMousePos(e);
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(Math.max(this.zoom * zoomFactor, 0.2), 4.0);

    this.pan.x = screen.x - (screen.x - this.pan.x) * (newZoom / this.zoom);
    this.pan.y = screen.y - (screen.y - this.pan.y) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.render();
  };

  private getNodeAt(worldX: number, worldY: number): Node | null {
    for (const node of this.nodes.values()) {
      if (Math.hypot(worldX - node.x, worldY - node.y) <= this.NODE_RADIUS) {
        return node;
      }
    }
    return null;
  }

  private getEdgeAt(worldX: number, worldY: number): Edge | null {
    for (const edge of this.edges) {
      const source = this.nodes.get(edge.sourceId);
      const target = this.nodes.get(edge.targetId);
      if (!source || !target) continue;

      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const textMetrics = this.ctx.measureText(edge.weight.toString());
      const boxW = textMetrics.width + 16;
      const boxH = 22;

      if (
        worldX >= midX - boxW / 2 &&
        worldX <= midX + boxW / 2 &&
        worldY >= midY - boxH / 2 &&
        worldY <= midY + boxH / 2
      ) {
        return edge;
      }

      const hitTolerance = Math.max(14 / this.zoom, 10);
      if (this.distToSegment(worldX, worldY, source.x, source.y, target.x, target.y) <= hitTolerance) {
        return edge;
      }
    }
    return null;
  }

  private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);

    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  setGraph(nodes: Map<string, Node>, edges: Edge[], directed: boolean = false): void {
    this.nodes = nodes;
    this.edges = edges;
    this.directed = directed;
    this.vizState = null;
  }

  setVisualizationState(step: AlgorithmStep | null): void {
    if (!step) {
      this.vizState = null;
    } else {
      this.vizState = {
        visitedNodes: new Set(step.visitedNodes),
        activeNode: step.activeNodeId,
        distances: step.distances,
        path: step.path,
      };
    }
  }

  render(selectedNodes: Set<string> = this.lastSelectedNodes): void {
    this.lastSelectedNodes = selectedNodes;
    this.clear();

    this.ctx.save();
    this.ctx.translate(this.pan.x, this.pan.y);
    this.ctx.scale(this.zoom, this.zoom);

    this.drawGrid();
    this.drawEdges(selectedNodes);
    this.drawNodes(selectedNodes);

    this.ctx.restore();
  }

  private clear(): void {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const dpr = window.devicePixelRatio || 1;
    this.ctx.scale(dpr, dpr);
    this.ctx.restore();
  }

  private drawGrid(): void {
    const rect = this.canvas.getBoundingClientRect();
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(rect.width, rect.height);

    let step = 28;
    while (step * this.zoom < 16) {
      step *= 2;
    }

    const startX = Math.floor(topLeft.x / step) * step;
    const endX = Math.ceil(bottomRight.x / step) * step;
    const startY = Math.floor(topLeft.y / step) * step;
    const endY = Math.ceil(bottomRight.y / step) * step;

    const dotRadius = 1.2 / this.zoom;

    this.ctx.fillStyle = '#263449';
    this.ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      for (let y = startY; y <= endY; y += step) {
        this.ctx.moveTo(x + dotRadius, y);
        this.ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      }
    }
    this.ctx.fill();
  }

  private drawEdges(selectedNodes: Set<string>): void {
    const pathEdges = this.getPathEdges();

    for (const edge of this.edges) {
      const source = this.nodes.get(edge.sourceId);
      const target = this.nodes.get(edge.targetId);
      if (!source || !target) continue;

      const isPathEdge = pathEdges.has(edge.id);
      const isHovered = edge.id === this.hoveredEdgeId;

      let color = this.DEFAULT_EDGE_COLOR;
      let width = 2;

      if (isPathEdge) {
        color = this.PATH_EDGE_COLOR; // Ярко-зеленая линия пути
        width = 4;
      } else if (isHovered) {
        color = this.HOVER_COLOR;
        width = 3;
      }

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = width;
      this.ctx.beginPath();
      this.ctx.moveTo(source.x, source.y);
      this.ctx.lineTo(target.x, target.y);
      this.ctx.stroke();

      if (this.directed) {
        this.drawArrow(source, target, color);
      }

      this.drawEdgeWeight(source, target, edge.weight, isPathEdge, isHovered);
    }
  }

  private drawArrow(source: Node, target: Node, color: string): void {
    const angle = Math.atan2(target.y - source.y, target.x - source.x);
    const arrowLength = 15;
    const arrowAngle = Math.PI / 6;

    const endX = target.x - Math.cos(angle) * this.NODE_RADIUS;
    const endY = target.y - Math.sin(angle) * this.NODE_RADIUS;

    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX - arrowLength * Math.cos(angle - arrowAngle),
      endY - arrowLength * Math.sin(angle - arrowAngle)
    );
    this.ctx.lineTo(
      endX - arrowLength * Math.cos(angle + arrowAngle),
      endY - arrowLength * Math.sin(angle + arrowAngle)
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawEdgeWeight(
    source: Node,
    target: Node,
    weight: number,
    isPathEdge: boolean,
    isHovered: boolean
  ): void {
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;

    this.ctx.font = '500 12px Rubik, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const text = weight.toString();
    const metrics = this.ctx.measureText(text);
    const padding = 5;

    // Плашка под весом
    if (isPathEdge) {
      this.ctx.fillStyle = '#064E3B';
      this.ctx.strokeStyle = '#34D399';
    } else if (isHovered) {
      this.ctx.fillStyle = '#0369A1';
      this.ctx.strokeStyle = '#38BDF8';
    } else {
      this.ctx.fillStyle = '#0F172A';
      this.ctx.strokeStyle = '#334155';
    }

    this.ctx.lineWidth = 1;

    const boxW = metrics.width + padding * 2;
    const boxH = 18;

    this.ctx.beginPath();
    this.ctx.rect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = isPathEdge ? '#6EE7B7' : '#F8FAFC';
    this.ctx.fillText(text, midX, midY);
  }

  private drawNodes(selectedNodes: Set<string>): void {
    for (const node of this.nodes.values()) {
      const isSelected = selectedNodes.has(node.id);
      const isActive = this.vizState?.activeNode === node.id;
      const isVisited = this.vizState?.visitedNodes.has(node.id) || false;
      const isInPath = this.vizState?.path.includes(node.id) || false;
      const isHovered = this.hoveredNodeId === node.id;

      // ⭐️ Определение цветов узла в зависимости от его роли
      let fillColor = this.DEFAULT_NODE_BG;
      let strokeColor = this.DEFAULT_NODE_BORDER;
      let strokeWidth = 2;

      if (isInPath) {
        // Итоговый путь: глубокий изумрудный + неоново-зеленый контур
        fillColor = this.PATH_NODE_BG;
        strokeColor = this.PATH_NODE_BORDER;
        strokeWidth = 3.5;
      } else if (isActive) {
        // Текущий активный: ярко-янтарный + желтый контур
        fillColor = this.ACTIVE_NODE_BG;
        strokeColor = this.ACTIVE_NODE_BORDER;
        strokeWidth = 3.5;
      } else if (isVisited) {
        // Посещенный: глубокий индиго + мягкий фиолетовый контур (не сливается с зеленым!)
        fillColor = this.VISITED_NODE_BG;
        strokeColor = this.VISITED_NODE_BORDER;
        strokeWidth = 2.5;
      } else if (isSelected) {
        fillColor = '#0369A1';
        strokeColor = '#38BDF8';
        strokeWidth = 3;
      }

      if (isHovered && !isInPath && !isActive) {
        strokeColor = this.HOVER_COLOR;
        strokeWidth = 3;
      }

      // Отрисовка круга
      this.ctx.fillStyle = fillColor;
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, this.NODE_RADIUS, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = strokeWidth;
      this.ctx.stroke();

      // Текст названия вершины
      this.ctx.fillStyle = isInPath ? '#A7F3D0' : '#F8FAFC';
      this.ctx.font = '600 13px Rubik, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(node.label, node.x, node.y);

      // Расстояние (снизу)
      if (this.vizState && this.vizState.distances[node.id] !== undefined) {
        const dist = this.vizState.distances[node.id];
        const distText = dist === Infinity ? '∞' : dist.toFixed(1);

        this.ctx.font = '500 11px Rubik, sans-serif';
        this.ctx.fillStyle = isInPath ? '#34D399' : isVisited ? '#C084FC' : '#94A3B8';
        this.ctx.fillText(distText, node.x, node.y + this.NODE_RADIUS + 12);
      }

      // Бейджи "Начало" и "Конец" (сверху узла)
      const isStart = node.id === this.startNodeId;
      const isTarget = node.id === this.targetNodeId;

      if (isStart || isTarget) {
        const badgeText = isStart ? 'СТАРТ' : 'ЦЕЛЬ';
        const badgeBg = isStart ? '#059669' : '#E11D48';
        const badgeY = node.y - this.NODE_RADIUS - 14;

        this.ctx.font = '700 9px Rubik, sans-serif';
        const textMetrics = this.ctx.measureText(badgeText);
        const badgeW = textMetrics.width + 12;
        const badgeH = 16;

        this.ctx.fillStyle = badgeBg;
        this.ctx.beginPath();
        const radius = 5;
        const x = node.x - badgeW / 2;
        const y = badgeY - badgeH / 2;
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + badgeW - radius, y);
        this.ctx.quadraticCurveTo(x + badgeW, y, x + badgeW, y + radius);
        this.ctx.lineTo(x + badgeW, y + badgeH - radius);
        this.ctx.quadraticCurveTo(x + badgeW, y + badgeH, x + badgeW - radius, y + badgeH);
        this.ctx.lineTo(x + radius, y + badgeH);
        this.ctx.quadraticCurveTo(x, y + badgeH, x, y + badgeH - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(badgeText, node.x, badgeY);
      }
    }
  }

  // ⭐️ ИСПРАВЛЕНИЕ: поиск ребер пути в обоих направлениях для ненаправленного графа
  private getPathEdges(): Set<string> {
    const pathEdges = new Set<string>();
    if (!this.vizState || !this.vizState.path || this.vizState.path.length < 2) return pathEdges;

    for (let i = 0; i < this.vizState.path.length - 1; i++) {
      const u = this.vizState.path[i];
      const v = this.vizState.path[i + 1];

      // Ищем ребро: если граф ненаправленный, подходит как (u -> v), так и (v -> u)!
      const edge = this.edges.find(e =>
        (e.sourceId === u && e.targetId === v) ||
        (!this.directed && e.sourceId === v && e.targetId === u)
      );

      if (edge) {
        pathEdges.add(edge.id);
      }
    }

    return pathEdges;
  }

  resize(): void {
    this.setupCanvas();
    this.render();
  }
}