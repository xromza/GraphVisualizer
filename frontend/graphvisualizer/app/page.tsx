'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
              setError('Ошибка при выполнении алгоритма');
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
        setError(err instanceof Error ? err.message : 'Ошибка подключения к серверу');
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
    <div className="relative w-full h-screen overflow-hidden bg-slate-950">
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
        <div className="absolute top-4 right-4 z-50 bg-red-900/90 border border-red-700 text-red-100 px-4 py-3 rounded-2xl shadow-xl max-w-md backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Ошибка</h3>
              <p className="text-xs text-red-200 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="flex-shrink-0 text-red-300 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}