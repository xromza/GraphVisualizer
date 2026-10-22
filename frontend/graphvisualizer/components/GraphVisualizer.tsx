'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  motion,
  AnimatePresence,
  useDragControls,
  useMotionValue,
  useSpring,
} from 'framer-motion';
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
  Eye,
  EyeOff,
  CircleDot,
  Grid3X3,
  GitFork,
  Minus,
  Plus,
} from 'lucide-react';
import { GraphBuilder } from '@/lib/graph-builder';
import { GraphRenderer } from '@/lib/graph-renderer';
import { applyForceDirectedLayout } from '@/lib/force-layout';
import type { Node, Edge, AlgorithmStep, AlgorithmListEntry } from '@/lib/api';
import { getAlgorithms } from '@/lib/api';
import { applyCircularLayout, applyGridLayout, applyHierarchicalLayout } from '@/lib/layouts';

type Tool = 'select' | 'addNode' | 'addEdge' | 'delete';
type PanelSide = 'left' | 'right';
type LayoutType = 'force' | 'circular' | 'grid' | 'hierarchical';

const PANEL_SPACE = 340;
const PANEL_WIDTH = 320;

const APPLE_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const SPRING_SMOOTH = { type: 'spring', stiffness: 320, damping: 32, mass: 1 } as const;
const SPRING_SNAPPY = { type: 'spring', stiffness: 500, damping: 36, mass: 0.8 } as const;
const SIZE_SPRING = { stiffness: 380, damping: 38, mass: 0.9 };

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface SelectOption {
  value: string;
  label: string;
}

const formatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/* =========================================================================
   Apple HIG primitives
   ========================================================================= */

/** Нативный iOS Switch (51×31, зелёный во включённом состоянии) */
function IOSSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full px-[2px] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/60 disabled:opacity-40 ${
        checked ? 'bg-[#34C759]' : 'bg-[rgba(120,120,128,0.32)]'
      }`}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 550, damping: 34 }}
        className="pointer-events-none block h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
      />
    </button>
  );
}

function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8E8E93] ${className}`}
    >
      {children}
    </div>
  );
}

function Hairline({ className = '' }: { className?: string }) {
  return <div className={`h-px w-full bg-[rgba(84,84,88,0.6)] ${className}`} />;
}

function ActiveToolPill({ x, width }: { x: number; width: number }) {
  const springConfig = { stiffness: 420, damping: 36, mass: 0.8 };
  const motionX = useSpring(useMotionValue(x), springConfig);
  const motionWidth = useSpring(useMotionValue(width), springConfig);

  useEffect(() => {
    motionX.set(x);
    motionWidth.set(width);
  }, [x, width, motionX, motionWidth]);

  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-y-0.5 left-0 z-0 rounded-[14px] bg-[#0A84FF] shadow-[0_4px_14px_rgba(10,132,255,0.45)] pointer-events-none"
      style={{ x: motionX, width: motionWidth }}
    />
  );
}

function CollapsibleX({
  children,
  gap = 8,
}: {
  children: React.ReactNode;
  gap?: number;
}) {
  const [clip, setClip] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, width: 0, marginLeft: -gap, filter: 'blur(4px)' }}
      animate={{
        opacity: 1,
        width: 'auto',
        marginLeft: 0,
        filter: 'blur(0px)',
        transition: {
          opacity: { duration: 0.25, ease: APPLE_EASE, delay: 0.05 },
          filter: { duration: 0.25, ease: APPLE_EASE, delay: 0.05 },
          width: { duration: 0.38, ease: APPLE_EASE },
          marginLeft: { duration: 0.38, ease: APPLE_EASE },
        },
      }}
      exit={{
        opacity: 0,
        width: 0,
        marginLeft: -gap,
        filter: 'blur(4px)',
        transition: {
          opacity: { duration: 0.15, ease: 'easeOut' },
          filter: { duration: 0.15, ease: 'easeOut' },
          width: { duration: 0.3, ease: APPLE_EASE },
          marginLeft: { duration: 0.3, ease: APPLE_EASE },
        },
      }}
      onAnimationStart={() => setClip(true)}
      onAnimationComplete={() => setClip(false)}
      style={{ overflow: clip ? 'hidden' : 'visible', flexShrink: 0 }}
      className="z-30"
    >
      {children}
    </motion.div>
  );
}

function CollapsibleY({
  children,
  marginOpen = 0,
  marginClosed = 0,
}: {
  children: React.ReactNode;
  marginOpen?: number;
  marginClosed?: number;
}) {
  const [clip, setClip] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginTop: marginClosed, filter: 'blur(4px)' }}
      animate={{
        opacity: 1,
        height: 'auto',
        marginTop: marginOpen,
        filter: 'blur(0px)',
        transition: {
          opacity: { duration: 0.25, ease: APPLE_EASE, delay: 0.04 },
          filter: { duration: 0.25, ease: APPLE_EASE, delay: 0.04 },
          height: { duration: 0.38, ease: APPLE_EASE },
          marginTop: { duration: 0.38, ease: APPLE_EASE },
        },
      }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: marginClosed,
        filter: 'blur(4px)',
        transition: {
          opacity: { duration: 0.15, ease: 'easeOut' },
          filter: { duration: 0.15, ease: 'easeOut' },
          height: { duration: 0.3, ease: APPLE_EASE },
          marginTop: { duration: 0.3, ease: APPLE_EASE },
        },
      }}
      onAnimationStart={() => setClip(true)}
      onAnimationComplete={() => setClip(false)}
      style={{ overflow: clip ? 'hidden' : 'visible' }}
    >
      {children}
    </motion.div>
  );
}

function MorphingContainer({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const width = useSpring(0, SIZE_SPRING);
  const height = useSpring(0, SIZE_SPRING);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);

  useIsoLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!readyRef.current) {
        width.jump(w);
        height.jump(h);
        readyRef.current = true;
        setReady(true);
      } else {
        width.set(w);
        height.set(h);
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  return (
    <motion.div
      style={{
        ...(ready ? { width, height } : {}),
        overflowX: 'clip',
        overflowY: 'visible',
      }}
      className={className}
    >
      <div ref={innerRef} className={innerClassName}>
        {children}
      </div>
    </motion.div>
  );
}

function CenteredAt({
  x,
  className = '',
  children,
}: {
  x: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ x }}
      transition={SPRING_SMOOTH}
      className={`absolute left-0 w-0 flex justify-center pointer-events-none ${className}`}
    >
      {children}
    </motion.div>
  );
}

