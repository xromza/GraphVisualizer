import type { Node, Edge, AlgorithmStep } from './api';
import type { ExitingNode, ExitingEdge } from './graph-builder';

interface VisualizationState {
  visitedNodes: Set<string>;
  activeNode: string | null;
  distances: Record<string, number>;
  path: string[];
}

interface EntryAnimation {
  startedAt: number;
  duration: number;
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
  private exitingNodes: Map<string, ExitingNode> = new Map();
  private exitingEdges: Map<string, ExitingEdge> = new Map();
  private startBadgeAnim: EntryAnimation | null = null;
  private targetBadgeAnim: EntryAnimation | null = null;
  private readonly BADGE_ANIMATION_MS = 250;

  private prevStartNodeId: string | null = null;
  private prevTargetNodeId: string | null = null;
  private vizState: VisualizationState | null = null;
  private directed: boolean = false;
  public isInteractive: boolean = true;
  private lastSelectedNodes: Set<string> = new Set();

  private nodeAnimations = new Map<string, EntryAnimation>();
  private edgeAnimations = new Map<string, EntryAnimation>();
  private animationFrameId: number | null = null;
  private readonly NODE_ANIMATION_MS = 220;
  private readonly EDGE_ANIMATION_MS = 180;
  private readonly EXIT_ANIMATION_MS = 160;

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

  private readonly FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

  /** Цвета берутся из тех же CSS-переменных, что и интерфейс, поэтому следуют светлой/тёмной теме. */
  private palette = new Map<string, string>();
  private readonly colorScheme = window.matchMedia('(prefers-color-scheme: light)');
  private readonly handleSchemeChange = () => {
    this.palette.clear();
    this.render();
  };

