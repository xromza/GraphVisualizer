'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
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
  Orbit,
  Shuffle,
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
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full px-[2px] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
        checked ? 'bg-success' : 'bg-fill-hover'
      }`}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 550, damping: 34 }}
        className="pointer-events-none block h-[27px] w-[27px] rounded-full bg-white "
      />
    </button>
  );
}

/** Глиф горячей клавиши — как в меню macOS: без рамки, вторичным цветом. */
function Keycap({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      aria-hidden="true"
      className={`font-sans text-[11px] font-medium text-secondary tabular-nums ${className}`}
    >
      {children}
    </kbd>
  );
}

/** Подсказка, как у кнопок в macOS: появляется после короткой паузы, с названием и клавишей. */
function Tooltip({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom';
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPos(null);
  }, []);

  const show = useCallback(
    (delay: number) => {
      hide();
      timer.current = setTimeout(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setPos({ x: r.left + r.width / 2, y: side === 'bottom' ? r.bottom + 8 : r.top - 8 });
      }, delay);
    },
    [hide, side]
  );

  useEffect(() => hide, [hide]);

  return (
    <span
      ref={ref}
      className="inline-flex"
      onPointerEnter={e => e.pointerType === 'mouse' && show(600)}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={e => e.target.matches(':focus-visible') && show(0)}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, ${side === 'top' ? '-100%' : '0'})`,
            }}
            className="fixed z-[70] pointer-events-none flex items-center gap-2 whitespace-nowrap rounded-control bg-surface shadow-float px-2 py-1 text-[12px] text-label"
          >
            <span>{label}</span>
            {shortcut && <Keycap>{shortcut}</Keycap>}
          </div>,
          document.body
        )}
    </span>
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
      className={`text-[12px] font-medium text-secondary ${className}`}
    >
      {children}
    </div>
  );
}