function CustomSelect({
  options,
  value,
  onChange,
  placeholder = '(Выбрать)',
  disabled = false,
}: {
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyles, setDropdownStyles] = useState<{
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    maxHeight: string;
  }>({ maxHeight: '12rem' });
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as any)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('pointerdown', handleOutsideClick);
      
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const spaceRight = window.innerWidth - rect.left;
        const dropdownWidth = Math.max(rect.width, 180);

        const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
        const alignRight = spaceRight < dropdownWidth;

        setDropdownStyles({
          [openUpward ? 'bottom' : 'top']: openUpward ? `${window.innerHeight - rect.top + 6}px` : 'calc(100% + 6px)',
          [alignRight ? 'right' : 'left']: '0px',
          maxHeight: `${Math.min(openUpward ? spaceAbove - 16 : spaceBelow - 16, 220)}px`,
        });
      }
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
        className={`w-full px-3 py-2 bg-[#2C2C2E] rounded-[10px] text-[13px] font-medium text-white flex items-center justify-between transition-all duration-200 select-none disabled:opacity-40 disabled:cursor-not-allowed active:bg-[#3A3A3C] ${
          isOpen ? 'ring-2 ring-[#0A84FF]/50' : ''
        }`}
      >
        <span className="truncate pr-2">
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-[#8E8E93]">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isOpen ? 'rotate-180 text-[#0A84FF]' : 'text-[#8E8E93]'
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { duration: 0.2, ease: APPLE_EASE },
            }}
            exit={{
              opacity: 0,
              y: -4,
              scale: 0.98,
              transition: { duration: 0.12, ease: 'easeIn' },
            }}
            style={{ 
              position: 'absolute',
              top: dropdownStyles.top,
              bottom: dropdownStyles.bottom,
              left: dropdownStyles.left,
              right: dropdownStyles.right,
              maxHeight: dropdownStyles.maxHeight,
              transformOrigin: dropdownStyles.bottom ? 'bottom center' : 'top center'
            }}
            className="z-50 backdrop-blur-2xl bg-[#2C2C2E]/95 border border-white/[0.1] rounded-[13px] p-1 shadow-[0_12px_36px_rgba(0,0,0,0.5)] overflow-y-auto scrollbar-none flex flex-col gap-0.5 text-[13px] min-w-[180px]"
          >
            {placeholder && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-[8px] text-left transition-colors flex items-center justify-between ${
                  value === ''
                    ? 'text-[#0A84FF] font-semibold'
                    : 'text-[#8E8E93] hover:text-white hover:bg-white/[0.08]'
                }`}
              >
                <span>{placeholder}</span>
                {value === '' && <Check className="w-3.5 h-3.5 text-[#0A84FF]" />}
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
                  className={`w-full px-2.5 py-1.5 rounded-[8px] text-left transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'text-[#0A84FF] font-semibold'
                      : 'text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#0A84FF] shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CollapsibleRouteDisplay({
  pathIds,
  graphBuilder,
}: {
  pathIds: string[];
  graphBuilder: GraphBuilder;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const labels = pathIds.map(id => graphBuilder.nodes.get(id)?.label || id);
  const fullText = labels.join(' → ');

  return (
    <div className="flex items-start gap-1.5 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-[rgba(84,84,88,0.5)]">
      <span className="text-[#8E8E93] text-[11px] shrink-0 font-medium mt-0.5">Маршрут:</span>
      <div className="relative flex items-start gap-2">
        <div 
          className={`text-[#30D158] font-medium text-[11px] leading-tight select-text break-words transition-all duration-300 ${
            isExpanded ? 'max-w-[280px]' : 'max-w-[150px] truncate'
          }`}
        >
          {fullText}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[#8E8E93] hover:text-white transition-colors p-0.5 shrink-0 bg-[#2C2C2E] rounded-[5px]"
          title={isExpanded ? "Свернуть путь" : "Посмотреть весь путь"}
        >
          {isExpanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

const LAYOUT_OPTIONS = [
  { id: 'force' as const, label: 'Сила', icon: Sparkles },
  { id: 'circular' as const, label: 'Круг', icon: CircleDot },
  { id: 'grid' as const, label: 'Сетка', icon: Grid3X3 },
  { id: 'hierarchical' as const, label: 'Дерево', icon: GitFork },
];

/* =========================================================================
   Main Component: GraphVisualizer
   ========================================================================= */

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

  const [currentLayout, setCurrentLayout] = useState<LayoutType | null>(null);

  const [modalMode, setModalMode] = useState<'export' | 'import' | null>(null);
  const [jsonInputText, setJsonInputText] = useState('');
  const [copyStatus, setCopyStatus] = useState(false);

  const [isAutoLayouting, setIsAutoLayouting] = useState(false);
  const layoutCancelRef = useRef<(() => void) | null>(null);
  const layoutAnimCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      layoutCancelRef.current?.();
      layoutAnimCancelRef.current?.();
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

    rendererRef.current.setGraph(
      graphBuilderRef.current.nodes,
      graphBuilderRef.current.edges,
      directed,
      graphBuilderRef.current.exitingNodes,
      graphBuilderRef.current.exitingEdges
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

  const handleChangeLayout = (layoutType: LayoutType) => {
    if (isPlaying || !canvasRef.current || !rendererRef.current) return;
    setCurrentLayout(layoutType);
    setContextMenu(null);

    layoutAnimCancelRef.current?.();
    layoutAnimCancelRef.current = null;

    const rect = canvasRef.current.getBoundingClientRect();
    let targetScreenX = rect.width / 2;
    if (isPanelOpen) {
      targetScreenX =
        panelSide === 'right' ? (rect.width - PANEL_SPACE) / 2 : (rect.width + PANEL_SPACE) / 2;
    }
    const center = rendererRef.current.screenToWorld(targetScreenX, rect.height / 2);

    const updateAndPreserveVisuals = () => {
      if (rendererRef.current) {
        rendererRef.current.setVisualizationState(currentStep || null);
        rendererRef.current.render(selectedNodes);
      }
    };

    if (layoutType === 'force') {
      setIsAutoLayouting(true);
      layoutCancelRef.current = applyForceDirectedLayout(
        graphBuilderRef.current.nodes,
        graphBuilderRef.current.edges,
        center,
        {
          iterations: 60,
          onTick: () => updateAndPreserveVisuals(),
          onDone: () => {
            setGraphVersion(v => v + 1);
            updateAndPreserveVisuals();
            setIsAutoLayouting(false);
            layoutCancelRef.current = null;
          },
        }
      );
    } else {
      const tempNodes = new Map<string, Node>();
      graphBuilderRef.current.nodes.forEach((n, id) => {
        tempNodes.set(id, { ...n });
      });

      if (layoutType === 'circular') {
        applyCircularLayout(tempNodes, center, Math.min(rect.width, rect.height) * 0.3);
      } else if (layoutType === 'grid') {
        applyGridLayout(tempNodes, center, 110);
      } else if (layoutType === 'hierarchical') {
        applyHierarchicalLayout(tempNodes, graphBuilderRef.current.edges, startNode || null, center, 130, 150);
      }

      const getTargetCoords = () => {
        const targets = new Map<string, { x: number; y: number }>();
        tempNodes.forEach((n, id) => {
          targets.set(id, { x: n.x, y: n.y });
        });
        return targets;
      };

      layoutAnimCancelRef.current = animateLayoutTransition(
        graphBuilderRef.current.nodes,
        getTargetCoords,
        () => updateAndPreserveVisuals(),
        650,
        () => {
          setGraphVersion(v => v + 1);
          updateAndPreserveVisuals();
          layoutAnimCancelRef.current = null;
        }
      );
    }
  };

  useEffect(() => {
    if (!rendererRef.current) return;
    const renderer = rendererRef.current;

    renderer.isInteractive = tool === 'select' && !isPlaying;
    renderer.onNodeMove = () => {
      setContextMenu(null);
      setCurrentLayout(null);
    };

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
        directed,
        graphBuilderRef.current.exitingNodes,
        graphBuilderRef.current.exitingEdges
      );
      rendererRef.current.setVisualizationState(currentStep || null);
      rendererRef.current.render(selectedNodes);
    }
  }, [directed, graphVersion, currentStep]);

  const redraw = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.setVisualizationState(currentStep || null);
      rendererRef.current.render(selectedNodes);
    }
  }, [selectedNodes, currentStep]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlaying) return;

      if (mouseDownPosRef.current) {
        const dx = e.clientX - mouseDownPosRef.current.x;
        const dy = e.clientY - mouseDownPosRef.current.y;
        if (Math.hypot(dx, dy) > 5) return;
      }

      const canvas = canvasRef.current;
      if (!canvas || !rendererRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const { x, y } = rendererRef.current.screenToWorld(screenX, screenY);

      const clickedNode = graphBuilderRef.current.findNodeAt(x, y);
      const clickedEdge = !clickedNode ? (rendererRef.current as any).getEdgeAt(x, y) : null;

      if (tool === 'addNode' && !clickedNode) {
        graphBuilderRef.current.addNode(x, y);
        setContextMenu(null);
        setCurrentLayout(null);
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
          setCurrentLayout(null);
          setGraphVersion(v => v + 1);
          redraw();
        }
      } else if (tool === 'delete') {
        setContextMenu(null);
        if (clickedNode) {
          graphBuilderRef.current.removeNode(clickedNode.id);
          if (startNode === clickedNode.id) setStartNode('');
          if (targetNode === clickedNode.id) setTargetNode('');
        } else if (clickedEdge) {
          graphBuilderRef.current.removeEdge(clickedEdge.id);
        }

        setCurrentLayout(null);
        setGraphVersion(v => v + 1);
        rendererRef.current?.setGraph(
          graphBuilderRef.current.nodes,
          graphBuilderRef.current.edges,
          directed,
          graphBuilderRef.current.exitingNodes,
          graphBuilderRef.current.exitingEdges
        );
        redraw();
      }
    },
    [tool, edgeStart, isPlaying, edgeWeightInput, startNode, targetNode, directed, redraw]
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
    setCurrentLayout(null);
    setGraphVersion(v => v + 1);

    rendererRef.current?.setGraph(
      graphBuilderRef.current.nodes,
      graphBuilderRef.current.edges,
      directed,
      graphBuilderRef.current.exitingNodes,
      graphBuilderRef.current.exitingEdges
    );
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
    duration = 650,
    onComplete?: () => void
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
      const ease = 1 - Math.pow(1 - progress, 4);

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
      } else {
        onComplete?.();
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }

  const handleReverseEdge = (edgeId: string) => {
    const edge = graphBuilderRef.current.edges.find(e => e.id === edgeId);
    if (edge) {
      const temp = edge.sourceId;
      edge.sourceId = edge.targetId;
      edge.targetId = temp;
      setCurrentLayout(null);
      setGraphVersion(v => v + 1);
      redraw();
    }
    setContextMenu(null);
  };

  const handleDeleteEdge = (edgeId: string) => {
    graphBuilderRef.current.removeEdge(edgeId);
    setContextMenu(null);
    setCurrentLayout(null);
    setGraphVersion(v => v + 1);

    rendererRef.current?.setGraph(
      graphBuilderRef.current.nodes,
      graphBuilderRef.current.edges,
      directed,
      graphBuilderRef.current.exitingNodes,
      graphBuilderRef.current.exitingEdges
    );
    redraw();
  };

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
    setCurrentLayout(null);
    setGraphVersion(v => v + 1);
    onReset?.();
    redraw();
  }, [onReset, redraw]);

  const handleOpenExport = () => {
    setContextMenu(null);
    const rawNodes = graphBuilderRef.current.getNodesAsRecord();
    const nodesArray = Object.values(rawNodes);
    const exportData = {
      nodes: nodesArray,
      edges: graphBuilderRef.current.edges,
      directed: directed,
    };
    setJsonInputText(JSON.stringify(exportData, null, 2));
    setModalMode('export');
  };

  const handleOpenImport = () => {
    setContextMenu(null);
    setJsonInputText('');
    setModalMode('import');
  };

  const handleApplyImport = () => {
    try {
      const parsed = JSON.parse(jsonInputText);
      if (!parsed.nodes || !Array.isArray(parsed.nodes) || !parsed.edges || !Array.isArray(parsed.edges)) {
        alert('Неверный формат JSON. Ожидаются поля "nodes" (массив) и "edges" (массив).');
        return;
      }

      graphBuilderRef.current.clear();

      parsed.nodes.forEach((n: any) => {
        if (n.id && n.label && typeof n.x === 'number' && typeof n.y === 'number') {
          graphBuilderRef.current.nodes.set(n.id, { id: n.id, label: n.label, x: n.x, y: n.y });
        }
      });

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
      setCurrentLayout(null);
      setGraphVersion(v => v + 1);
      onReset?.();
      redraw();
      setModalMode(null);
    } catch (err) {
      alert('Ошибка при разборе JSON. Проверьте правильность синтаксиса.');
    }
  };

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
    setCurrentLayout(null);
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

  const centerX = useMemo(() => {
    if (!isPanelOpen) return windowWidth / 2;
    return panelSide === 'right'
      ? (windowWidth - PANEL_SPACE) / 2
      : (windowWidth + PANEL_SPACE) / 2;
  }, [isPanelOpen, panelSide, windowWidth]);

  const targetPanelX = useMemo(() => {
    if (!isPanelOpen) {
      return panelSide === 'right' ? windowWidth + 50 : -370;
    }
    return panelSide === 'right' ? Math.max(windowWidth - PANEL_SPACE, 20) : 20;
  }, [isPanelOpen, panelSide, windowWidth]);

  const toolRowRef = useRef<HTMLDivElement>(null);
  const toolButtonRefs = useRef<Partial<Record<Tool, HTMLButtonElement | null>>>({});

  const [pillBounds, setPillBounds] = useState({
    x: 0,
    width: 0,
  });

  useLayoutEffect(() => {
    const row = toolRowRef.current;
    const button = toolButtonRefs.current[tool];

    if (!row || !button) return;

    const measure = () => {
      const rowRect = row.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();

      setPillBounds({
        x: buttonRect.left - rowRect.left,
        width: buttonRect.width,
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(button);

    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [tool]);

  function generateRandomConnectedGraph(nodeCount: number, width = 900, height = 700) {
    const nodes = new Map<string, Node>();
    const edges: Edge[] = [];

    for (let i = 1; i <= nodeCount; i++) {
      const id = `node-${i}`;
      nodes.set(id, {
        id,
        label: `Узел ${i}`,
        x: 80 + Math.random() * (width - 160),
        y: 80 + Math.random() * (height - 160),
      });
    }

    const nodeIds = Array.from(nodes.keys());

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const sourceId = nodeIds[i];
      const targetId = nodeIds[i + 1];
      edges.push({
        id: `edge-connect-${i}`,
        sourceId,
        targetId,
        weight: Math.round((1 + Math.random() * 9) * 10) / 10,
      });
    }

    const extraEdgesCount = Math.floor(nodeCount * 1.5);
    let edgeCounter = 0;

    for (let k = 0; k < extraEdgesCount; k++) {
      const sourceIdx = Math.floor(Math.random() * nodeCount);
      let targetIdx = Math.floor(Math.random() * nodeCount);

      if (sourceIdx === targetIdx) continue;

      const sourceId = nodeIds[sourceIdx];
      const targetId = nodeIds[targetIdx];

      const exists = edges.some(
        e =>
          (e.sourceId === sourceId && e.targetId === targetId) ||
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

  const TOOLS = [
    { value: 'select', label: 'Выбор', icon: MousePointer },
    { value: 'addNode', label: 'Узел', icon: CirclePlus },
    { value: 'addEdge', label: 'Ребро', icon: ArrowRight },
    { value: 'delete', label: 'Удалить', icon: Trash2 },
  ] satisfies {
    value: Tool;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white select-none font-sans antialiased">
      <canvas
        ref={canvasRef}
        onMouseDown={e => {
          mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={handleCanvasClick}
        className={`absolute inset-0 w-full h-full z-0 ${
          tool === 'addNode'
            ? 'cursor-crosshair'
            : tool === 'delete'
              ? 'cursor-not-allowed'
              : tool === 'addEdge'
                ? 'cursor-cell'
                : 'cursor-default'
        }`}
      />

      {/* Верхний бар управления */}
      <CenteredAt x={centerX} className="top-4 z-20">
        <MorphingContainer
          className="pointer-events-auto shrink-0 box-content backdrop-blur-2xl bg-[#1C1C1E]/85 border border-white/[0.08] rounded-[18px] shadow-[0_12px_32px_rgba(0,0,0,0.45)] text-xs"
          innerClassName="relative w-max max-w-[calc(100vw-3rem)] p-1.5"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {!hasStartedRun ? (
              <motion.div
                key="pre-run-bar"
                initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                  transition: { duration: 0.3, ease: APPLE_EASE },
                }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  filter: 'blur(6px)',
                  transition: { duration: 0.16, ease: 'easeOut' },
                }}
                className="flex items-center gap-2"
              >
                <AnimatePresence initial={false}>
                  {!isPanelOpen && (
                    <CollapsibleX key="algo-select-player" gap={8}>
                      <div className="w-48">
                        <CustomSelect
                          options={algorithms.map(algo => ({ value: algo.id, label: algo.name }))}
                          value={selectedAlgorithm}
                          onChange={setSelectedAlgorithm}
                          placeholder="Алгоритм"
                          disabled={isPlaying}
                        />
                      </div>
                    </CollapsibleX>
                  )}
                </AnimatePresence>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_SNAPPY}
                  onClick={handleRunAlgorithm}
                  disabled={!selectedAlgorithm || !startNode || !targetNode}
                  className="px-4 py-2 rounded-[12px] bg-[#0A84FF] hover:bg-[#3395FF] active:bg-[#0A84FF] text-white font-semibold flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[13px] shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Запустить</span>
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="player-hud-container"
                initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                  transition: { duration: 0.3, ease: APPLE_EASE },
                }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  filter: 'blur(6px)',
                  transition: { duration: 0.16, ease: 'easeOut' },
                }}
                className="flex flex-col"
              >
                <div className="flex items-center gap-2 p-0.5">
                  <div className="relative w-7 h-7 shrink-0">
                    <AnimatePresence initial={false}>
                      {isPlaying ? (
                        <motion.button
                          key="stop"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.14 } }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_SNAPPY}
                          type="button"
                          onClick={onStop}
                          className="absolute inset-0 rounded-[9px] bg-[#FF453A] text-white hover:bg-[#FF6961] font-bold flex items-center justify-center transition-colors"
                        >
                          <Square className="w-3 h-3 fill-current" />
                        </motion.button>
                      ) : (
                        <motion.button
                          key="restart"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.14 } }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_SNAPPY}
                          type="button"
                          onClick={handleRunAlgorithm}
                          disabled={!selectedAlgorithm || !startNode || !targetNode}
                          className="absolute inset-0 rounded-[9px] bg-[#0A84FF] text-white hover:bg-[#3395FF] font-bold flex items-center justify-center transition-colors disabled:opacity-30"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center gap-0.5 px-1 shrink-0">
                    {[
                      { Icon: SkipBack, title: 'В начало', action: () => onStepChange?.(0), disabled: currentStepIndex <= 0 },
                      { Icon: ChevronLeft, title: 'Шаг назад', action: () => onStepChange?.(currentStepIndex - 1), disabled: currentStepIndex <= 0 },
                      { Icon: ChevronRight, title: 'Шаг вперед', action: () => onStepChange?.(currentStepIndex + 1), disabled: currentStepIndex >= stepsCount - 1 },
                      { Icon: SkipForward, title: 'В конец', action: () => onStepChange?.(stepsCount - 1), disabled: currentStepIndex >= stepsCount - 1 },
                    ].map(({ Icon, title, action, disabled }, idx) => (
                      <motion.button
                        key={idx}
                        title={title}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.9 }}
                        transition={SPRING_SNAPPY}
                        type="button"
                        onClick={action}
                        disabled={disabled}
                        className="w-7 h-7 rounded-[8px] text-[#8E8E93] hover:text-white hover:bg-white/[0.08] flex items-center justify-center disabled:opacity-20 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </motion.button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    {stepsCount > 1 && (
                      <CollapsibleX key="step-slider" gap={10}>
                        <div className="flex items-center gap-2 pl-0.5 pr-1">
                          <input
                            type="range"
                            min="0"
                            max={stepsCount - 1}
                            value={currentStepIndex}
                            onChange={e => onStepChange?.(Number(e.target.value))}
                            className="w-20 sm:w-28 h-1 bg-[#3A3A3C] rounded-full appearance-none cursor-pointer accent-[#0A84FF] focus:outline-none"
                          />
                          <span className="text-[11px] font-mono text-[#0A84FF] shrink-0 font-semibold">
                            {currentStepIndex + 1}/{stepsCount}
                          </span>
                        </div>
                      </CollapsibleX>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {!isPanelOpen && (
                      <CollapsibleX key="player-algo-select" gap={10}>
                        <div className="w-48">
                          <CustomSelect
                            options={algorithms.map(algo => ({ value: algo.id, label: algo.name }))}
                            value={selectedAlgorithm}
                            onChange={setSelectedAlgorithm}
                            placeholder="Алгоритм"
                            disabled={isPlaying}
                          />
                        </div>
                      </CollapsibleX>
                    )}
                  </AnimatePresence>

                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.9 }}
                    transition={SPRING_SNAPPY}
                    type="button"
                    onClick={onReset}
                    className="w-7 h-7 rounded-[8px] text-[#8E8E93] hover:text-[#FF453A] hover:bg-[#FF453A]/15 flex items-center justify-center transition-colors shrink-0"
                    title="Сбросить обход"
                  >
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                </div>

                <AnimatePresence initial={false}>
                  {!isPanelOpen && currentStep && (
                    <CollapsibleY key="step-info" marginOpen={6} marginClosed={0}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[rgba(84,84,88,0.5)] pt-2 px-1 text-xs">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[#8E8E93] text-[11px] font-medium">Статус:</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              currentStep.status === 'COMPLETED'
                                ? 'bg-[#30D158]/15 text-[#30D158]'
                                : currentStep.status === 'ERROR'
                                  ? 'bg-[#FF453A]/15 text-[#FF453A]'
                                  : 'bg-[#FF9F0A]/15 text-[#FF9F0A]'
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
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[#8E8E93] text-[11px] font-medium">Фокус:</span>
                            <span className="text-white font-semibold truncate max-w-[140px]">
                              {graphBuilderRef.current.nodes.get(currentStep.activeNodeId)?.label ||
                                currentStep.activeNodeId}
                            </span>
                          </div>
                        )}

                        {currentStep.activeNodeId &&
                          currentStep.distances[currentStep.activeNodeId] !== undefined && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[#8E8E93] text-[11px] font-medium">Длина:</span>
                              <span className="text-[#30D158] font-mono font-semibold">
                                {formatter.format(currentStep.distances[currentStep.activeNodeId])}
                              </span>
                            </div>
                          )}

                        {currentStep.path && currentStep.path.length > 0 && (
                          <CollapsibleRouteDisplay pathIds={currentStep.path} graphBuilder={graphBuilderRef.current} />
                        )}
                      </div>
                    </CollapsibleY>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </MorphingContainer>
      </CenteredAt>

      {/* Кнопка вызова свернутой панели */}
      <AnimatePresence initial={false}>
        {!isPanelOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
            animate={{
              opacity: 1,
              scale: 1,
              filter: 'blur(0px)',
              transition: { duration: 0.28, ease: APPLE_EASE, delay: 0.1 },
            }}
            exit={{
              opacity: 0,
              scale: 0.92,
              filter: 'blur(4px)',
              transition: { duration: 0.14, ease: 'easeOut' },
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsPanelOpen(true)}
            className={`absolute top-4 z-20 backdrop-blur-2xl bg-[#1C1C1E]/85 border border-white/[0.08] rounded-[14px] px-3.5 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.4)] flex items-center gap-2 text-[13px] font-semibold text-white hover:bg-[#2C2C2E]/85 transition-all ${
              panelSide === 'left' ? 'left-4' : 'right-4'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-[#0A84FF]" />
            <span>Панель</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Drop Zone при перетаскивании панели */}
      <AnimatePresence>
        {isDraggingPanel && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.98,
              left: dragHoverSide === 'left' ? 20 : windowWidth - PANEL_SPACE,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              left: dragHoverSide === 'left' ? 20 : windowWidth - PANEL_SPACE,
            }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: 'easeOut' } }}
            transition={SPRING_SMOOTH}
            className="absolute top-4 bottom-4 w-80 rounded-[24px] border-2 border-[#0A84FF]/40 bg-[#0A84FF]/5 pointer-events-none z-10 backdrop-blur-[2px]"
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
          opacity: isPanelOpen ? 1 : 0,
          scale: isDraggingPanel ? 1.015 : 1,
          rotate: isDraggingPanel ? (dragHoverSide === 'left' ? -0.8 : 0.8) : 0,
        }}
        initial={{
          x: windowWidth + 50,
          opacity: 0,
        }}
        transition={{
          ...SPRING_SMOOTH,
          opacity: { duration: isPanelOpen ? 0.28 : 0.16, ease: APPLE_EASE },
        }}
        style={{
          width: PANEL_WIDTH,
          left: 0,
          pointerEvents: isPanelOpen ? 'auto' : 'none',
        }}
        className={`absolute top-4 bottom-4 z-20 flex flex-col rounded-[22px] bg-[#1C1C1E]/85 backdrop-blur-2xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden ${
          isDraggingPanel ? 'ring-1 ring-[#0A84FF]/30' : ''
        }`}
      >
        {/* Grabber и заголовок */}
        <div
          onPointerDown={e => dragControls.start(e)}
          className="pt-2.5 px-4 pb-3 border-b border-[rgba(84,84,88,0.6)] cursor-grab active:cursor-grabbing select-none group"
          title="Зажмите и перетащите панель влево или вправо"
        >
          <div className="w-9 h-[5px] rounded-full bg-[#8E8E93]/40 mx-auto group-hover:bg-[#8E8E93]/60 transition-colors" />

          <div className="flex items-center justify-between mt-2.5">
            <span className="text-[15px] font-semibold text-white tracking-tight">Параметры</span>

            <div
              onPointerDown={e => e.stopPropagation()}
              className="flex items-center gap-2.5 cursor-default"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#8E8E93] font-medium">Ориентир.</span>
                <IOSSwitch checked={directed} onChange={setDirected} disabled={isPlaying} />
              </div>

              <button
                onClick={() => setIsPanelOpen(false)}
                className="w-7 h-7 rounded-full bg-[rgba(142,142,147,0.26)] active:scale-95 flex items-center justify-center text-[#8E8E93] hover:text-white transition-all"
                aria-label="Свернуть панель"
              >
                {panelSide === 'right' ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Контент: плоские секции с разделителями */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SectionLabel className="mb-1.5">Алгоритм</SectionLabel>
          <CustomSelect
            options={algorithms.map(algo => ({ value: algo.id, label: algo.name }))}
            value={selectedAlgorithm}
            onChange={setSelectedAlgorithm}
            placeholder="Выберите алгоритм"
            disabled={isPlaying}
          />

          <Hairline className="my-3.5" />

          <SectionLabel className="mb-1.5">Вершины</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[12px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1 px-0.5">
                <Flag className="w-3 h-3 text-[#30D158]" />
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

            <div>
              <label className="text-[12px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1 px-0.5">
                <Target className="w-3 h-3 text-[#FF453A]" />
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

          {onSpeedChange && (
            <>
              <Hairline className="my-3.5" />
              <div className="flex justify-between items-center mb-2">
                <SectionLabel>Задержка шага</SectionLabel>
                <span className="text-[12px] font-semibold text-[#0A84FF]">{speedMs} мс</span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={speedMs}
                onChange={e => onSpeedChange(Number(e.target.value))}
                className="w-full h-1 bg-[#3A3A3C] rounded-full appearance-none cursor-pointer accent-[#0A84FF] focus:outline-none"
              />
            </>
          )}

          {/* Информация о текущем шаге (плоская секция) */}
          <AnimatePresence initial={false}>
            {currentStep && (
              <CollapsibleY key="panel-step-section" marginOpen={0} marginClosed={0}>
                <Hairline className="my-3.5" />
                <SectionLabel className="mb-1">Текущий шаг</SectionLabel>

                <div className="divide-y divide-[rgba(84,84,88,0.4)]">
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[13px] text-[#8E8E93]">Шаг</span>
                    <span className="text-[13px] font-semibold text-white">
                      #{currentStep.stepNumber}
                      {stepsCount > 1 && (
                        <span className="text-[#8E8E93] font-normal"> ({currentStepIndex + 1}/{stepsCount})</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[13px] text-[#8E8E93]">Статус</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          currentStep.status === 'COMPLETED'
                            ? 'bg-[#30D158]'
                            : currentStep.status === 'ERROR'
                              ? 'bg-[#FF453A]'
                              : 'bg-[#FF9F0A] animate-pulse'
                        }`}
                      />
                      <span
                        className={`text-[13px] font-semibold ${
                          currentStep.status === 'COMPLETED'
                            ? 'text-[#30D158]'
                            : currentStep.status === 'ERROR'
                              ? 'text-[#FF453A]'
                              : 'text-[#FF9F0A]'
                        }`}
                      >
                        {currentStep.status === 'COMPLETED'
                          ? 'Завершен'
                          : currentStep.status === 'ERROR'
                            ? 'Ошибка'
                            : 'В процессе'}
                      </span>
                    </span>
                  </div>

                  {currentStep.activeNodeId && (
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-[13px] text-[#8E8E93]">В фокусе</span>
                      <span className="text-[13px] font-semibold text-white truncate max-w-[160px]">
                        {graphBuilderRef.current.nodes.get(currentStep.activeNodeId)?.label ||
                          currentStep.activeNodeId}
                      </span>
                    </div>
                  )}

                  {currentStep.activeNodeId &&
                    currentStep.distances[currentStep.activeNodeId] !== undefined && (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-[13px] text-[#8E8E93]">Длина пути</span>
                        <span className="text-[13px] font-mono font-semibold text-[#30D158]">
                          {formatter.format(currentStep.distances[currentStep.activeNodeId])}
                        </span>
                      </div>
                    )}
                </div>

                {currentStep.path && currentStep.path.length > 0 && (
                  <div className="pt-2.5">
                    <SectionLabel className="mb-1.5">
                      Маршрут ({currentStep.path.length})
                    </SectionLabel>
                    <div className="flex flex-wrap items-center gap-1">
                      {currentStep.path.map((id, index) => (
                        <span key={index} className="inline-flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded-[7px] bg-[#30D158]/15 text-[#30D158] font-semibold text-[11px]">
                            {graphBuilderRef.current.nodes.get(id)?.label || id}
                          </span>
                          {index < currentStep.path.length - 1 && (
                            <span className="text-[#8E8E93] text-[10px]">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleY>
            )}
          </AnimatePresence>
        </div>

        {/* Нижний тулбар */}
        <div className="p-3.5 border-t border-[rgba(84,84,88,0.6)] space-y-2.5">
          <div>
            <SectionLabel className="mb-1.5">Размещение узлов</SectionLabel>
            {/* Нативный UISegmentedControl */}
            <div className="relative flex p-[2px] bg-[rgba(118,118,128,0.24)] rounded-[10px] select-none">
              {LAYOUT_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = currentLayout === opt.id;
                const isDisabled =
                  isPlaying || (opt.id === 'force' && isAutoLayouting) || nodeList.length < 2;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleChangeLayout(opt.id)}
                    disabled={isDisabled}
                    className={`relative flex-1 py-1.5 flex items-center justify-center gap-1 text-[11px] font-semibold rounded-[8px] transition-colors z-10 disabled:opacity-30 ${
                      isSelected ? 'text-white' : 'text-[#98989E] hover:text-white'
                    }`}
                  >
                    <Icon className={`w-3 h-3 ${opt.id === 'force' && isAutoLayouting ? 'animate-spin' : ''}`} />
                    <span>{opt.label}</span>
                    {isSelected && (
                      <motion.div
                        layoutId="segmented-layout-indicator"
                        className="absolute inset-0 bg-[#636366] rounded-[8px] shadow-[0_1px_5px_rgba(0,0,0,0.3)] -z-10"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateRandomGraph}
            disabled={isPlaying}
            className="w-full py-2 bg-[#2C2C2E] hover:bg-[#3A3A3C] active:scale-[0.98] text-white rounded-[10px] text-[13px] font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          >
            <Sparkles className="w-4 h-4 text-[#0A84FF]" />
            <span>Сгенерировать граф (N)</span>
          </button>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={handleOpenExport}
              disabled={isPlaying}
              className="py-1.5 bg-[#2C2C2E] hover:bg-[#3A3A3C] active:scale-[0.98] text-white text-[12px] font-medium rounded-[10px] transition-all flex items-center justify-center gap-1.5 disabled:opacity-30"
            >
              <Download className="w-3.5 h-3.5 text-[#8E8E93]" />
              <span>Экспорт</span>
            </button>

            <button
              type="button"
              onClick={handleOpenImport}
              disabled={isPlaying}
              className="py-1.5 bg-[#2C2C2E] hover:bg-[#3A3A3C] active:scale-[0.98] text-white text-[12px] font-medium rounded-[10px] transition-all flex items-center justify-center gap-1.5 disabled:opacity-30"
            >
              <Upload className="w-3.5 h-3.5 text-[#8E8E93]" />
              <span>Импорт</span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {hasStartedRun && (
              <CollapsibleY key="reset-run" marginOpen={0} marginClosed={0}>
                <button
                  type="button"
                  onClick={onReset}
                  className="w-full py-1.5 my-2 bg-[#2C2C2E] hover:bg-[#3A3A3C] active:scale-[0.98] text-[#FF9F0A] text-[12px] font-medium rounded-[10px] transition-all flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить обход</span>
                </button>
              </CollapsibleY>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={handleClearGraph}
            disabled={isPlaying}
            className="w-full py-1 text-[#FF453A]/70 hover:text-[#FF453A] active:opacity-70 text-[12px] font-medium transition-colors disabled:opacity-20 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" />
            <span>Очистить холст</span>
          </button>
        </div>
      </motion.div>

      {/* Нижний док инструментов */}
      {/* Нижний док инструментов */}
      <CenteredAt x={centerX} className="bottom-5 z-20">
        <div className="relative flex flex-col items-center">
          <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 pointer-events-none z-30 w-max">
            <AnimatePresence>
              {edgeStart && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.94, filter: 'blur(4px)' }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    filter: 'blur(0px)',
                    transition: { duration: 0.25, ease: APPLE_EASE },
                  }}
                  exit={{
                    opacity: 0,
                    y: 4,
                    scale: 0.96,
                    filter: 'blur(4px)',
                    transition: { duration: 0.14, ease: 'easeOut' },
                  }}
                  className="text-[12px] font-medium text-white bg-[#1C1C1E]/90 border border-white/[0.08] py-1.5 px-3.5 rounded-full shadow-xl flex items-center gap-2 whitespace-nowrap backdrop-blur-xl"
                >
                  <CornerDownRight className="w-3.5 h-3.5 text-[#0A84FF]" />
                  <span>кликните на второй узел для соединения</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Относительный контейнер, удерживающий центр строго на месте */}
          <div className="relative inline-flex items-center">
            <MorphingContainer
              className="pointer-events-auto shrink-0 box-content backdrop-blur-2xl bg-[#1C1C1E]/85 border border-white/[0.08] rounded-[22px] shadow-[0_18px_45px_rgba(0,0,0,0.5)]"
              innerClassName="relative w-max p-2 flex items-center gap-2"
            >
              <div ref={toolRowRef} className="relative flex items-center gap-2">
                <ActiveToolPill x={pillBounds.x} width={pillBounds.width} />
                {TOOLS.map(({ value, label, icon: ToolIcon }) => {
                  const isActive = tool === value;

                  return (
                    <motion.button
                      key={value}
                      ref={node => {
                        toolButtonRefs.current[value as Tool] = node;
                      }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ scale: SPRING_SNAPPY }}
                      onClick={() => {
                        setTool(value as Tool);
                        setEdgeStart(null);
                        setContextMenu(null);
                      }}
                      disabled={isPlaying}
                      className={`relative z-10 flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-[14px] whitespace-nowrap transition-colors disabled:opacity-40 ${
                        isActive ? 'text-white' : 'text-[#8E8E93] hover:text-white'
                      }`}
                    >
                      <ToolIcon className="relative z-10 h-4 w-4" />
                      <span className="relative z-10">{label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </MorphingContainer>

            {/* Stepper веса ребра, вынесенный в абсолют справа — не смещает основные кнопки */}
            <AnimatePresence initial={false}>
              {tool === 'addEdge' && (
                <motion.div
                  key="edge-weight-absolute"
                  initial={{ opacity: 0, x: -8, scale: 0.96, filter: 'blur(4px)' }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    filter: 'blur(0px)',
                    transition: { duration: 0.25, ease: APPLE_EASE },
                  }}
                  exit={{
                    opacity: 0,
                    x: -8,
                    scale: 0.96,
                    filter: 'blur(4px)',
                    transition: { duration: 0.15, ease: 'easeOut' },
                  }}
                  className="absolute left-full ml-3 top-0 bottom-0 my-auto h-fit pointer-events-auto backdrop-blur-2xl bg-[#1C1C1E]/85 border border-white/[0.08] rounded-[22px] px-3.5 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.5)] flex items-center gap-2.5 whitespace-nowrap"
                >
                  <span className="text-[12px] text-[#8E8E93] font-medium">Вес:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => {
                        const current = parseFloat(edgeWeightInput) || 0;
                        const next = Math.max(0.5, Math.round((current - 0.5) * 10) / 10);
                        setEdgeWeightInput(next.toString());
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-[8px] bg-[#2C2C2E] text-[#8E8E93] hover:text-white active:scale-90 transition-all disabled:opacity-30"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-9 text-center font-mono font-semibold text-white text-[13px]">
                      {edgeWeightInput}
                    </span>
                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => {
                        const current = parseFloat(edgeWeightInput) || 0;
                        const next = Math.round((current + 0.5) * 10) / 10;
                        setEdgeWeightInput(next.toString());
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-[8px] bg-[#2C2C2E] text-[#8E8E93] hover:text-white active:scale-90 transition-all disabled:opacity-30"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </CenteredAt>

      {/* Модальное окно Импорта / Экспорта (форм-шит) */}
      <AnimatePresence>
        {modalMode && (
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.25, ease: APPLE_EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                transition: { ...SPRING_SMOOTH, opacity: { duration: 0.25, ease: APPLE_EASE } },
              }}
              exit={{
                opacity: 0,
                scale: 0.96,
                y: 8,
                transition: { duration: 0.18, ease: 'easeIn' },
              }}
              className="w-full max-w-lg bg-[#1C1C1E] border border-white/[0.08] rounded-[20px] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)] flex flex-col gap-4 text-xs"
            >
              <div className="relative flex items-center justify-center pb-3 border-b border-[rgba(84,84,88,0.6)]">
                <span className="text-[15px] font-semibold text-white">
                  {modalMode === 'export' ? 'Экспорт графа' : 'Импорт графа'}
                </span>
                <button
                  onClick={() => setModalMode(null)}
                  className="absolute right-0 w-7 h-7 rounded-full bg-[rgba(142,142,147,0.26)] active:scale-95 flex items-center justify-center text-[#8E8E93] hover:text-white transition-all"
                  aria-label="Закрыть"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-[#8E8E93] font-medium block">
                  {modalMode === 'export'
                    ? 'JSON-структура текущего графа:'
                    : 'Вставьте структуру графа (JSON):'}
                </label>
                <textarea
                  value={jsonInputText}
                  onChange={e => setJsonInputText(e.target.value)}
                  readOnly={modalMode === 'export'}
                  placeholder="Вставьте JSON сюда..."
                  className="w-full h-60 p-3 bg-[#2C2C2E] rounded-[13px] font-mono text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/50 resize-none scrollbar-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[rgba(84,84,88,0.6)]">
                {modalMode === 'export' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="px-4 py-2 bg-[#2C2C2E] hover:bg-[#3A3A3C] active:scale-[0.97] text-white font-medium rounded-[12px] transition-all flex items-center gap-2 text-[13px]"
                    >
                      {copyStatus ? (
                        <Check className="w-3.5 h-3.5 text-[#30D158]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copyStatus ? 'Скопировано!' : 'Копировать'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalMode(null)}
                      className="px-4 py-2 bg-[#0A84FF] hover:bg-[#3395FF] active:scale-[0.97] text-white font-semibold rounded-[12px] transition-all text-[13px]"
                    >
                      Готово
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setModalMode(null)}
                      className="px-4 py-2 bg-[#2C2C2E] hover:bg-[#3A3A3C] active:scale-[0.97] text-white font-medium rounded-[12px] transition-all text-[13px]"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      className="px-4 py-2 bg-[#0A84FF] hover:bg-[#3395FF] active:scale-[0.97] text-white font-semibold rounded-[12px] transition-all flex items-center gap-1.5 text-[13px]"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Применить</span>
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Контекстное меню (UIMenu) */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: 0.18, ease: APPLE_EASE },
            }}
            exit={{
              opacity: 0,
              scale: 0.94,
              y: 2,
              transition: { duration: 0.12, ease: 'easeIn' },
            }}
            style={{
              left: Math.min(contextMenu.screenX + 10, windowWidth - 210),
              top: Math.min(contextMenu.screenY + 10, window.innerHeight - 220),
              transformOrigin: 'top left',
            }}
            className="absolute z-50 backdrop-blur-2xl bg-[#2C2C2E]/90 border border-white/[0.1] rounded-[13px] p-[5px] shadow-[0_16px_40px_rgba(0,0,0,0.5)] min-w-[190px] flex flex-col gap-0.5 text-xs"
          >
            {contextMenu.type === 'node' && (
              <>
                <div className="px-2.5 py-1 text-[10px] text-[#8E8E93] font-semibold uppercase tracking-wider border-b border-[rgba(84,84,88,0.5)] mb-0.5">
                  Узел: {graphBuilderRef.current.nodes.get(contextMenu.id)?.label}
                </div>

                <button
                  onClick={() => handleRenameNode(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-white hover:bg-white/[0.08] rounded-[9px] transition-colors font-medium text-[13px]"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#8E8E93]" />
                  <span>Переименовать</span>
                </button>

                <button
                  onClick={() => {
                    setStartNode(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-white hover:bg-white/[0.08] rounded-[9px] transition-colors font-medium text-[13px]"
                >
                  <Flag className="w-3.5 h-3.5 text-[#30D158]" />
                  <span>Выбрать началом</span>
                </button>

                <button
                  onClick={() => {
                    setTargetNode(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-white hover:bg-white/[0.08] rounded-[9px] transition-colors font-medium text-[13px]"
                >
                  <Target className="w-3.5 h-3.5 text-[#FF453A]" />
                  <span>Выбрать целью</span>
                </button>

                <div className="my-0.5 border-t border-[rgba(84,84,88,0.5)]" />

                <button
                  onClick={() => handleDeleteNode(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-[#FF453A] hover:bg-[#FF453A]/15 rounded-[9px] transition-colors font-medium text-[13px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить узел</span>
                </button>
              </>
            )}

            {contextMenu.type === 'edge' && (
              <>
                <div className="px-2.5 py-1 text-[10px] text-[#8E8E93] font-semibold uppercase tracking-wider border-b border-[rgba(84,84,88,0.5)] mb-0.5">
                  Ребро
                </div>

                <button
                  onClick={() => handleEditEdgeWeight(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-white hover:bg-white/[0.08] rounded-[9px] transition-colors font-medium text-[13px]"
                >
                  <Scale className="w-3.5 h-3.5 text-[#8E8E93]" />
                  <span>Изменить вес</span>
                </button>

                {directed && (
                  <button
                    onClick={() => handleReverseEdge(contextMenu.id)}
                    className="flex items-center gap-2 px-2.5 py-[7px] text-left text-white hover:bg-white/[0.08] rounded-[9px] transition-colors font-medium text-[13px]"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-[#8E8E93]" />
                    <span>Развернуть направление</span>
                  </button>
                )}

                <div className="my-0.5 border-t border-[rgba(84,84,88,0.5)]" />

                <button
                  onClick={() => handleDeleteEdge(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-[#FF453A] hover:bg-[#FF453A]/15 rounded-[9px] transition-colors font-medium text-[13px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить ребро</span>
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}