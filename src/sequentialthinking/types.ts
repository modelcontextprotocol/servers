export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

export interface MCTSConfig {
  explorationConstant?: number;
  maxSimulations?: number;
  maxDepth?: number;
}

export interface ThoughtEvaluation {
  score: number;
  confidence: number;
  suggestedActions: string[];
}