function Hairline({ className = '' }: { className?: string }) {
  return <div className={`h-px w-full bg-separator ${className}`} />;
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
      className="absolute inset-y-0 left-0 z-0 rounded-card bg-fill-selected shadow-[0_1px_3px_rgba(0,0,0,0.25)] pointer-events-none"
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
      initial={{ opacity: 0, width: 0, marginLeft: -gap }}
      animate={{
        opacity: 1,
        width: 'auto',
        marginLeft: 0,
        transition: {
          opacity: { duration: 0.25, ease: APPLE_EASE, delay: 0.05 },
          width: { duration: 0.38, ease: APPLE_EASE },
          marginLeft: { duration: 0.38, ease: APPLE_EASE },
        },
      }}
      exit={{
        opacity: 0,
        width: 0,
        marginLeft: -gap,
        transition: {
          opacity: { duration: 0.15, ease: 'easeOut' },
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
      initial={{ opacity: 0, height: 0, marginTop: marginClosed }}
      animate={{
        opacity: 1,
        height: 'auto',
        marginTop: marginOpen,
        transition: {
          opacity: { duration: 0.25, ease: APPLE_EASE, delay: 0.04 },
          height: { duration: 0.38, ease: APPLE_EASE },
          marginTop: { duration: 0.38, ease: APPLE_EASE },
        },
      }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: marginClosed,
        transition: {
          opacity: { duration: 0.15, ease: 'easeOut' },
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
  placeholder = 'Не выбрано',
  disabled = false,
  allowClear = true,
}: {
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
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
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onKeyDown={e => {
          if (e.key === 'Escape') setIsOpen(false);
        }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 bg-fill rounded-control text-[13px] font-medium text-label flex items-center justify-between transition-all duration-200 select-none disabled:opacity-40 disabled:cursor-not-allowed active:bg-fill-hover ${
          isOpen ? 'ring-2 ring-accent/60' : ''
        }`}
      >
        <span className="truncate pr-2">
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-secondary">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isOpen ? 'rotate-180 text-accent' : 'text-secondary'
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
            role="listbox"
            className="z-50 material rounded-card p-1  overflow-y-auto scrollbar-none flex flex-col gap-0.5 text-[13px] min-w-[180px]"
          >
            {placeholder && allowClear && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-control text-left transition-colors flex items-center justify-between ${
                  value === ''
                    ? 'text-accent font-semibold'
                    : 'text-secondary hover:text-label hover:bg-fill-hover'
                }`}
              >
                <span>{placeholder}</span>
                {value === '' && <Check className="w-3.5 h-3.5 text-accent" />}
              </button>
            )}

            {options.map(option => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-control text-left transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'text-accent font-semibold'
                      : 'text-label hover:bg-fill-hover'
                  }`}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
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
    <div className="flex items-start gap-1.5 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-separator">
      <span className="text-secondary text-[12px] shrink-0 font-medium mt-0.5">Маршрут:</span>
      <div className="relative flex items-start gap-2">
        <div 
          className={`text-success font-medium text-[12px] leading-tight select-text break-words transition-all duration-300 ${
            isExpanded ? 'max-w-[280px]' : 'max-w-[150px] truncate'
          }`}
        >
          {fullText}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-secondary hover:text-label transition-colors p-0.5 shrink-0 bg-fill rounded-control"
          title={isExpanded ? 'Свернуть маршрут' : 'Показать весь маршрут'}
          aria-label={isExpanded ? 'Свернуть маршрут' : 'Показать весь маршрут'}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

/* Диалог в духе системного алерта: короткий заголовок, одно действие и «Отмена». */
type DialogState =
  | {
      kind: 'prompt';
      title: string;
      message?: string;
      initial: string;
      inputMode?: 'text' | 'decimal' | 'numeric';
      confirmLabel: string;
      validate?: (value: string) => string | null;
      onSubmit: (value: string) => void;
    }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      destructive?: boolean;
      onConfirm: () => void;
    };

function AlertDialog({ state, onClose }: { state: DialogState | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {state && <AlertDialogBody key="alert" state={state} onClose={onClose} />}
    </AnimatePresence>
  );
}

function AlertDialogBody({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const [value, setValue] = useState(state.kind === 'prompt' ? state.initial : '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (state.kind === 'prompt') {
      const message = state.validate?.(value) ?? null;
      if (message) {
        setError(message);
        return;
      }
      onClose();
      state.onSubmit(value);
    } else {
      onClose();
      state.onConfirm();
    }
  };

  const destructive = state.kind === 'confirm' && state.destructive;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onPointerDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: APPLE_EASE } }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
        className="w-full max-w-[300px] rounded-panel bg-surface shadow-float p-4 flex flex-col gap-3"
      >
        <div className="text-center">
          <h2 id="alert-title" className="text-[15px] font-semibold text-label">
            {state.title}
          </h2>
          {state.message && (
            <p className="mt-1 text-[13px] text-secondary">{state.message}</p>
          )}
        </div>

        {state.kind === 'prompt' && (
          <div>
            <input
              ref={inputRef}
              value={value}
              inputMode={state.inputMode}
              onChange={e => {
                setValue(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              className="w-full px-3 py-2 rounded-control bg-fill text-[13px] text-label outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            {error && (
              <p role="alert" className="mt-1.5 text-[12px] text-danger">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            autoFocus={state.kind === 'confirm'}
            className="py-2 rounded-card bg-fill hover:bg-fill-hover text-[13px] font-medium text-label transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            className={`py-2 rounded-card text-[13px] font-semibold text-white transition-colors ${
              destructive ? 'bg-danger-fill hover:bg-danger-fill/90' : 'bg-accent-fill hover:bg-accent-fill/90'
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

const LAYOUT_OPTIONS = [
  { id: 'force' as const, label: 'Силы', icon: Orbit },
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
    waypointNodeIds: string[],
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
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [edgeWeightInput, setEdgeWeightInput] = useState<string>('1');

  const [currentLayout, setCurrentLayout] = useState<LayoutType | null>(null);

  const [modalMode, setModalMode] = useState<'export' | 'import' | null>(null);
  const [jsonInputText, setJsonInputText] = useState('');
  const [copyStatus, setCopyStatus] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

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
          iterations: 600,
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
      rendererRef.current.setWaypoints(waypoints);
      rendererRef.current.render(selectedNodes);
    }
  }, [startNode, targetNode, waypoints, selectedNodes]);

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
          setWaypoints(w => w.filter(id => id !== clickedNode.id));
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
    setContextMenu(null);
    setDialog({
      kind: 'prompt',
      title: 'Переименовать узел',
      initial: node.label,
      confirmLabel: 'Готово',
      validate: v => (v.trim() ? null : 'Имя не может быть пустым.'),
      onSubmit: v => {
        node.label = v.trim();
        setGraphVersion(n => n + 1);
        redraw();
      },
    });
  };

  const handleDeleteNode = (nodeId: string) => {
    graphBuilderRef.current.removeNode(nodeId);
    if (startNode === nodeId) setStartNode('');
    if (targetNode === nodeId) setTargetNode('');
    setWaypoints(w => w.filter(id => id !== nodeId));
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
    setContextMenu(null);
    setDialog({
      kind: 'prompt',
      title: 'Вес ребра',
      initial: edge.weight.toString(),
      inputMode: 'decimal',
      confirmLabel: 'Готово',
      validate: v => (Number.isFinite(parseFloat(v)) ? null : 'Введите число.'),
      onSubmit: v => {
        edge.weight = parseFloat(v);
        setGraphVersion(n => n + 1);
        redraw();
      },
    });
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
    if (!selectedAlgorithm || !startNode || !targetNode) return;

    const nodes = graphBuilderRef.current.getNodesAsRecord();
    const edges = graphBuilderRef.current.edges;

    setIsPanelOpen(false);

    onAlgorithmRun?.(nodes, edges, selectedAlgorithm, startNode, targetNode, waypoints, directed);
  }, [selectedAlgorithm, startNode, targetNode, waypoints, directed, onAlgorithmRun]);

  const clearGraph = useCallback(() => {
    setContextMenu(null);
    graphBuilderRef.current.clear();
    setSelectedNodes(new Set());
    setEdgeStart(null);
    setStartNode('');
    setTargetNode('');
    setWaypoints([]);
    setCurrentLayout(null);
    setGraphVersion(v => v + 1);
    onReset?.();
    redraw();
  }, [onReset, redraw]);

  const handleClearGraph = useCallback(() => {
    setContextMenu(null);
    if (graphBuilderRef.current.nodes.size === 0) return;
    setDialog({
      kind: 'confirm',
      title: 'Очистить холст?',
      message: 'Все узлы и рёбра будут удалены. Это действие нельзя отменить.',
      confirmLabel: 'Очистить',
      destructive: true,
      onConfirm: clearGraph,
    });
  }, [clearGraph]);

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
    setImportError(null);
    setModalMode('import');
  };

  const handleApplyImport = () => {
    try {
      const parsed = JSON.parse(jsonInputText);
      if (!parsed.nodes || !Array.isArray(parsed.nodes) || !parsed.edges || !Array.isArray(parsed.edges)) {
        setImportError('Неверный формат: нужны массивы «nodes» и «edges».');
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
      setWaypoints([]);
    setWaypoints([]);
      setSelectedNodes(new Set());
      setEdgeStart(null);
      setCurrentLayout(null);
      setGraphVersion(v => v + 1);
      onReset?.();
      redraw();
      setModalMode(null);
    } catch (err) {
      setImportError('Не удалось прочитать JSON. Проверьте синтаксис.');
    }
  };

  const generateGraph = useCallback((count: number) => {

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
    setWaypoints([]);
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
        iterations: 600,
        onTick: () => redraw(),
        onDone: () => {
          setGraphVersion(v => v + 1);
          redraw();
          setIsAutoLayouting(false);
          layoutCancelRef.current = null;
        },
      }
    );
  }, [onReset, redraw]);

  const handleGenerateRandomGraph = useCallback(() => {
    if (isPlaying) return;

    setContextMenu(null);
    setDialog({
      kind: 'prompt',
      title: 'Случайный граф',
      message: 'Сколько узлов создать? От 2 до 1000.',
      initial: '50',
      inputMode: 'numeric',
      confirmLabel: 'Создать',
      validate: v => {
        const n = parseInt(v, 10);
        return Number.isInteger(n) && n >= 2 && n <= 1000 ? null : 'Введите число от 2 до 1000.';
      },
      onSubmit: v => generateGraph(parseInt(v, 10)),
    });
  }, [isPlaying]);

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

  /* Горячие клавиши. Не срабатывают при вводе текста, открытых диалогах и с модификаторами. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;

      if (e.key === 'Escape') {
        if (modalMode) setModalMode(null);
        else if (contextMenu) setContextMenu(null);
        else setEdgeStart(null);
        return;
      }
      if (modalMode || dialog) return;

      const toolKeys: Record<string, Tool> = { v: 'select', n: 'addNode', e: 'addEdge', d: 'delete' };
      const key = e.key.toLowerCase();

      if (toolKeys[key] && !isPlaying) {
        setTool(toolKeys[key]);
        setEdgeStart(null);
        setContextMenu(null);
      } else if (key === 'p') {
        setIsPanelOpen(open => !open);
      } else if (e.key === ' ' && el === document.body) {
        e.preventDefault();
        if (isPlaying) onStop?.();
        else handleRunAlgorithm();
      } else if (stepsCount > 0 && !isPlaying) {
        if (e.key === 'ArrowLeft') onStepChange?.(Math.max(0, currentStepIndex - 1));
        else if (e.key === 'ArrowRight') onStepChange?.(Math.min(stepsCount - 1, currentStepIndex + 1));
        else if (e.key === 'Home') onStepChange?.(0);
        else if (e.key === 'End') onStepChange?.(stepsCount - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalMode, dialog, contextMenu, isPlaying, stepsCount, currentStepIndex, onStop, onStepChange, handleRunAlgorithm]);

  const TOOLS = [
    { value: 'select', label: 'Выбор', key: 'V', icon: MousePointer },
    { value: 'addNode', label: 'Узел', key: 'N', icon: CirclePlus },
    { value: 'addEdge', label: 'Ребро', key: 'E', icon: ArrowRight },
    { value: 'delete', label: 'Удалить', key: 'D', icon: Trash2 },
  ] satisfies {
    value: Tool;
    label: string;
    key: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-canvas text-label select-none font-sans antialiased">
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
          className="pointer-events-auto shrink-0 box-content material rounded-panel  text-xs"
          innerClassName="relative w-max max-w-[calc(100vw-3rem)] p-1.5"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {!hasStartedRun ? (
              <motion.div
                key="pre-run-bar"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: { duration: 0.3, ease: APPLE_EASE },
                }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
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

                <Tooltip label="Запустить" shortcut="Пробел">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_SNAPPY}
                  onClick={handleRunAlgorithm}
                  disabled={!selectedAlgorithm || !startNode || !targetNode}
                  className="px-4 py-2 rounded-card bg-accent-fill hover:bg-accent-fill/90 active:bg-accent-fill text-white font-semibold flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[13px] shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Запустить</span>
                </motion.button>
                </Tooltip>
              </motion.div>
            ) : (
              <motion.div
                key="player-hud-container"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: { duration: 0.3, ease: APPLE_EASE },
                }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  transition: { duration: 0.16, ease: 'easeOut' },
                }}
                className="flex flex-col"
              >
                <div className="flex items-center gap-2 p-0.5">
                  <Tooltip label={isPlaying ? 'Остановить' : 'Перезапустить'} shortcut="Пробел">
                  <div className="relative w-7 h-7 shrink-0">
                    <AnimatePresence initial={false}>
                      {isPlaying ? (
                        <motion.button
                          key="stop"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.14 } }}
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_SNAPPY}
                          type="button"
                          onClick={onStop}
                          className="absolute inset-0 rounded-control bg-danger-fill text-white hover:bg-danger-fill/90 font-bold flex items-center justify-center transition-colors"
                        >
                          <Square className="w-3 h-3 fill-current" />
                        </motion.button>
                      ) : (
                        <motion.button
                          key="restart"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.14 } }}
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_SNAPPY}
                          type="button"
                          onClick={handleRunAlgorithm}
                          disabled={!selectedAlgorithm || !startNode || !targetNode}
                          className="absolute inset-0 rounded-control bg-accent-fill text-white hover:bg-accent-fill/90 font-bold flex items-center justify-center transition-colors disabled:opacity-30"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                  </Tooltip>

                  <div className="flex items-center gap-0.5 px-1 shrink-0">
                    {[
                      { Icon: SkipBack, key: 'Home', title: 'В начало', action: () => onStepChange?.(0), disabled: currentStepIndex <= 0 },
                      { Icon: ChevronLeft, key: '←', title: 'Шаг назад', action: () => onStepChange?.(currentStepIndex - 1), disabled: currentStepIndex <= 0 },
                      { Icon: ChevronRight, key: '→', title: 'Шаг вперёд', action: () => onStepChange?.(currentStepIndex + 1), disabled: currentStepIndex >= stepsCount - 1 },
                      { Icon: SkipForward, key: 'End', title: 'В конец', action: () => onStepChange?.(stepsCount - 1), disabled: currentStepIndex >= stepsCount - 1 },
                    ].map(({ Icon, key: hotkey, title, action, disabled }, idx) => (
                      <Tooltip key={idx} label={title} shortcut={hotkey}>
                      <motion.button
                        aria-label={title}
                        aria-keyshortcuts={hotkey}
                        whileTap={{ scale: 0.9 }}
                        transition={SPRING_SNAPPY}
                        type="button"
                        onClick={action}
                        disabled={disabled}
                        className="w-7 h-7 rounded-control text-secondary hover:text-label hover:bg-fill-hover flex items-center justify-center disabled:opacity-20 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </motion.button>
                      </Tooltip>
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
                            className="w-20 sm:w-28 cursor-pointer accent-accent"
                          />
                          <span className="text-[12px] tabular-nums text-accent shrink-0 font-semibold">
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

                  <Tooltip label="Сбросить обход">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    transition={SPRING_SNAPPY}
                    type="button"
                    onClick={onReset}
                    className="w-7 h-7 rounded-control text-secondary hover:text-danger hover:bg-danger/15 flex items-center justify-center transition-colors shrink-0"
                    aria-label="Сбросить обход"
                  >
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                  </Tooltip>
                </div>

                <AnimatePresence initial={false}>
                  {!isPanelOpen && currentStep && (
                    <CollapsibleY key="step-info" marginOpen={6} marginClosed={0}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-separator pt-2 px-1 text-xs">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-secondary text-[12px] font-medium">Статус:</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${
                              currentStep.status === 'COMPLETED'
                                ? 'bg-success/15 text-success'
                                : currentStep.status === 'ERROR'
                                  ? 'bg-danger/15 text-danger'
                                  : 'bg-warning/15 text-warning'
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
                            <span className="text-secondary text-[12px] font-medium">Фокус:</span>
                            <span className="text-label font-semibold truncate max-w-[140px]">
                              {graphBuilderRef.current.nodes.get(currentStep.activeNodeId)?.label ||
                                currentStep.activeNodeId}
                            </span>
                          </div>
                        )}

                        {currentStep.activeNodeId &&
                          currentStep.distances[currentStep.activeNodeId] !== undefined && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-secondary text-[12px] font-medium">Длина:</span>
                              <span className="text-success tabular-nums font-semibold">
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: { duration: 0.28, ease: APPLE_EASE, delay: 0.1 },
            }}
            exit={{
              opacity: 0,
              scale: 0.92,
              transition: { duration: 0.14, ease: 'easeOut' },
            }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsPanelOpen(true)}
            aria-keyshortcuts="P"
            className={`absolute top-4 z-20 material rounded-card px-3.5 py-2  flex items-center gap-2 text-[13px] font-semibold text-label hover:bg-fill-hover/60 transition-colors ${
              panelSide === 'left' ? 'left-4' : 'right-4'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-secondary" />
            <span>Параметры</span>
            <Keycap>P</Keycap>
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
            className="absolute top-4 bottom-4 w-80 rounded-panel border-2 border-accent/50 bg-accent-fill/5 pointer-events-none z-10 backdrop-blur-[2px]"
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
        className={`absolute top-4 bottom-4 z-20 flex flex-col rounded-panel material  overflow-hidden ${
          isDraggingPanel ? 'ring-1 ring-accent/40' : ''
        }`}
      >
        {/* Grabber и заголовок */}
        <div
          onPointerDown={e => dragControls.start(e)}
          className="pt-2.5 px-4 pb-3 border-b border-separator cursor-grab active:cursor-grabbing select-none group"
          title="Перетащите, чтобы переместить панель"
        >
          <div className="w-9 h-[5px] rounded-full bg-tertiary/50 mx-auto group-hover:bg-tertiary transition-colors" />

          <div className="flex items-center justify-between mt-2.5">
            <span className="text-[15px] font-semibold text-label tracking-tight">Параметры</span>

            <div
              onPointerDown={e => e.stopPropagation()}
              className="flex items-center gap-2.5 cursor-default"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-secondary font-medium">Направленный</span>
                <IOSSwitch checked={directed} onChange={setDirected} disabled={isPlaying} />
              </div>

              <button
                onClick={() => setIsPanelOpen(false)}
                className="w-7 h-7 rounded-full bg-fill active:scale-95 flex items-center justify-center text-secondary hover:text-label transition-all"
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

          <SectionLabel className="mb-1.5">Маршрут</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[12px] text-secondary font-medium flex items-center gap-1.5 mb-1 px-0.5">
                <Flag className="w-3 h-3" />
                <span>Откуда</span>
              </label>
              <CustomSelect
                options={nodeList.map(node => ({ value: node.id, label: node.label }))}
                value={startNode}
                onChange={setStartNode}
                placeholder="Не выбран"
                disabled={isPlaying}
              />
            </div>

            <div>
              <label className="text-[12px] text-secondary font-medium flex items-center gap-1.5 mb-1 px-0.5">
                <Target className="w-3 h-3" />
                <span>Куда</span>
              </label>
              <CustomSelect
                options={nodeList.map(node => ({ value: node.id, label: node.label }))}
                value={targetNode}
                onChange={setTargetNode}
                placeholder="Не выбран"
                disabled={isPlaying}
              />
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] text-secondary font-medium px-0.5">Через</span>
              {waypoints.length > 0 && !isPlaying && (
                <button
                  type="button"
                  onClick={() => setWaypoints([])}
                  className="text-[12px] text-accent hover:underline"
                >
                  Убрать все
                </button>
              )}
            </div>

            {waypoints.length > 0 && (
              <ol className="mb-2 flex flex-col gap-1">
                {waypoints.map((id, index) => (
                  <li
                    key={id}
                    className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-control bg-fill text-[13px] text-label"
                  >
                    <span className="w-4 text-secondary tabular-nums">{index + 1}</span>
                    <span className="flex-1 truncate">
                      {graphBuilderRef.current.nodes.get(id)?.label ?? id}
                    </span>
                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => setWaypoints(w => w.filter(x => x !== id))}
                      aria-label={`Убрать узел «${graphBuilderRef.current.nodes.get(id)?.label ?? id}» из маршрута`}
                      className="w-6 h-6 rounded-control flex items-center justify-center text-secondary hover:text-label hover:bg-fill-hover disabled:opacity-30 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <CustomSelect
              options={nodeList
                .filter(n => n.id !== startNode && n.id !== targetNode && !waypoints.includes(n.id))
                .map(n => ({ value: n.id, label: n.label }))}
              value=""
              onChange={id => id && setWaypoints(w => [...w, id])}
              placeholder="Добавить узел…"
              allowClear={false}
              disabled={isPlaying}
            />
          </div>

          {onSpeedChange && (
            <>
              <Hairline className="my-3.5" />
              <div className="flex justify-between items-center mb-2">
                <SectionLabel>Задержка шага</SectionLabel>
                <span className="text-[12px] font-semibold text-accent">{speedMs} мс</span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={speedMs}
                onChange={e => onSpeedChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-accent"
              />
            </>
          )}

          {/* Информация о текущем шаге (плоская секция) */}
          <AnimatePresence initial={false}>
            {currentStep && (
              <CollapsibleY key="panel-step-section" marginOpen={0} marginClosed={0}>
                <Hairline className="my-3.5" />
                <SectionLabel className="mb-1">Текущий шаг</SectionLabel>

                <div className="divide-y divide-separator">
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[13px] text-secondary">Шаг</span>
                    <span className="text-[13px] font-semibold text-label">
                      #{currentStep.stepNumber}
                      {stepsCount > 1 && (
                        <span className="text-secondary font-normal"> ({currentStepIndex + 1}/{stepsCount})</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[13px] text-secondary">Статус</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          currentStep.status === 'COMPLETED'
                            ? 'bg-success'
                            : currentStep.status === 'ERROR'
                              ? 'bg-danger-fill'
                              : 'bg-warning '
                        }`}
                      />
                      <span
                        className={`text-[13px] font-semibold ${
                          currentStep.status === 'COMPLETED'
                            ? 'text-success'
                            : currentStep.status === 'ERROR'
                              ? 'text-danger'
                              : 'text-warning'
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
                      <span className="text-[13px] text-secondary">В фокусе</span>
                      <span className="text-[13px] font-semibold text-label truncate max-w-[160px]">
                        {graphBuilderRef.current.nodes.get(currentStep.activeNodeId)?.label ||
                          currentStep.activeNodeId}
                      </span>
                    </div>
                  )}

                  {currentStep.activeNodeId &&
                    currentStep.distances[currentStep.activeNodeId] !== undefined && (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-[13px] text-secondary">Длина пути</span>
                        <span className="text-[13px] tabular-nums font-semibold text-success">
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
                          <span className="px-1.5 py-0.5 rounded-control bg-success/15 text-success font-semibold text-[12px]">
                            {graphBuilderRef.current.nodes.get(id)?.label || id}
                          </span>
                          {index < currentStep.path.length - 1 && (
                            <span className="text-secondary text-[12px]">→</span>
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
        <div className="p-3.5 border-t border-separator space-y-2.5">
          <div>
            <SectionLabel className="mb-1.5">Размещение узлов</SectionLabel>
            {/* Нативный UISegmentedControl */}
            <div className="relative flex p-[2px] bg-fill rounded-control select-none">
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
                    className={`relative flex-1 py-1.5 flex items-center justify-center gap-1 text-[12px] font-semibold rounded-control transition-colors z-10 disabled:opacity-30 ${
                      isSelected ? 'text-label' : 'text-secondary hover:text-label'
                    }`}
                  >
                    <Icon className={`w-3 h-3 ${opt.id === 'force' && isAutoLayouting ? 'animate-spin' : ''}`} />
                    <span>{opt.label}</span>
                    {isSelected && (
                      <motion.div
                        layoutId="segmented-layout-indicator"
                        className="absolute inset-0 bg-fill-selected rounded-control  -z-10"
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
            className="w-full py-2 bg-fill hover:bg-fill-hover active:scale-[0.98] text-label rounded-control text-[13px] font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          >
            <Shuffle className="w-4 h-4 text-secondary" />
            <span>Случайный граф…</span>
          </button>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={handleOpenExport}
              disabled={isPlaying}
              className="py-1.5 bg-fill hover:bg-fill-hover active:scale-[0.98] text-label text-[12px] font-medium rounded-control transition-all flex items-center justify-center gap-1.5 disabled:opacity-30"
            >
              <Download className="w-3.5 h-3.5 text-secondary" />
              <span>Экспорт</span>
            </button>

            <button
              type="button"
              onClick={handleOpenImport}
              disabled={isPlaying}
              className="py-1.5 bg-fill hover:bg-fill-hover active:scale-[0.98] text-label text-[12px] font-medium rounded-control transition-all flex items-center justify-center gap-1.5 disabled:opacity-30"
            >
              <Upload className="w-3.5 h-3.5 text-secondary" />
              <span>Импорт</span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {hasStartedRun && (
              <CollapsibleY key="reset-run" marginOpen={0} marginClosed={0}>
                <button
                  type="button"
                  onClick={onReset}
                  className="w-full py-1.5 my-2 bg-fill hover:bg-fill-hover active:scale-[0.98] text-warning text-[12px] font-medium rounded-control transition-all flex items-center justify-center gap-1.5"
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
            className="w-full py-1 text-danger/80 hover:text-danger active:opacity-70 text-[12px] font-medium transition-colors disabled:opacity-20 flex items-center justify-center gap-1.5"
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
                  initial={{ opacity: 0, y: 6, scale: 0.94 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { duration: 0.25, ease: APPLE_EASE },
                  }}
                  exit={{
                    opacity: 0,
                    y: 4,
                    scale: 0.96,
                    transition: { duration: 0.14, ease: 'easeOut' },
                  }}
                  className="material text-[12px] font-medium text-label py-1.5 px-3.5 rounded-full flex items-center gap-2 whitespace-nowrap"
                >
                  <CornerDownRight className="w-3.5 h-3.5 text-accent" />
                  <span>Выберите второй узел</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Относительный контейнер, удерживающий центр строго на месте */}
          <div className="relative inline-flex items-center">
            <MorphingContainer
              className="pointer-events-auto shrink-0 box-content material rounded-panel "
              innerClassName="relative w-max p-2 flex items-center gap-2"
            >
              <div ref={toolRowRef} className="relative flex items-center gap-2">
                <ActiveToolPill x={pillBounds.x} width={pillBounds.width} />
                {TOOLS.map(({ value, label, key: hotkey, icon: ToolIcon }) => {
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
                      aria-keyshortcuts={hotkey}
                      className={`relative z-10 flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-card whitespace-nowrap transition-colors disabled:opacity-40 ${
                        isActive ? 'text-label' : 'text-secondary hover:text-label'
                      }`}
                    >
                      <ToolIcon className={`relative z-10 h-4 w-4 ${isActive ? 'text-accent' : ''}`} />
                      <span className="relative z-10">{label}</span>
                      <Keycap className="relative z-10 -ml-0.5">{hotkey}</Keycap>
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
                  initial={{ opacity: 0, x: -8, scale: 0.96 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    transition: { duration: 0.25, ease: APPLE_EASE },
                  }}
                  exit={{
                    opacity: 0,
                    x: -8,
                    scale: 0.96,
                    transition: { duration: 0.15, ease: 'easeOut' },
                  }}
                  className="absolute left-full ml-3 top-0 bottom-0 my-auto h-fit pointer-events-auto material rounded-panel px-3.5 py-2  flex items-center gap-2.5 whitespace-nowrap"
                >
                  <span className="text-[12px] text-secondary font-medium">Вес:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isPlaying}
                      onClick={() => {
                        const current = parseFloat(edgeWeightInput) || 0;
                        const next = Math.max(0.5, Math.round((current - 0.5) * 10) / 10);
                        setEdgeWeightInput(next.toString());
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-control bg-fill text-secondary hover:text-label active:scale-90 transition-all disabled:opacity-30"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-9 text-center tabular-nums font-semibold text-label text-[13px]">
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
                      className="w-7 h-7 flex items-center justify-center rounded-control bg-fill text-secondary hover:text-label active:scale-90 transition-all disabled:opacity-30"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
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
              className="w-full max-w-lg bg-surface shadow-float rounded-panel p-5  flex flex-col gap-4 text-xs"
            >
              <div className="relative flex items-center justify-center pb-3 border-b border-separator">
                <span className="text-[15px] font-semibold text-label">
                  {modalMode === 'export' ? 'Экспорт графа' : 'Импорт графа'}
                </span>
                <button
                  onClick={() => setModalMode(null)}
                  className="absolute right-0 w-7 h-7 rounded-full bg-fill active:scale-95 flex items-center justify-center text-secondary hover:text-label transition-all"
                  aria-label="Закрыть"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-secondary font-medium block">
                  {modalMode === 'export'
                    ? 'JSON-структура текущего графа:'
                    : 'Вставьте структуру графа (JSON):'}
                </label>
                <textarea
                  value={jsonInputText}
                  onChange={e => setJsonInputText(e.target.value)}
                  readOnly={modalMode === 'export'}
                  placeholder="Вставьте JSON сюда..."
                  className="w-full h-60 p-3 bg-fill rounded-card font-mono text-[12px] text-label focus:outline-none focus:ring-2 focus:ring-accent/60 resize-none"
                />
                {importError && modalMode === 'import' && (
                  <p role="alert" className="text-[12px] text-danger">
                    {importError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-separator">
                {modalMode === 'export' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="px-4 py-2 bg-fill hover:bg-fill-hover active:scale-[0.97] text-label font-medium rounded-card transition-all flex items-center gap-2 text-[13px]"
                    >
                      {copyStatus ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copyStatus ? 'Скопировано!' : 'Копировать'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalMode(null)}
                      className="px-4 py-2 bg-accent-fill hover:bg-accent-fill/90 active:scale-[0.97] text-white font-semibold rounded-card transition-all text-[13px]"
                    >
                      Готово
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setModalMode(null)}
                      className="px-4 py-2 bg-fill hover:bg-fill-hover active:scale-[0.97] text-label font-medium rounded-card transition-all text-[13px]"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      className="px-4 py-2 bg-accent-fill hover:bg-accent-fill/90 active:scale-[0.97] text-white font-semibold rounded-card transition-all flex items-center gap-1.5 text-[13px]"
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

      <AlertDialog state={dialog} onClose={closeDialog} />

      {/* Контекстное меню */}
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
            className="absolute z-50 material rounded-card p-[5px]  min-w-[190px] flex flex-col gap-0.5 text-xs"
          >
            {contextMenu.type === 'node' && (
              <>
                <div className="px-2.5 py-1 text-[12px] text-secondary font-semibold  border-b border-separator mb-0.5">
                  Узел: {graphBuilderRef.current.nodes.get(contextMenu.id)?.label}
                </div>

                <button
                  onClick={() => handleRenameNode(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-label hover:bg-fill-hover rounded-control transition-colors font-medium text-[13px]"
                >
                  <Pencil className="w-3.5 h-3.5 text-secondary" />
                  <span>Переименовать</span>
                </button>

                <button
                  onClick={() => {
                    setStartNode(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-label hover:bg-fill-hover rounded-control transition-colors font-medium text-[13px]"
                >
                  <Flag className="w-3.5 h-3.5 text-secondary" />
                  <span>Выбрать началом</span>
                </button>

                <button
                  onClick={() => {
                    setTargetNode(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-label hover:bg-fill-hover rounded-control transition-colors font-medium text-[13px]"
                >
                  <Target className="w-3.5 h-3.5 text-secondary" />
                  <span>Выбрать целью</span>
                </button>

                <button
                  onClick={() => {
                    const id = contextMenu.id;
                    setWaypoints(w => (w.includes(id) ? w.filter(x => x !== id) : [...w, id]));
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-label hover:bg-fill-hover rounded-control transition-colors font-medium text-[13px]"
                >
                  <CornerDownRight className="w-3.5 h-3.5 text-secondary" />
                  <span>{waypoints.includes(contextMenu.id) ? 'Убрать из маршрута' : 'Провести через узел'}</span>
                </button>

                <div className="my-0.5 border-t border-separator" />

                <button
                  onClick={() => handleDeleteNode(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-danger hover:bg-danger/15 rounded-control transition-colors font-medium text-[13px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить узел</span>
                </button>
              </>
            )}

            {contextMenu.type === 'edge' && (
              <>
                <div className="px-2.5 py-1 text-[12px] text-secondary font-semibold  border-b border-separator mb-0.5">
                  Ребро
                </div>

                <button
                  onClick={() => handleEditEdgeWeight(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-label hover:bg-fill-hover rounded-control transition-colors font-medium text-[13px]"
                >
                  <Scale className="w-3.5 h-3.5 text-secondary" />
                  <span>Изменить вес</span>
                </button>

                {directed && (
                  <button
                    onClick={() => handleReverseEdge(contextMenu.id)}
                    className="flex items-center gap-2 px-2.5 py-[7px] text-left text-label hover:bg-fill-hover rounded-control transition-colors font-medium text-[13px]"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-secondary" />
                    <span>Развернуть направление</span>
                  </button>
                )}

                <div className="my-0.5 border-t border-separator" />

                <button
                  onClick={() => handleDeleteEdge(contextMenu.id)}
                  className="flex items-center gap-2 px-2.5 py-[7px] text-left text-danger hover:bg-danger/15 rounded-control transition-colors font-medium text-[13px]"
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