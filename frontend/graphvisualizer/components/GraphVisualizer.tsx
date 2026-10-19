'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
  Play,
  Square,
  RotateCcw,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Settings,
  GripVertical,
  Flag,
  Target,
  Sparkles,
  MousePointer,
  CirclePlus,
  ArrowRight,
  Trash2,
  CornerDownRight,
  Pencil,
  ArrowLeftRight,
  Scale,
  Download,
  Upload,
  Copy,
} from 'lucide-react';
import { GraphBuilder } from '@/lib/graph-builder';
import { GraphRenderer } from '@/lib/graph-renderer';
import { applyForceDirectedLayout } from '@/lib/force-layout';
import type { Node, Edge, AlgorithmStep, AlgorithmListEntry } from '@/lib/api';
import { getAlgorithms } from '@/lib/api';
import { applyCircularLayout, applyGridLayout, applyHierarchicalLayout } from '@/lib/layouts';

type Tool = 'select' | 'addNode' | 'addEdge' | 'delete';
type PanelSide = 'left' | 'right';

const PANEL_SPACE = 340;
const PANEL_WIDTH = 320;

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Кастомный Select с иконками Lucide
function CustomSelect({
  options,
  value,
  onChange,
  placeholder = '(Выбрать)',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as any)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('pointerdown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 bg-slate-800/85 hover:bg-slate-800 border rounded-xl text-xs font-medium text-slate-100 flex items-center justify-between transition-all select-none disabled:opacity-40 disabled:cursor-not-allowed ${isOpen
          ? 'border-teal-400 ring-2 ring-teal-400/20 shadow-lg shadow-teal-500/10'
          : 'border-slate-700/80 hover:border-slate-600'
          }`}
      >
        <span className="truncate pr-2">
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-slate-500 italic">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''
            }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full left-0 right-0 mt-1.5 z-50 backdrop-blur-2xl bg-slate-900/95 border border-slate-700/90 rounded-xl p-1 shadow-2xl max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 flex flex-col gap-0.5 text-xs"
          >
            {placeholder && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors flex items-center justify-between ${value === ''
                  ? 'bg-teal-500/15 text-teal-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                  }`}
              >
                <span className="italic">{placeholder}</span>
                {value === '' && <Check className="w-3.5 h-3.5 text-teal-400" />}
              </button>
            )}

            {options.map(option => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors flex items-center justify-between ${isSelected
                    ? 'bg-teal-500/15 text-teal-300 font-semibold'
                    : 'text-slate-200 hover:text-white hover:bg-slate-800/80'
                    }`}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface GraphVisualizerProps {
  onAlgorithmRun?: (
    nodes: Record<string, Node>,
    edges: Edge[],
    algorithmType: string,
    startNodeId: string,
    targetNodeId: string,
    directed: boolean
  ) => void;
  onStop?: () => void;
  onReset?: () => void;
  currentStep?: AlgorithmStep | null;
  isPlaying?: boolean;
  speedMs?: number;
  onSpeedChange?: (speed: number) => void;
  stepsCount?: number;
  currentStepIndex?: number;
  onStepChange?: (index: number) => void;
}

interface ContextMenuState {
  type: 'node' | 'edge';
  id: string;
  screenX: number;
  screenY: number;
}

export default function GraphVisualizer({
  onAlgorithmRun,
  onStop,
  onReset,
  currentStep,
  isPlaying = false,
  speedMs = 400,
  onSpeedChange,
  stepsCount = 0,
  currentStepIndex = -1,
  onStepChange,
}: GraphVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphBuilderRef = useRef(new GraphBuilder());
  const rendererRef = useRef<GraphRenderer | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const [graphVersion, setGraphVersion] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [panelSide, setPanelSide] = useState<PanelSide>('right');

  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [dragHoverSide, setDragHoverSide] = useState<PanelSide>('right');
  const dragControls = useDragControls();

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [directed, setDirected] = useState(false);
  const [algorithms, setAlgorithms] = useState<AlgorithmListEntry[]>([]);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('');
  const [startNode, setStartNode] = useState<string>('');
  const [targetNode, setTargetNode] = useState<string>('');
  const [edgeWeightInput, setEdgeWeightInput] = useState<string>('1');

  // Состояния для модального окна импорта/экспорта
  const [modalMode, setModalMode] = useState<'export' | 'import' | null>(null);
  const [jsonInputText, setJsonInputText] = useState('');
  const [copyStatus, setCopyStatus] = useState(false);

  const [isAutoLayouting, setIsAutoLayouting] = useState(false);
  const layoutCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      layoutCancelRef.current?.();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      rendererRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new GraphRenderer(canvasRef.current);
    rendererRef.current = renderer;

    renderer.setGraph(
      graphBuilderRef.current.nodes,
      graphBuilderRef.current.edges,
      directed
    );
    renderer.setStartAndTarget(startNode || null, targetNode || null);
    renderer.render(selectedNodes);

    getAlgorithms()
      .then(data => {
        setAlgorithms(data);
        setSelectedAlgorithm(prev => prev || (data.length > 0 ? data[0].id : ''));
      })
      .catch(console.error);

    return () => {
      renderer.destroy();
    };
  }, []);
  // Обработчик переключения видов размещения
  // Храним ссылку на отмену текущей анимации раскладки
  const layoutAnimCancelRef = useRef<(() => void) | null>(null);

  const handleChangeLayout = (layoutType: 'force' | 'circular' | 'grid' | 'hierarchical') => {
    if (isPlaying || !canvasRef.current || !rendererRef.current) return;
    setContextMenu(null);

    // Отменяем предыдущую незавершенную анимацию раскладки, если она была
    layoutAnimCancelRef.current?.();
    layoutAnimCancelRef.current = null;

    const rect = canvasRef.current.getBoundingClientRect();
    let targetScreenX = rect.width / 2;
    if (isPanelOpen) {
      targetScreenX = panelSide === 'right' ? (rect.width - PANEL_SPACE) / 2 : (rect.width + PANEL_SPACE) / 2;
    }
    const center = rendererRef.current.screenToWorld(targetScreenX, rect.height / 2);

    if (layoutType === 'force') {
      setIsAutoLayouting(true);
      layoutCancelRef.current = applyForceDirectedLayout(
        graphBuilderRef.current.nodes,
        graphBuilderRef.current.edges,
        center,
        {
          iterations: 60,
          onTick: () => redraw(),
          onDone: () => {
            setGraphVersion(v => v + 1);
            redraw();
            setIsAutoLayouting(false);
            layoutCancelRef.current = null;
          },
        }
      );
    } else {
      // 1. Создаем копию мапы узлов, чтобы временно применить к ней математику рассчета целей,
      // не портя оригинальные координаты до начала анимации
      const tempNodes = new Map<string, Node>();
      graphBuilderRef.current.nodes.forEach((n, id) => {
        tempNodes.set(id, { ...n });
      });

      // 2. Вычисляем целевые координаты в зависимости от выбранного типа
      if (layoutType === 'circular') {
        applyCircularLayout(tempNodes, center, Math.min(rect.width, rect.height) * 0.3);
      } else if (layoutType === 'grid') {
        applyGridLayout(tempNodes, center, 110);
      } else if (layoutType === 'hierarchical') {
        applyHierarchicalLayout(tempNodes, graphBuilderRef.current.edges, startNode || null, center, 130, 150);
      }

      // 3. Собираем мапу целевых точек
      const getTargetCoords = () => {
        const targets = new Map<string, { x: number; y: number }>();
        tempNodes.forEach((n, id) => {
          targets.set(id, { x: n.x, y: n.y });
        });
        return targets;
      };

      // 4. Запускаем плавный переход (анимацию 500мс)
      layoutAnimCancelRef.current = animateLayoutTransition(
        graphBuilderRef.current.nodes,
        getTargetCoords,
        () => {
          setGraphVersion(v => v + 1);
          redraw();
        },
        500 // длительность анимации в мс
      );
    }
  };

  useEffect(() => {
    return () => {
      layoutCancelRef.current?.();
      layoutAnimCancelRef.current?.();
    };
  }, []);
  useEffect(() => {
    if (!rendererRef.current) return;
    const renderer = rendererRef.current;

    renderer.isInteractive = tool === 'select' && !isPlaying;
    renderer.onNodeMove = () => setContextMenu(null);

    renderer.onNodeClick = (node, screenPos) => {
      if (tool === 'select' && !isPlaying) {
        setContextMenu({
          type: 'node',
          id: node.id,
          screenX: screenPos.x,
          screenY: screenPos.y,
        });
      }
    };

    renderer.onEdgeClick = (edge, screenPos) => {
      if (tool === 'select' && !isPlaying) {
        setContextMenu({
          type: 'edge',
          id: edge.id,
          screenX: screenPos.x,
          screenY: screenPos.y,
        });
      }
    };

    renderer.onCanvasBackgroundClick = () => setContextMenu(null);
  }, [tool, isPlaying]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setStartAndTarget(startNode || null, targetNode || null);
      rendererRef.current.render(selectedNodes);
    }
  }, [startNode, targetNode, selectedNodes]);

  useEffect(() => {
    if (rendererRef.current) {
      (rendererRef.current as any).isInteractive = tool === 'select' && !isPlaying;
    }
  }, [tool, isPlaying]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setVisualizationState(currentStep || null);
      rendererRef.current.render(selectedNodes);
    }
  }, [currentStep, selectedNodes]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setGraph(
        graphBuilderRef.current.nodes,
        graphBuilderRef.current.edges,
        directed
      );
      rendererRef.current.render(selectedNodes);
    }
  }, [directed, graphVersion]);

  const redraw = useCallback(() => {
    rendererRef.current?.render(selectedNodes);
  }, [selectedNodes]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlaying) return;

      if (mouseDownPosRef.current) {
        const dx = e.clientX - mouseDownPosRef.current.x;
        const dy = e.clientY - mouseDownPosRef.current.y;
        if (Math.hypot(dx, dy) > 5) return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const { x, y } = rendererRef.current
        ? rendererRef.current.screenToWorld(screenX, screenY)
        : { x: screenX, y: screenY };

      const clickedNode = graphBuilderRef.current.findNodeAt(x, y);

      if (tool === 'addNode' && !clickedNode) {
        graphBuilderRef.current.addNode(x, y);
        setContextMenu(null);
        setGraphVersion(v => v + 1);
        redraw();
      } else if (tool === 'addEdge' && clickedNode) {
        setContextMenu(null);
        if (!edgeStart) {
          setEdgeStart(clickedNode.id);
        } else if (edgeStart !== clickedNode.id) {
          const weight = parseFloat(edgeWeightInput) || 1;
          graphBuilderRef.current.addEdge(edgeStart, clickedNode.id, weight);
          setEdgeStart(null);
          setGraphVersion(v => v + 1);
          redraw();
        }
      } else if (tool === 'delete' && clickedNode) {
        setContextMenu(null);
        graphBuilderRef.current.removeNode(clickedNode.id);
        if (startNode === clickedNode.id) setStartNode('');
        if (targetNode === clickedNode.id) setTargetNode('');
        setGraphVersion(v => v + 1);
        redraw();
      }
    },
    [tool, edgeStart, isPlaying, edgeWeightInput, startNode, targetNode, redraw]
  );

  const handleRenameNode = (nodeId: string) => {
    const node = graphBuilderRef.current.nodes.get(nodeId);
    if (!node) return;
    const newName = window.prompt(`Введите новое имя для узла "${node.label}":`, node.label);
    if (newName && newName.trim()) {
      node.label = newName.trim();
      setGraphVersion(v => v + 1);
      redraw();
    }
    setContextMenu(null);
  };

  const handleDeleteNode = (nodeId: string) => {
    graphBuilderRef.current.removeNode(nodeId);
    if (startNode === nodeId) setStartNode('');
    if (targetNode === nodeId) setTargetNode('');
    setContextMenu(null);
    setGraphVersion(v => v + 1);
    redraw();
  };

  const handleEditEdgeWeight = (edgeId: string) => {
    const edge = graphBuilderRef.current.edges.find(e => e.id === edgeId);
    if (!edge) return;
    const newWeightStr = window.prompt(`Введите новый вес ребра:`, edge.weight.toString());
    if (newWeightStr !== null) {
      const val = parseFloat(newWeightStr);
      if (!isNaN(val) && isFinite(val)) {
        edge.weight = val;
        setGraphVersion(v => v + 1);
        redraw();
      }
    }
    setContextMenu(null);
  };
  function animateLayoutTransition(
    nodes: Map<string, Node>,
    getTargetCoords: () => Map<string, { x: number; y: number }>,
    onUpdate: () => void,
    duration = 500
  ): () => void {
    const startCoords = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, id) => {
      startCoords.set(id, { x: node.x, y: node.y });
    });

    const targetCoords = getTargetCoords();
    const startTime = performance.now();
    let animationFrameId: number;

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      nodes.forEach((node, id) => {
        const start = startCoords.get(id);
        const target = targetCoords.get(id);
        if (start && target) {
          node.x = start.x + (target.x - start.x) * ease;
          node.y = start.y + (target.y - start.y) * ease;
        }
      });

      onUpdate();

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    // Возвращаем функцию отмены анимации на случай повторного клика
    return () => cancelAnimationFrame(animationFrameId);
  }
  const handleReverseEdge = (edgeId: string) => {
    const edge = graphBuilderRef.current.edges.find(e => e.id === edgeId);
    if (edge) {
      const temp = edge.sourceId;
      edge.sourceId = edge.targetId;
      edge.targetId = temp;
      setGraphVersion(v => v + 1);
      redraw();
    }
    setContextMenu(null);
  };

  const handleDeleteEdge = (edgeId: string) => {
    graphBuilderRef.current.edges = graphBuilderRef.current.edges.filter(e => e.id !== edgeId);
    setContextMenu(null);
    setGraphVersion(v => v + 1);
    redraw();
  };

  const handleAutoLayout = useCallback(() => {
    if (isPlaying || isAutoLayouting || !canvasRef.current || !rendererRef.current) return;

    setContextMenu(null);
    const rect = canvasRef.current.getBoundingClientRect();

    let targetScreenX = rect.width / 2;
    if (isPanelOpen) {
      targetScreenX = panelSide === 'right'
        ? (rect.width - PANEL_SPACE) / 2
        : (rect.width + PANEL_SPACE) / 2;
    }

    const center = rendererRef.current.screenToWorld(targetScreenX, rect.height / 2);

    setIsAutoLayouting(true);

    layoutCancelRef.current = applyForceDirectedLayout(
      graphBuilderRef.current.nodes,
      graphBuilderRef.current.edges,
      center,
      {
        iterations: 75,
        onTick: () => redraw(),
        onDone: () => {
          setGraphVersion(v => v + 1);
          redraw();
          setIsAutoLayouting(false);
          layoutCancelRef.current = null;
        },
      }
    );
  }, [isPlaying, isAutoLayouting, isPanelOpen, panelSide, redraw]);

  const handleRunAlgorithm = useCallback(() => {
    setContextMenu(null);
    if (!selectedAlgorithm || !startNode || !targetNode) {
      alert('Выберите алгоритм, начальную и целевую вершины');
      return;
    }

    const nodes = graphBuilderRef.current.getNodesAsRecord();
    const edges = graphBuilderRef.current.edges;

    setIsPanelOpen(false);

    onAlgorithmRun?.(nodes, edges, selectedAlgorithm, startNode, targetNode, directed);
  }, [selectedAlgorithm, startNode, targetNode, directed, onAlgorithmRun]);

  const handleClearGraph = useCallback(() => {
    setContextMenu(null);
    graphBuilderRef.current.clear();
    setSelectedNodes(new Set());
    setEdgeStart(null);
    setStartNode('');
    setTargetNode('');
    setGraphVersion(v => v + 1);
    onReset?.();
    redraw();
  }, [onReset, redraw]);

  // Экспорт текущего графа в JSON строку
  const handleOpenExport = () => {
    setContextMenu(null);
    const rawNodes = graphBuilderRef.current.getNodesAsRecord();
    // Конвертируем record узлов в массив для красивого JSON экспорта
    const nodesArray = Object.values(rawNodes);
    const exportData = {
      nodes: nodesArray,
      edges: graphBuilderRef.current.edges,
      directed: directed,
    };
    setJsonInputText(JSON.stringify(exportData, null, 2));
    setModalMode('export');
  };

  // Открытие модального окна импорта
  const handleOpenImport = () => {
    setContextMenu(null);
    setJsonInputText('');
    setModalMode('import');
  };

  // Применение импортированного JSON
  const handleApplyImport = () => {
    try {
      const parsed = JSON.parse(jsonInputText);
      if (!parsed.nodes || !Array.isArray(parsed.nodes) || !parsed.edges || !Array.isArray(parsed.edges)) {
        alert('Неверный формат JSON. Ожидаются поля "nodes" (массив) и "edges" (массив).');
        return;
      }

      graphBuilderRef.current.clear();

      // Заполняем узлы
      parsed.nodes.forEach((n: any) => {
        if (n.id && n.label && typeof n.x === 'number' && typeof n.y === 'number') {
          graphBuilderRef.current.nodes.set(n.id, { id: n.id, label: n.label, x: n.x, y: n.y });
        }
      });

      // Заполняем ребра
      parsed.edges.forEach((e: any) => {
        if (e.sourceId && e.targetId) {
          graphBuilderRef.current.edges.push({
            id: e.id || `edge-${Math.random().toString(36).substr(2, 9)}`,
            sourceId: e.sourceId,
            targetId: e.targetId,
            weight: typeof e.weight === 'number' ? e.weight : 1,
          });
        }
      });

      if (typeof parsed.directed === 'boolean') {
        setDirected(parsed.directed);
      }

      setStartNode('');
      setTargetNode('');
      setSelectedNodes(new Set());
      setEdgeStart(null);
      setGraphVersion(v => v + 1);
      onReset?.();
      redraw();
      setModalMode(null);
    } catch (err) {
      alert('Ошибка при разборе JSON. Проверьте правильность синтаксиса.');
    }
  };
  // Обработчик генерации рандомного графа
  const handleGenerateRandomGraph = useCallback(() => {
    if (isPlaying) return;

    const input = window.prompt('Введите количество узлов (N) для генерации:', '50');
    if (!input) return;

    const count = parseInt(input, 10);
    if (isNaN(count) || count < 2 || count > 1000) {
      alert('Пожалуйста, введите число от 2 до 1000.');
      return;
    }

    setContextMenu(null);

    // Получаем размеры холста для правильного распределения
    const width = canvasRef.current ? canvasRef.current.clientWidth : 1000;
    const height = canvasRef.current ? canvasRef.current.clientHeight : 800;

    const { nodes, edges } = generateRandomConnectedGraph(count, width, height);

    graphBuilderRef.current.clear();
    nodes.forEach((node, id) => {
      graphBuilderRef.current.nodes.set(id, node);
    });
    graphBuilderRef.current.edges = edges;

    setSelectedNodes(new Set());
    setEdgeStart(null);
    setStartNode('');
    setTargetNode('');
    onReset?.();
    setGraphVersion(v => v + 1);
    redraw();

    setIsAutoLayouting(true);
    const center = rendererRef.current ? rendererRef.current.screenToWorld(width / 2, height / 2) : { x: 0, y: 0 };

    layoutCancelRef.current = applyForceDirectedLayout(
      graphBuilderRef.current.nodes,
      graphBuilderRef.current.edges,
      center,
      {
        iterations: 60,
        onTick: () => redraw(),
        onDone: () => {
          setGraphVersion(v => v + 1);
          redraw();
          setIsAutoLayouting(false);
          layoutCancelRef.current = null;
        },
      }
    );
  }, [isPlaying, onReset, redraw]);
  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonInputText);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const nodeList = useMemo(() => {
    return Array.from(graphBuilderRef.current.nodes.values());
  }, [graphVersion]);

  const hasStartedRun = isPlaying || stepsCount > 0;

  const centerLeftPosition = useMemo(() => {
    if (!isPanelOpen) return '50%';
    return panelSide === 'right'
      ? `calc((100% - ${PANEL_SPACE}px) / 2)`
      : `calc((100% + ${PANEL_SPACE}px) / 2)`;
  }, [isPanelOpen, panelSide]);

  const targetPanelX = useMemo(() => {
    if (!isPanelOpen) {
      return panelSide === 'right' ? windowWidth + 50 : -370;
    }
    return panelSide === 'right' ? Math.max(windowWidth - PANEL_SPACE, 20) : 20;
  }, [isPanelOpen, panelSide, windowWidth]);
  function generateRandomConnectedGraph(nodeCount: number, width = 900, height = 700) {
    const nodes = new Map<string, Node>();
    const edges: Edge[] = [];

    // 1. Создаем узлы со случайными координатами
    for (let i = 1; i <= nodeCount; i++) {
      const id = `node-${i}`;
      nodes.set(id, {
        id,
        label: `Узел ${i}`,
        // Отступаем от краев на 80 пикселей
        x: 80 + Math.random() * (width - 160),
        y: 80 + Math.random() * (height - 160),
      });
    }

    const nodeIds = Array.from(nodes.keys());

    // 2. Гарантируем связность: соединяем узлы последовательной цепочкой (1-2, 2-3, 3-4...)
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const sourceId = nodeIds[i];
      const targetId = nodeIds[i + 1];
      edges.push({
        id: `edge-connect-${i}`,
        sourceId,
        targetId,
        weight: Math.round((1 + Math.random() * 9) * 10) / 10, // вес от 1 до 10
      });
    }

    // 3. Добавляем случайные ребра для густоты (примерно по 1.5 дополнительных ребра на узел)
    const extraEdgesCount = Math.floor(nodeCount * 1.5);
    let edgeCounter = 0;

    for (let k = 0; k < extraEdgesCount; k++) {
      const sourceIdx = Math.floor(Math.random() * nodeCount);
      let targetIdx = Math.floor(Math.random() * nodeCount);

      if (sourceIdx === targetIdx) continue;

      const sourceId = nodeIds[sourceIdx];
      const targetId = nodeIds[targetIdx];

      // Проверяем, нет ли уже такого ребра
      const exists = edges.some(
        e => (e.sourceId === sourceId && e.targetId === targetId) ||
          (e.sourceId === targetId && e.targetId === sourceId)
      );

      if (!exists) {
        edges.push({
          id: `edge-extra-${edgeCounter++}`,
          sourceId,
          targetId,
          weight: Math.round((1 + Math.random() * 9) * 10) / 10,
        });
      }
    }

    return { nodes, edges };
  }
  // Конфигурация нижних инструментов с иконками Lucide
  const TOOLS = [
    { value: 'select', label: 'Выбор', icon: MousePointer },
    { value: 'addNode', label: 'Узел', icon: CirclePlus },
    { value: 'addEdge', label: 'Ребро', icon: ArrowRight },
    { value: 'delete', label: 'Удалить', icon: Trash2 },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0D14] text-slate-200 select-none">
      <canvas
        ref={canvasRef}
        onMouseDown={e => {
          mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={handleCanvasClick}
        className={`absolute inset-0 w-full h-full z-0 ${tool === 'addNode'
          ? 'cursor-crosshair'
          : tool === 'delete'
            ? 'cursor-not-allowed'
            : tool === 'addEdge'
              ? 'cursor-cell'
              : 'cursor-default'
          }`}
      />

      {/* Верхний бар управления */}
      <motion.div
        animate={{ left: centerLeftPosition }}
        transition={{ type: 'spring', stiffness: 220, damping: 28 }}
        style={{ x: '-50%' }}
        className="absolute top-5 z-20 pointer-events-auto flex items-center justify-center max-w-[calc(100vw-3rem)]"
      >
        <motion.div
          layout
          transition={{
            layout: { type: 'spring', stiffness: 300, damping: 28 },
          }}
          className="backdrop-blur-xl bg-slate-900/95 border border-slate-800 p-1.5 rounded-2xl shadow-2xl flex flex-col gap-1.5 text-xs overflow-visible"
        >
          <AnimatePresence mode="wait" initial={false}>
            {!hasStartedRun ? (
              /* 1. СОСТОЯНИЕ ДО СТАРТА */
              <motion.div
                key="pre-run-bar"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                {/* Дропдаун алгоритма (плавное появление слева направо) */}
                <AnimatePresence initial={false}>
                  {!isPanelOpen && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0, x: -10 }}
                      animate={{ opacity: 1, scaleX: 1, x: 0 }}
                      exit={{ opacity: 0, scaleX: 0, x: -10 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      style={{ originX: 0 }}
                      className="w-40 sm:w-44 shrink-0 overflow-visible z-30"
                    >
                      <CustomSelect
                        options={algorithms.map(algo => ({ value: algo.id, label: algo.name }))}
                        value={selectedAlgorithm}
                        onChange={setSelectedAlgorithm}
                        placeholder="Алгоритм"
                        disabled={isPlaying}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Сплошная кнопка запуска */}
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleRunAlgorithm}
                  disabled={!selectedAlgorithm || !startNode || !targetNode}
                  className="px-4 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold flex items-center gap-2 shadow-lg shadow-teal-500/25 active:scale-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs shrink-0"
                  title={
                    !selectedAlgorithm || !startNode || !targetNode
                      ? 'Выберите алгоритм, старт и цель'
                      : 'Запустить обход'
                  }
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Запустить</span>
                </motion.button>
              </motion.div>
            ) : (
              /* 2. СОСТОЯНИЕ ПЛЕЕРА */
              <motion.div
                key="player-hud-container"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-1.5"
              >
                {/* ПЕРВАЯ СТРОКА: Управление плеером */}
                <div className="flex items-center gap-2.5 p-0.5">
                  {/* Кнопка Стоп / Запустить заново */}
                  {isPlaying ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={onStop}
                      className="w-7 h-7 rounded-lg bg-rose-500 text-white hover:bg-rose-600 font-bold flex items-center justify-center transition-colors shadow-sm shrink-0"
                      title="Остановить"
                    >
                      <Square className="w-3 h-3 fill-current" />
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={handleRunAlgorithm}
                      disabled={!selectedAlgorithm || !startNode || !targetNode}
                      className="w-7 h-7 rounded-lg bg-teal-400 text-slate-950 hover:bg-teal-300 font-bold flex items-center justify-center transition-colors shadow-sm shrink-0 disabled:opacity-30"
                      title="Запустить заново"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </motion.button>
                  )}

                  {/* Покадровая перемотка */}
                  <div className="flex items-center gap-0.5 border-l border-r border-slate-800 px-1 shrink-0">
                    {[
                      { Icon: SkipBack, title: 'В начало', action: () => onStepChange?.(0), disabled: currentStepIndex <= 0 },
                      { Icon: ChevronLeft, title: 'Шаг назад', action: () => onStepChange?.(currentStepIndex - 1), disabled: currentStepIndex <= 0 },
                      { Icon: ChevronRight, title: 'Шаг вперед', action: () => onStepChange?.(currentStepIndex + 1), disabled: currentStepIndex >= stepsCount - 1 },
                      { Icon: SkipForward, title: 'В конец', action: () => onStepChange?.(stepsCount - 1), disabled: currentStepIndex >= stepsCount - 1 },
                    ].map(({ Icon, title, action, disabled }, idx) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        type="button"
                        onClick={action}
                        disabled={disabled}
                        className="w-6 h-6 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center disabled:opacity-20 transition-colors"
                        title={title}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </motion.button>
                    ))}
                  </div>

                  {/* Слайдер и счетчик */}
                  <AnimatePresence>
                    {stepsCount > 1 && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        className="flex items-center gap-2 pl-0.5 pr-1 shrink-0 overflow-hidden"
                      >
                        <input
                          type="range"
                          min="0"
                          max={stepsCount - 1}
                          value={currentStepIndex}
                          onChange={e => onStepChange?.(Number(e.target.value))}
                          className="w-20 sm:w-28 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                        />
                        <span className="text-[11px] font-mono text-teal-300 shrink-0">
                          {currentStepIndex + 1}/{stepsCount}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Выбор алгоритма (плавное появление слева направо) */}
                  <AnimatePresence initial={false}>
                    {!isPanelOpen && (
                      <motion.div
                        initial={{ opacity: 0, scaleX: 0, x: -10 }}
                        animate={{ opacity: 1, scaleX: 1, x: 0 }}
                        exit={{ opacity: 0, scaleX: 0, x: -10 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        style={{ originX: 0 }}
                        className="w-36 shrink-0 overflow-visible z-30"
                      >
                        <CustomSelect
                          options={algorithms.map(algo => ({ value: algo.id, label: algo.name }))}
                          value={selectedAlgorithm}
                          onChange={setSelectedAlgorithm}
                          placeholder="Алгоритм"
                          disabled={isPlaying}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Сброс */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={onReset}
                    className="w-6 h-6 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 flex items-center justify-center transition-colors shrink-0"
                    title="Сбросить обход"
                  >
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                </div>

                {/* ВТОРАЯ СТРОКА: Информация о текущем шаге */}
                <AnimatePresence initial={false}>
                  {!isPanelOpen && currentStep && (
                    <motion.div
                      initial={{ opacity: 0, scaleY: 0, maxHeight: 0, paddingTop: 0 }}
                      animate={{ opacity: 1, scaleY: 1, maxHeight: 100, paddingTop: 8 }}
                      exit={{ opacity: 0, scaleY: 0, maxHeight: 0, paddingTop: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      style={{ originY: 0 }}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-800/80 px-1 text-xs overflow-hidden"
                    >
                      {/* Статус */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-slate-400 text-[11px]">Статус:</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${currentStep.status === 'COMPLETED'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : currentStep.status === 'ERROR'
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                        >
                          {currentStep.status === 'COMPLETED'
                            ? 'Завершен'
                            : currentStep.status === 'ERROR'
                              ? 'Ошибка'
                              : 'В процессе'}
                        </span>
                      </div>

                      {/* Вершина в фокусе */}
                      {currentStep.activeNodeId && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-slate-400 text-[11px]">Фокус:</span>
                          <span className="text-sky-300 font-bold truncate max-w-[120px]">
                            {graphBuilderRef.current.nodes.get(currentStep.activeNodeId)?.label ||
                              currentStep.activeNodeId}
                          </span>
                        </div>
                      )}

                      {/* Длина пути */}
                      {currentStep.activeNodeId &&
                        currentStep.distances[currentStep.activeNodeId] !== undefined && (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-slate-400 text-[11px]">Длина:</span>
                            <span className="text-emerald-400 font-mono font-bold">
                              {currentStep.distances[currentStep.activeNodeId]}
                            </span>
                          </div>
                        )}

                      {/* Маршрут */}
                      {currentStep.path && currentStep.path.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                          <span className="text-slate-400 text-[11px]">Маршрут:</span>
                          <span
                            className="text-emerald-300 font-medium text-[11px] truncate max-w-[220px] md:max-w-[320px]"
                            title={currentStep.path
                              .map(id => graphBuilderRef.current.nodes.get(id)?.label || id)
                              .join(' → ')}
                          >
                            {currentStep.path
                              .map(id => graphBuilderRef.current.nodes.get(id)?.label || id)
                              .join(' → ')}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Кнопка вызова свернутой панели */}
      <AnimatePresence>
        {!isPanelOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{
              opacity: 1,
              scale: 1,
              left: panelSide === 'left' ? '1.25rem' : 'auto',
              right: panelSide === 'right' ? '1.25rem' : 'auto',
            }}
            exit={{ opacity: 0, scale: 0.85 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsPanelOpen(true)}
            className="absolute top-5 z-20 backdrop-blur-md bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-2 text-xs font-medium text-slate-200 hover:text-white hover:border-slate-700"
          >
            <Settings className="w-3.5 h-3.5 text-teal-400" />
            <span>Панель</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Drop Zone при перетаскивании панели */}
      <AnimatePresence>
        {isDraggingPanel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              left: dragHoverSide === 'left' ? 20 : windowWidth - PANEL_SPACE,
            }}
            className="absolute top-5 bottom-5 w-80 rounded-3xl border-2 border-dashed border-teal-400/50 bg-teal-400/10 pointer-events-none z-10 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>

      {/* Боковая панель управления */}
      <motion.div
        drag="x"
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        onDragStart={() => setIsDraggingPanel(true)}
        onDrag={(_e, info) => {
          const isLeft = info.point.x < windowWidth / 2;
          setDragHoverSide(isLeft ? 'left' : 'right');
        }}
        onDragEnd={(_e, info) => {
          setIsDraggingPanel(false);
          const isLeft = info.point.x < windowWidth / 2;
          setPanelSide(isLeft ? 'left' : 'right');
        }}
        animate={{
          x: targetPanelX,
          scale: isDraggingPanel ? 1.02 : 1,
          rotate: isDraggingPanel ? (dragHoverSide === 'left' ? -1 : 1) : 0,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{
          width: PANEL_WIDTH,
          left: 0,
        }}
        className={`absolute top-5 bottom-5 z-20 pointer-events-auto flex flex-col ${isDraggingPanel ? 'shadow-2xl shadow-teal-500/10' : ''
          }`}
      >
        <div className="flex-1 backdrop-blur-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl overflow-y-auto flex flex-col gap-5 scrollbar-thin scrollbar-thumb-slate-700">
          {/* Шапка панели */}
          <div
            onPointerDown={e => dragControls.start(e)}
            className="flex items-center justify-between pb-3 border-b border-dashed border-slate-800 cursor-grab active:cursor-grabbing select-none group"
            title="Зажмите и перетащите панель влево или вправо"
          >
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-slate-500 group-hover:text-teal-400 transition-colors" />
              <span className="text-[11px] uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors font-medium">
                Параметры
              </span>
            </div>

            <div
              onPointerDown={e => e.stopPropagation()}
              className="flex items-center gap-1.5 cursor-default"
            >
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer hover:text-white mr-1">
                <input
                  type="checkbox"
                  checked={directed}
                  onChange={e => setDirected(e.target.checked)}
                  disabled={isPlaying}
                  className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-teal-400 focus:ring-0 disabled:opacity-50"
                />
                <span className="text-[11px]">Ориентир.</span>
              </label>

              <button
                onClick={() => setIsPanelOpen(false)}
                className="w-7 h-7 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                title="Свернуть панель"
              >
                {panelSide === 'right' ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Выбор алгоритма */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-medium">Алгоритм</label>
              <CustomSelect
                options={algorithms.map(algo => ({ value: algo.id, label: algo.name }))}
                value={selectedAlgorithm}
                onChange={setSelectedAlgorithm}
                placeholder="Выберите алгоритм"
                disabled={isPlaying}
              />
            </div>

            {/* Выбор начальной и целевой вершин */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <Flag className="w-3 h-3 text-emerald-400" />
                  <span>Старт</span>
                </label>
                <CustomSelect
                  options={nodeList.map(node => ({ value: node.id, label: node.label }))}
                  value={startNode}
                  onChange={setStartNode}
                  placeholder="(Выбрать)"
                  disabled={isPlaying}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <Target className="w-3 h-3 text-rose-400" />
                  <span>Цель</span>
                </label>
                <CustomSelect
                  options={nodeList.map(node => ({ value: node.id, label: node.label }))}
                  value={targetNode}
                  onChange={setTargetNode}
                  placeholder="(Выбрать)"
                  disabled={isPlaying}
                />
              </div>
            </div>

            {/* Скорость анимации */}
            {onSpeedChange && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Задержка шага</span>
                  <span className="text-teal-400">{speedMs} ms</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={speedMs}
                  onChange={e => onSpeedChange(Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                />
              </div>
            )}
          </div>

          {/* Карточка текущего шага в панели */}
          {currentStep && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs animate-in fade-in">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Шаг</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 font-bold text-[11px]">
                  #{currentStep.stepNumber} {stepsCount > 1 && `(${currentStepIndex + 1}/${stepsCount})`}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Статус</span>
                <span
                  className={`font-bold text-[11px] ${currentStep.status === 'COMPLETED'
                    ? 'text-emerald-400'
                    : currentStep.status === 'ERROR'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                    }`}
                >
                  {currentStep.status === 'COMPLETED'
                    ? 'Завершен'
                    : currentStep.status === 'ERROR'
                      ? 'Ошибка'
                      : 'В процессе'}
                </span>
              </div>

              {currentStep.activeNodeId && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">В фокусе</span>
                  <span className="text-sky-300 font-bold truncate max-w-[140px]">
                    {graphBuilderRef.current.nodes.get(currentStep.activeNodeId)?.label ||
                      currentStep.activeNodeId}
                  </span>
                </div>
              )}

              {currentStep.activeNodeId &&
                currentStep.distances[currentStep.activeNodeId] !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[11px]">Длина пути</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {currentStep.distances[currentStep.activeNodeId]}
                    </span>
                  </div>
                )}

              {currentStep.path && currentStep.path.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block mb-1.5 uppercase tracking-wider">
                    Маршрут ({currentStep.path.length})
                  </span>
                  <div className="flex flex-wrap items-center gap-1 max-h-24 overflow-y-auto p-1 bg-slate-900/90 rounded-lg border border-slate-800/80">
                    {currentStep.path.map((id, index) => (
                      <span key={index} className="inline-flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-[10px]">
                          {graphBuilderRef.current.nodes.get(id)?.label || id}
                        </span>
                        {index < currentStep.path.length - 1 && (
                          <span className="text-slate-500 text-[10px]">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Действия в панели (включая кнопки Импорта / Экспорта) */}
          <div className="mt-auto pt-3 border-t border-dashed border-slate-800 space-y-2">
            {/* Секция выбора раскладки графа */}
            <div className="mt-auto pt-3 border-t border-dashed border-slate-800 space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Тип размещения графа:
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleChangeLayout('force')}
                  disabled={isPlaying || isAutoLayouting || nodeList.length < 2}
                  className="py-1.5 bg-slate-800/80 hover:bg-slate-700 text-teal-300 border border-slate-700/80 rounded-xl text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-sm"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAutoLayouting ? 'animate-spin' : ''}`} />
                  <span>Силовой</span>
                </button>

                <button
                  onClick={() => handleChangeLayout('circular')}
                  disabled={isPlaying || nodeList.length < 2}
                  className="py-1.5 bg-slate-800/80 hover:bg-slate-700 text-sky-300 border border-slate-700/80 rounded-xl text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-sm"
                >
                  <span>Круговой</span>
                </button>

                <button
                  onClick={() => handleChangeLayout('grid')}
                  disabled={isPlaying || nodeList.length < 2}
                  className="py-1.5 bg-slate-800/80 hover:bg-slate-700 text-amber-300 border border-slate-700/80 rounded-xl text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-sm"
                >
                  <span>Сеточный</span>
                </button>

                <button
                  onClick={() => handleChangeLayout('hierarchical')}
                  disabled={isPlaying || nodeList.length < 2}
                  className="py-1.5 bg-slate-800/80 hover:bg-slate-700 text-rose-300 border border-slate-700/80 rounded-xl text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-sm"
                >
                  <span>Иерархия</span>
                </button>
              </div>
            </div>
            {/* Кнопка генерации случайного графа */}
            <button
              onClick={handleGenerateRandomGraph}
              disabled={isPlaying}
              className="w-full py-2 bg-slate-800/80 hover:bg-slate-700 text-sky-300 hover:text-sky-200 border border-slate-700/80 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Сгенерировать граф (N)</span>
            </button>
            {/* Кнопки Экспорта и Импорта */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleOpenExport}
                disabled={isPlaying}
                className="py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-[11px] font-medium rounded-lg border border-slate-700/80 transition-all flex items-center justify-center gap-1.5 disabled:opacity-30"
              >
                <Download className="w-3.5 h-3.5 text-teal-400" />
                <span>Экспорт</span>
              </button>

              <button
                onClick={handleOpenImport}
                disabled={isPlaying}
                className="py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-[11px] font-medium rounded-lg border border-slate-700/80 transition-all flex items-center justify-center gap-1.5 disabled:opacity-30"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Импорт</span>
              </button>
            </div>

            {hasStartedRun && (
              <button
                onClick={onReset}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700/80 transition-all flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить обход</span>
              </button>
            )}

            <button
              onClick={handleClearGraph}
              disabled={isPlaying}
              className="w-full py-1 text-slate-400 hover:text-rose-400 text-xs transition-colors disabled:opacity-30 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Очистить весь лист</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Нижний док инструментов */}
      <motion.div
        animate={{ left: centerLeftPosition }}
        transition={{ type: 'spring', stiffness: 240, damping: 26 }}
        style={{ x: '-50%' }}
        className="absolute bottom-6 z-20 pointer-events-auto flex flex-col items-center gap-2"
      >
        <AnimatePresence>
          {edgeStart && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.94 }}
              className="text-[11px] text-teal-300 bg-teal-950/90 border border-teal-500/40 py-1 px-3 rounded-full shadow-xl flex items-center gap-1.5"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>кликните на второй узел для создания ребра</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="backdrop-blur-xl bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl shadow-2xl flex items-center gap-1">
          {TOOLS.map(({ value, label, icon: ToolIcon }) => {
            const isActive = tool === value;
            return (
              <button
                key={value}
                onClick={() => {
                  setTool(value as Tool);
                  setEdgeStart(null);
                  setContextMenu(null);
                }}
                disabled={isPlaying}
                className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap disabled:opacity-40"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeToolPill"
                    className="absolute inset-0 bg-teal-400 rounded-xl shadow-md shadow-teal-500/20"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span
                  className={`relative z-10 transition-colors ${isActive ? 'text-slate-950 font-bold' : 'text-slate-300'
                    }`}
                >
                  <ToolIcon className="w-3.5 h-3.5" />
                </span>
                <span
                  className={`relative z-10 transition-colors ${isActive ? 'text-slate-950 font-bold' : 'text-slate-300'
                    }`}
                >
                  {label}
                </span>
              </button>
            );
          })}

          <AnimatePresence>
            {tool === 'addEdge' && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="overflow-hidden flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-800"
              >
                <span className="text-[11px] text-slate-400 whitespace-nowrap">вес:</span>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={edgeWeightInput}
                    onChange={e => setEdgeWeightInput(e.target.value)}
                    disabled={isPlaying}
                    className="w-14 pl-2 pr-4 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-xs font-medium text-teal-300 focus:outline-none focus:border-teal-400 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="absolute right-0.5 top-0 bottom-0 flex flex-col justify-center pr-0.5">
                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => {
                        const current = parseFloat(edgeWeightInput) || 0;
                        const next = Math.round((current + 0.5) * 10) / 10;
                        setEdgeWeightInput(next.toString());
                      }}
                      className="text-slate-400 hover:text-teal-300 active:scale-90 transition-colors p-0.5 leading-none rounded hover:bg-slate-700/60"
                    >
                      <ChevronRight className="w-2.5 h-2 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => {
                        const current = parseFloat(edgeWeightInput) || 0;
                        const next = Math.max(0.5, Math.round((current - 0.5) * 10) / 10);
                        setEdgeWeightInput(next.toString());
                      }}
                      className="text-slate-400 hover:text-teal-300 active:scale-90 transition-colors p-0.5 leading-none rounded hover:bg-slate-700/60"
                    >
                      <ChevronRight className="w-2.5 h-2 rotate-90" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Модальное окно Импорта / Экспорта JSON */}
      <AnimatePresence>
        {modalMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  {modalMode === 'export' ? (
                    <>
                      <Download className="w-4 h-4 text-teal-400" />
                      <span>Экспорт графа (JSON)</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-sky-400" />
                      <span>Импорт графа (JSON)</span>
                    </>
                  )}
                </span>
                <button
                  onClick={() => setModalMode(null)}
                  className="w-7 h-7 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400">
                  {modalMode === 'export'
                    ? 'Скопируйте JSON-структуру вашего графа:'
                    : 'Вставьте JSON-структуру графа для импорта:'}
                </label>
                <textarea
                  value={jsonInputText}
                  onChange={e => setJsonInputText(e.target.value)}
                  readOnly={modalMode === 'export'}
                  placeholder="Вставьте JSON сюда..."
                  className="w-full h-64 p-3 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xs text-teal-300 focus:outline-none focus:border-teal-400 resize-none scrollbar-thin scrollbar-thumb-slate-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                {modalMode === 'export' ? (
                  <>
                    <button
                      onClick={handleCopyJson}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-colors flex items-center gap-2"
                    >
                      {copyStatus ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copyStatus ? 'Скопировано!' : 'Копировать'}</span>
                    </button>
                    <button
                      onClick={() => setModalMode(null)}
                      className="px-4 py-2 bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold rounded-xl transition-colors"
                    >
                      Закрыть
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setModalMode(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleApplyImport}
                      className="px-4 py-2 bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold rounded-xl transition-colors flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Применить импорт</span>
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Контекстное меню */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 5 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{
              left: Math.min(contextMenu.screenX + 12, windowWidth - 200),
              top: Math.min(contextMenu.screenY + 12, window.innerHeight - 200),
            }}
            className="absolute z-50 backdrop-blur-2xl bg-slate-900/95 border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl min-w-[170px] flex flex-col gap-1 text-xs"
          >
            {contextMenu.type === 'node' && (
              <>
                <div className="px-2.5 py-1 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  Узел: {graphBuilderRef.current.nodes.get(contextMenu.id)?.label}
                </div>

                <button
                  onClick={() => handleRenameNode(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-left text-slate-200 hover:text-white hover:bg-slate-800/90 rounded-lg transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-400" />
                  <span>Переименовать</span>
                </button>

                <button
                  onClick={() => {
                    setStartNode(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-left text-slate-200 hover:text-white hover:bg-slate-800/90 rounded-lg transition-colors"
                >
                  <Flag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Выбрать началом</span>
                </button>

                <button
                  onClick={() => {
                    setTargetNode(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-left text-slate-200 hover:text-white hover:bg-slate-800/90 rounded-lg transition-colors"
                >
                  <Target className="w-3.5 h-3.5 text-rose-400" />
                  <span>Выбрать целью</span>
                </button>

                <div className="my-0.5 border-t border-slate-800" />

                <button
                  onClick={() => handleDeleteNode(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-left text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить</span>
                </button>
              </>
            )}

            {contextMenu.type === 'edge' && (
              <>
                <div className="px-2.5 py-1 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  Ребро
                </div>

                <button
                  onClick={() => handleEditEdgeWeight(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-left text-slate-200 hover:text-white hover:bg-slate-800/90 rounded-lg transition-colors"
                >
                  <Scale className="w-3.5 h-3.5 text-slate-400" />
                  <span>Изменить вес</span>
                </button>

                {directed && (
                  <button
                    onClick={() => handleReverseEdge(contextMenu.id)}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-left text-slate-200 hover:text-white hover:bg-slate-800/90 rounded-lg transition-colors"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
                    <span>Развернуть направление</span>
                  </button>
                )}

                <div className="my-0.5 border-t border-slate-800" />

                <button
                  onClick={() => handleDeleteEdge(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-left text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить</span>
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}