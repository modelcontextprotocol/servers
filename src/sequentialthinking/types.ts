export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  isChainOfThought?: boolean;
  isHypothesis?: boolean;
  isVerification?: boolean;
  chainOfThoughtStep?: number;
  totalChainOfThoughtSteps?: number;
  confidenceLevel?: number;
  hypothesisId?: string;
  mergeBranchId?: string;
  mergeBranchPoint?: number;
  validationStatus?: 'valid' | 'invalid' | 'uncertain';
  validationReason?: string;
}

export interface ClaudeResponse {
  choices: { message: { content: string } }[];
}

export interface OptimizedPrompt {
  prompt: string;
  compressionStats: {
    originalTokens: number;
    optimizedTokens: number;
    compressionRatio: number;
  };
  original: string;
  optimized: string;
  stats: any;
}

export interface WorkingMemoryItem {
  id: string;
  content: string; // This is typically the summary for working memory items
  compressedContent?: Buffer | null; // Allow null for items originating from LTM
  metadata: {
    stage: ProcessingStage;
    timestamp: number;
    relevanceScore?: number;
    connections: string[];
    isCompressed?: boolean;
  };
}

export enum ProcessingStage {
  PREPARATION = 'preparation',
  ANALYSIS = 'analysis',
  SYNTHESIS = 'synthesis',
  EVALUATION = 'evaluation'
}

export interface ThoughtProcessingState {
  stage: ProcessingStage;
  workingMemory: WorkingMemoryItem[];
  currentThoughtNumber: number;
  sessionMetadata: Record<string, any>;
}

export interface ThinkingPattern {
  id: string;
  name: string;
  description: string;
  detectedInThoughts: number[];
  strength?: number;
  confidence?: number;         // Added to match usage in pattern-analyzer.ts
  thoughts?: ThoughtData[];
}

export type ThinkingIssueType = 
  | 'logical_fallacy' 
  | 'logical_gap'
  | 'bias' 
  | 'loop' 
  | 'dead_end' 
  | 'low_confidence'
  | 'premature_conclusion'
  | 'other';

export interface ThinkingIssue {
  id: string;
  type: ThinkingIssueType;
  description: string;
  severity: 'low' | 'medium' | 'high';
  relatedThoughts: number[];
  suggestion?: string;
}

export interface AIAdvice {
  focusArea: 'next_steps' | 'issues' | 'patterns' | 'overall';
  advice: string;
  confidence?: number;
  relatedPatterns?: ThinkingPattern[];
  relatedIssues?: ThinkingIssue[];
  adviceText?: string;
  supportingPatterns?: ThinkingPattern[];  // Added to match usage
}

export interface SessionData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thoughtHistory: ThoughtData[];
  thoughts?: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
}

export interface ValidationFeedback {
  isValid: boolean;
  reason?: string;
  suggestions?: string[];
  overallScore?: number;
  strengths?: string[];
  improvementAreas?: string[];
  logicalStructureScore?: number;  // Added to match usage
}

export interface ThoughtBranch {
  branchId: string;
  id: string;
  startThoughtNumber: number;
  thoughts: ThoughtData[];
}

// Added helper type for branch array reduction
export type BranchRecord = Record<string, ThoughtData[]>;

export interface ReasoningStep {
  stage: string;       // Stage of reasoning (e.g., "patternRecognition", "logicalInference")
  input: any;         // Input to the reasoning step
  reasoning: string;    // Description of the reasoning process applied
  output: any;        // Output of the reasoning step
  confidence: number; // Confidence score (0-1) for the step's outcome
}
