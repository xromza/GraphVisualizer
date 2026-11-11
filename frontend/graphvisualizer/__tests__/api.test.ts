import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAlgorithms, streamAlgorithmSteps, type AlgorithmRunRequest, type AlgorithmStep } from '@/lib/api';

afterEach(() => vi.unstubAllGlobals());

const enc = new TextEncoder();
const sseResponse = (chunks: string[], init: ResponseInit = { status: 200 }) =>
  new Response(
    new ReadableStream({
      start(c) { chunks.forEach(ch => c.enqueue(enc.encode(ch))); c.close(); },
    }),
    init
  );

const step = (n: number): AlgorithmStep => ({
  stepNumber: n, activeNodeId: 'A', visitedNodes: ['A'], distances: { A: 0 }, status: 'PROCESSING', path: [],
});

const request: AlgorithmRunRequest = {
  algorithmType: 'DIJKSTRA',
  startNodeId: 'A',
  targetNodeId: 'B',
  nodes: {
    A: { id: 'A', label: 'A', x: 1, y: 2 },
    B: { id: 'B', label: 'B', x: 3, y: 4 },
  },
  edges: [{ id: 'e1', sourceId: 'A', targetId: 'B', weight: 7 }],
  directed: true,
};

const collect = async (gen: AsyncGenerator<AlgorithmStep>) => {
  const out: AlgorithmStep[] = [];
  for await (const s of gen) out.push(s);
  return out;
};

describe('getAlgorithms', () => {
  it('returns parsed JSON', async () => {
    const data = [{ id: 'DIJKSTRA', name: 'Dijkstra' }];
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(getAlgorithms()).resolves.toEqual(data);
    expect(f.mock.calls[0][0]).toMatch(/\/algorithm\/all$/);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 500 })));
    await expect(getAlgorithms()).rejects.toThrow('Failed to fetch algorithms');
  });
});

describe('streamAlgorithmSteps', () => {
  it('sends a compressed body with SSE accept header', async () => {
    const f = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal('fetch', f);
    const ctrl = new AbortController();
    await collect(streamAlgorithmSteps(request, ctrl.signal));

    const [url, init] = f.mock.calls[0];
    expect(url).toMatch(/\/algorithm\/run$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Accept).toBe('text/event-stream');
    expect(init.signal).toBe(ctrl.signal);
    expect(JSON.parse(init.body)).toEqual({
      algorithmType: 'DIJKSTRA',
      startNodeId: 'A',
      targetNodeId: 'B',
      waypointNodeIds: [],
      directed: true,
      nodes: [['A', 'A', 1, 2], ['B', 'B', 3, 4]],
      edges: [['e1', 'A', 'B', 7]],
    });
  });

  it('passes waypoints through', async () => {
    const f = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal('fetch', f);
    await collect(streamAlgorithmSteps({ ...request, waypointNodeIds: ['C'] }));
    expect(JSON.parse(f.mock.calls[0][1].body).waypointNodeIds).toEqual(['C']);
  });

  it('yields steps parsed from data: lines', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse([`data: ${JSON.stringify(step(1))}\n\n`, `data:${JSON.stringify(step(2))}\n\n`])
    ));
    const out = await collect(streamAlgorithmSteps(request));
    expect(out.map(s => s.stepNumber)).toEqual([1, 2]);
  });

  it('reassembles events split across chunks', async () => {
    const line = `data: ${JSON.stringify(step(1))}\n`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse([line.slice(0, 10), line.slice(10, 25), line.slice(25) + '\n'])
    ));
    expect(await collect(streamAlgorithmSteps(request))).toEqual([step(1)]);
  });

  it('skips comments, [DONE], empty data and other fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse([`: keepalive\n`, `event: step\n`, `data:\n`, `data: ${JSON.stringify(step(1))}\n`, `data: [DONE]\n`])
    ));
    expect(await collect(streamAlgorithmSteps(request))).toEqual([step(1)]);
  });

  it('logs and skips malformed JSON', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse([`data: {oops\n`, `data: ${JSON.stringify(step(2))}\n`])
    ));
    const out = await collect(streamAlgorithmSteps(request));
    expect(out.map(s => s.stepNumber)).toEqual([2]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(collect(streamAlgorithmSteps(request))).rejects.toThrow('HTTP error! status: 503');
  });

  it('throws when there is no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, body: null }));
    await expect(collect(streamAlgorithmSteps(request))).rejects.toThrow('No response body');
  });
});
