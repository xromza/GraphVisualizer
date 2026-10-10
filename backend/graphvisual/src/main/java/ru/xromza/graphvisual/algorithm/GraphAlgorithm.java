package ru.xromza.graphvisual.algorithm;

public interface GraphAlgorithm {
    enum TYPES {
        BFS {
            public GraphAlgorithm create() { return new BfsAlgorithm(); }
        },
        DFS {
            public GraphAlgorithm create() { return new DfsAlgorithm(); }
        },
        DIJKSTRA {
            public GraphAlgorithm create() { return new DijkstraAlgorithm(); }
        },
        ASTAR {
           public GraphAlgorithm create() { return new AStarAlgorithm(); } 
        }
    }
}
