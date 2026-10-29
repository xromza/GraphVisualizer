'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import GraphVisualizer from '@/components/GraphVisualizer';
import type { Node, Edge, AlgorithmStep, AlgorithmRunRequest } from '@/lib/api';
import { streamAlgorithmSteps } from '@/lib/api';

export default function Home() {
  const [stepsHistory, setStepsHistory] = useState<AlgorithmStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(400);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const handleReset = useCallback(() => {
    handleStop();
    setStepsHistory([]);
    setCurrentStepIndex(-1);
    setError(null);
  }, [handleStop]);

  const handleStepChange = useCallback((index: number) => {
    handleStop();
    setCurrentStepIndex(index);
  }, [handleStop]);

  const handleAlgorithmRun = useCallback(
    async (
      nodes: Record<string, Node>,
      edges: Edge[],
      algorithmType: string,
      startNodeId: string,
      targetNodeId: string,
      waypointNodeIds: string[],
      directed: boolean
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsPlaying(true);
      setError(null);
      setStepsHistory([]);
      setCurrentStepIndex(-1);

      const request: AlgorithmRunRequest = {
        algorithmType,
        startNodeId,
        targetNodeId,
        waypointNodeIds,
        nodes,
        edges,
        directed,
      };

      try {
        const stepGenerator = streamAlgorithmSteps(request, abortController.signal);

        for await (const step of stepGenerator) {
          if (abortController.signal.aborted) break;

          setStepsHistory(prev => {
            const next = [...prev, step];
            setCurrentStepIndex(next.length - 1);
            return next;
          });

          if (step.status === 'COMPLETED' || step.status === 'ERROR') {
            setIsPlaying(false);
            if (step.status === 'ERROR') {
              setError('Алгоритм завершился с ошибкой. Проверьте граф и попробуйте снова.');
            }
            break;
          }

          await new Promise<void>((resolve) => {
            const timeoutId = setTimeout(resolve, speedMs);
            abortController.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              resolve();
            });
          });
        }
      } catch (err: unknown) {
        if (abortController.signal.aborted) return;
        console.error('Stream error:', err);
        setError(err instanceof Error ? err.message : 'Нет связи с сервером. Проверьте подключение и повторите.');
      } finally {
        if (abortControllerRef.current === abortController) {
          setIsPlaying(false);
          abortControllerRef.current = null;
        }
      }
    },
    [speedMs, handleStop]
  );

  const currentStep = currentStepIndex >= 0 && currentStepIndex < stepsHistory.length
    ? stepsHistory[currentStepIndex]
    : null;

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative w-full h-screen overflow-hidden bg-canvas">
      <GraphVisualizer
        onAlgorithmRun={handleAlgorithmRun}
        onStop={handleStop}
        onReset={handleReset}
        currentStep={currentStep}
        isPlaying={isPlaying}
        speedMs={speedMs}
        onSpeedChange={setSpeedMs}
        stepsCount={stepsHistory.length}
        currentStepIndex={currentStepIndex}
        onStepChange={handleStepChange}
      />

      {error && (
        <div
          role="alert"
          className="absolute top-4 right-4 z-50 material rounded-card px-4 py-3 max-w-sm"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <h3 className="font-semibold text-[13px] text-label">Не удалось выполнить</h3>
              <p className="text-[12px] text-secondary mt-0.5">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Закрыть уведомление"
              className="shrink-0 w-6 h-6 -mr-1 -mt-0.5 rounded-full flex items-center justify-center text-secondary hover:bg-fill-hover hover:text-label transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
    </MotionConfig>
  );
}