  private color(name: string, alpha = 1): string {
    let rgb = this.palette.get(name);
    if (rgb === undefined) {
      rgb = getComputedStyle(this.canvas).getPropertyValue(`--${name}`).trim() || '128 128 128';
      this.palette.set(name, rgb);
    }
    return `rgb(${rgb} / ${alpha})`;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.nodes = new Map();
    this.edges = [];
    this.setupCanvas();
    this.initEvents();
    this.colorScheme.addEventListener('change', this.handleSchemeChange);
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

private waypointIds: string[] = [];

  public setWaypoints(ids: string[]): void {
    this.waypointIds = ids;
  }

public setStartAndTarget(startId: string | null, targetId: string | null): void {
    const now = performance.now();
    if (this.startNodeId !== startId) {
      this.startBadgeAnim = { startedAt: now, duration: this.BADGE_ANIMATION_MS };
    }
    if (this.targetNodeId !== targetId) {
      this.targetBadgeAnim = { startedAt: now, duration: this.BADGE_ANIMATION_MS };
    }
    this.startNodeId = startId;
    this.targetNodeId = targetId;
  }

  private initEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handleMouseDown);
    window.addEventListener('pointermove', this.handleMouseMove);
    window.addEventListener('pointerup', this.handleMouseUp);
    window.addEventListener('pointercancel', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  public destroy(): void {
    this.colorScheme.removeEventListener('change', this.handleSchemeChange);
    this.canvas.removeEventListener('pointerdown', this.handleMouseDown);
    window.removeEventListener('pointermove', this.handleMouseMove);
    window.removeEventListener('pointerup', this.handleMouseUp);
    window.removeEventListener('pointercancel', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.nodeAnimations.clear();
    this.edgeAnimations.clear();
  }

  private getMousePos(e: MouseEvent | PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  /** Активные указатели: два пальца — щипок для масштабирования и перемещения. */
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number; anchor: { x: number; y: number } } | null = null;

  private pointerCenter(): { x: number; y: number; dist: number } {
    const [a, b] = Array.from(this.pointers.values());
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }

  private handleMouseDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

    const screen = this.getMousePos(e);
    this.pointers.set(e.pointerId, screen);

    if (this.pointers.size === 2) {
      // Второй палец: отменяем перетаскивание/панорамирование и начинаем щипок.
      this.draggedNode = null;
      this.hasDraggedNode = false;
      this.isPanning = false;
      const c = this.pointerCenter();
      this.pinch = { dist: c.dist, zoom: this.zoom, anchor: this.screenToWorld(c.x, c.y) };
      return;
    }
    if (this.pointers.size > 2) return;

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

  private handleMouseMove = (e: PointerEvent): void => {
    const screen = this.getMousePos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);

    if (this.pinch && this.pointers.size === 2) {
      const c = this.pointerCenter();
      this.zoom = Math.min(Math.max(this.pinch.zoom * (c.dist / this.pinch.dist), 0.2), 4.0);
      this.pan.x = c.x - this.pinch.anchor.x * this.zoom;
      this.pan.y = c.y - this.pinch.anchor.y * this.zoom;
      this.render();
      return;
    }

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

  private handleMouseUp = (e: PointerEvent): void => {
    const screen = this.getMousePos(e);
    const world = this.screenToWorld(screen.x, screen.y);

    if (!this.pointers.delete(e.pointerId)) return;

    if (this.pinch) {
      this.pinch = null;
      // Остался один палец: продолжаем панорамирование, но не считаем жест кликом.
      const rest = this.pointers.values().next().value;
      if (rest) {
        this.isPanning = true;
        this.hasPanned = true;
        this.panStart = { x: rest.x - this.pan.x, y: rest.y - this.pan.y };
      }
      return;
    }
    if (e.type === 'pointercancel') {
      this.draggedNode = null;
      this.isPanning = false;
      return;
    }

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

  public setGraph(
    nodes: Map<string, Node>,
    edges: Edge[],
    directed: boolean = false,
    exitingNodes: Map<string, ExitingNode> = new Map(),
    exitingEdges: Map<string, ExitingEdge> = new Map()
  ): void {
    const now = performance.now();
    const previousNodeIds = new Set(this.nodes.keys());
    const previousEdgeIds = new Set(this.edges.map((edge) => edge.id));
    const nextNodeIds = new Set(nodes.keys());
    const nextEdgeIds = new Set(edges.map((edge) => edge.id));

    this.nodes = nodes;
    this.edges = edges;
    this.exitingNodes = exitingNodes;
    this.exitingEdges = exitingEdges;
    this.directed = directed;
    this.vizState = null;

    for (const id of nextNodeIds) {
      if (!previousNodeIds.has(id) && !this.nodeAnimations.has(id)) {
        this.nodeAnimations.set(id, {
          startedAt: now,
          duration: this.NODE_ANIMATION_MS,
        });
      }
    }
    for (const id of nextEdgeIds) {
      if (!previousEdgeIds.has(id) && !this.edgeAnimations.has(id)) {
        this.edgeAnimations.set(id, {
          startedAt: now,
          duration: this.EDGE_ANIMATION_MS,
        });
      }
    }

    this.render();
    if (this.nodeAnimations.size > 0 || this.edgeAnimations.size > 0 || this.exitingNodes.size > 0 || this.exitingEdges.size > 0) {
      this.startAnimationLoop();
    }
  }

  private startAnimationLoop(): void {
    if (this.animationFrameId !== null && (this.exitingNodes.size > 0 || this.exitingEdges.size > 0)) {
      return;
    }
    if (this.animationFrameId !== null) return;

    const tick = (now: number) => {
      this.animationFrameId = null;

      for (const [id, anim] of this.nodeAnimations) {
        if (now - anim.startedAt >= anim.duration) {
          this.nodeAnimations.delete(id);
        }
      }
      for (const [id, anim] of this.edgeAnimations) {
        if (now - anim.startedAt >= anim.duration) {
          this.edgeAnimations.delete(id);
        }
      }

      for (const [id, node] of this.exitingNodes) {
        if (now - node.exitingSince >= this.EXIT_ANIMATION_MS) {
          this.exitingNodes.delete(id);
        }
      }
      for (const [id, edge] of this.exitingEdges) {
        if (now - edge.exitingSince >= this.EXIT_ANIMATION_MS) {
          this.exitingEdges.delete(id);
        }
      }

      this.render();

      if (
        this.nodeAnimations.size > 0 ||
        this.edgeAnimations.size > 0 ||
        this.exitingNodes.size > 0 ||
        this.exitingEdges.size > 0
      ) {
        this.animationFrameId = requestAnimationFrame(tick);
      }
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private getAnimationProgress(animation: EntryAnimation | undefined): number {
    if (!animation) return 1;
    return Math.min(1, Math.max(0, (performance.now() - animation.startedAt) / animation.duration));
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

    this.ctx.fillStyle = this.color('separator');
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

    const allEdges = [
      ...this.edges.map(e => ({ edge: e, exiting: false })),
      ...Array.from(this.exitingEdges.values()).map(e => ({ edge: e, exiting: true }))
    ];

    for (const { edge, exiting } of allEdges) {
      const source = this.nodes.get(edge.sourceId) || this.exitingNodes.get(edge.sourceId);
      const target = this.nodes.get(edge.targetId) || this.exitingNodes.get(edge.targetId);
      if (!source || !target) continue;

      const isPathEdge = pathEdges.has(edge.id);
      const isHovered = edge.id === this.hoveredEdgeId;

      let color = this.color('stroke', 0.7);
      let width = 2;

      if (isPathEdge) {
        color = this.color('success');
        width = 4;
      } else if (isHovered) {
        color = this.color('accent');
        width = 3;
      }

      let alpha = 1;
      let progress = 1;

      if (exiting) {
        const edgeData = this.exitingEdges.get(edge.id);
        const elapsed = edgeData ? performance.now() - edgeData.exitingSince : this.EXIT_ANIMATION_MS;
        const p = Math.min(1, Math.max(0, elapsed / this.EXIT_ANIMATION_MS));
        alpha = 1 - p;
        progress = alpha;
      } else {
        const anim = this.edgeAnimations.get(edge.id);
        progress = this.getAnimationProgress(anim);
      }

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const endX = source.x + dx * progress;
      const endY = source.y + dy * progress;

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = width;
      this.ctx.lineCap = 'round';
      this.ctx.globalAlpha = alpha;

      this.ctx.beginPath();
      this.ctx.moveTo(source.x, source.y);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();

      if (this.directed && progress >= 1 && !exiting) {
        this.drawArrow(source, target, color);
      }

      this.ctx.globalAlpha = alpha * progress;
      this.drawEdgeWeight(source, target, edge.weight, isPathEdge, isHovered);
      this.ctx.restore();
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

    this.ctx.font = `500 12px ${this.FONT}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const text = weight.toString();
    const metrics = this.ctx.measureText(text);
    const boxW = Math.max(22, metrics.width + 12);
    const boxH = 18;

    this.ctx.fillStyle = this.color('surface');
    this.ctx.strokeStyle = isPathEdge
      ? this.color('success')
      : isHovered
        ? this.color('accent')
        : this.color('stroke', 0.5);
    this.ctx.lineWidth = 1;

    this.ctx.beginPath();
    this.ctx.roundRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH, boxH / 2);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = isPathEdge ? this.color('success') : this.color('label');
    this.ctx.fillText(text, midX, midY);
  }

  private drawNodes(selectedNodes: Set<string>): void {
    const allNodes = [
      ...Array.from(this.nodes.values()).map(n => ({ node: n, exiting: false })),
      ...Array.from(this.exitingNodes.values()).map(n => ({ node: n, exiting: true }))
    ];

    for (const { node, exiting } of allNodes) {
      let alpha = 1;
      let scale = 1;

      if (exiting) {
        const nodeData = this.exitingNodes.get(node.id);
        const elapsed = nodeData ? performance.now() - nodeData.exitingSince : this.EXIT_ANIMATION_MS;
        const p = Math.min(1, Math.max(0, elapsed / this.EXIT_ANIMATION_MS));
        alpha = 1 - p;
        scale = alpha;
      } else {
        const anim = this.nodeAnimations.get(node.id);
        const progress = this.getAnimationProgress(anim);
        scale = 1.0 + (1 - progress) * 0.12;
        alpha = Math.min(1, progress * 1.5);
      }

      if (alpha <= 0) continue;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;

      this.ctx.translate(node.x, node.y);
      this.ctx.scale(scale, scale);
      this.ctx.translate(-node.x, -node.y);

      const isSelected = selectedNodes.has(node.id);
      const isActive = this.vizState?.activeNode === node.id;
      const isVisited = this.vizState?.visitedNodes.has(node.id) || false;
      const isInPath = this.vizState?.path.includes(node.id) || false;
      const isHovered = this.hoveredNodeId === node.id;

      // Состояние различается не только цветом: толщиной обводки и внешним кольцом.
      let fillColor = this.color('surface');
      let strokeColor = this.color('stroke');
      let strokeWidth = 2;
      let labelColor = this.color('label');

      if (isInPath) {
        fillColor = this.color('success', 0.2);
        strokeColor = this.color('success');
        strokeWidth = 3.5;
      } else if (isActive) {
        fillColor = this.color('warning', 0.22);
        strokeColor = this.color('warning');
        strokeWidth = 3.5;
      } else if (isVisited) {
        fillColor = this.color('accent', 0.16);
        strokeColor = this.color('accent');
        strokeWidth = 2;
      } else if (isSelected) {
        strokeColor = this.color('accent');
        strokeWidth = 3;
      }

      if (isHovered && !isInPath && !isActive) {
        strokeColor = this.color('accent');
        strokeWidth = 3;
      }

      // Подложка нужна, чтобы полупрозрачная заливка не пропускала рёбра.
      this.ctx.fillStyle = this.color('canvas');
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, this.NODE_RADIUS, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = fillColor;
      this.ctx.fill();

      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = strokeWidth;
      this.ctx.stroke();

      if (isActive) {
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, this.NODE_RADIUS + 6, 0, Math.PI * 2);
        this.ctx.strokeStyle = this.color('warning', 0.45);
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }

      this.ctx.fillStyle = labelColor;
      this.ctx.font = `600 13px ${this.FONT}`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(node.label, node.x, node.y);

      if (this.vizState && this.vizState.distances[node.id] !== undefined) {
        const dist = this.vizState.distances[node.id];
        const distText = dist === Infinity ? '∞' : dist.toFixed(1);

        this.ctx.font = `500 12px ${this.FONT}`;
        this.ctx.fillStyle = isInPath ? this.color('success') : this.color('secondary');
        this.ctx.fillText(distText, node.x, node.y + this.NODE_RADIUS + 14);
      }

      // Метки начала и цели: подписаны словом, цвет только дополняет
      const isStart = node.id === this.startNodeId;
      const isTarget = node.id === this.targetNodeId;

      const waypointIndex = this.waypointIds.indexOf(node.id);

      if (isStart || isTarget || waypointIndex >= 0) {
        const badgeText = isStart ? 'Начало' : isTarget ? 'Цель' : `Через ${waypointIndex + 1}`;
        const badgeY = node.y - this.NODE_RADIUS - 16;

        const badgeAnim = isStart ? this.startBadgeAnim : isTarget ? this.targetBadgeAnim : null;
        const progress = this.getAnimationProgress(badgeAnim ?? undefined);
        
        // Плавное появление: масштаб от 0.6 до 1.0 + Fade-In
        const badgeScale = 0.6 + 0.4 * progress;
        const badgeAlpha = exiting ? alpha : progress;

        // Если анимация бейджа еще идет, просим канвас продолжать крутить кадры анимации
        if (progress < 1 && !this.animationFrameId) {
          this.startAnimationLoop();
        }

        this.ctx.save();
        this.ctx.globalAlpha = badgeAlpha;

        this.ctx.translate(node.x, badgeY);
        this.ctx.scale(badgeScale, badgeScale);
        this.ctx.translate(-node.x, -badgeY);

        this.ctx.font = `600 11px ${this.FONT}`;
        const textMetrics = this.ctx.measureText(badgeText);
        const badgeW = textMetrics.width + 14;
        const badgeH = 18;

        this.ctx.fillStyle = this.color('fill-selected');
        this.ctx.strokeStyle = this.color('stroke', 0.5);
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(node.x - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, badgeH / 2);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = this.color('label');
        this.ctx.fillText(badgeText, node.x, badgeY);
        this.ctx.restore();
      }

      this.ctx.restore();
    }
  }

  private getPathEdges(): Set<string> {
    const pathEdges = new Set<string>();
    if (!this.vizState || !this.vizState.path || this.vizState.path.length < 2) return pathEdges;

    for (let i = 0; i < this.vizState.path.length - 1; i++) {
      const u = this.vizState.path[i];
      const v = this.vizState.path[i + 1];

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