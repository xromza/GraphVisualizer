export interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
}

export interface AlgorithmListEntry {
  id: string;
  name: string;
}

export interface AlgorithmRunRequest {
  algorithmType: string;
  startNodeId: string;
  targetNodeId: string;
  nodes: Record<string, Node>;
  edges: Edge[];
  directed: boolean;
}


type CompressedAlgorithmRunRequest = Omit<AlgorithmRunRequest, 'nodes' | 'edges'> & {
  nodes: [string, string, number, number][];
  edges: [string, string, string, number][];
};

export interface AlgorithmStep {
  stepNumber: number;
  activeNodeId: string | null;
  visitedNodes: string[];
  distances: Record<string, number>;
  status: 'PROCESSING' | 'COMPLETED' | 'ERROR';
  path: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function getAlgorithms(): Promise<AlgorithmListEntry[]> {
  const response = await fetch(`${API_BASE}/algorithm/all`);
  if (!response.ok) throw new Error('Failed to fetch algorithms');
  return response.json();
}

export async function* streamAlgorithmSteps(
  request: AlgorithmRunRequest,
  signal?: AbortSignal
): AsyncGenerator<AlgorithmStep, void, unknown> {
  
  const compressedBody: CompressedAlgorithmRunRequest = {
    algorithmType: request.algorithmType,
    startNodeId: request.startNodeId,
    targetNodeId: request.targetNodeId,
    directed: request.directed,
    nodes: Object.values(request.nodes).map(node => [
      node.id, 
      node.label, 
      node.x, 
      node.y
    ]),
    edges: request.edges.map(edge => [
      edge.id, 
      edge.sourceId, 
      edge.targetId, 
      edge.weight
    ])
  };

  const response = await fetch(`${API_BASE}/algorithm/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(compressedBody),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim();
          if (data && data !== '[DONE]') {
            try {
              const step: AlgorithmStep = JSON.parse(data);
              yield step;
            } catch (e) {
              console.error('Failed to parse SSE data:', data, e);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
