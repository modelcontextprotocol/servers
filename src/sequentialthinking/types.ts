// Represents a single branch in the thinking process
export interface ThoughtBranch {
  id: string;
  startThoughtNumber: number;
  thoughts: ThoughtData[];
}

// Represents the overall session state
export interface SessionData {
  id: string;
  thoughts: ThoughtData[]; // Main thought history
  branches?: ThoughtBranch[]; // Optional branches
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

// Represents a single thought step
export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isChainOfThought?: boolean;
  chainOfThoughtStep?: number;
  totalChainOfThoughtSteps?: number;
  confidenceLevel?: number;
  isHypothesis?: boolean;
  isVerification?: boolean;
  // Optional fields based on errors
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  mergeBranchId?: string;
  mergeBranchPoint?: number;
  needsMoreThoughts?: boolean;
  hypothesisId?: string;
  validationStatus?: 'valid' | 'invalid' | 'uncertain';
  validationReason?: string;
}

// Represents an optimized prompt structure
export interface OptimizedPrompt {
  original: string;
  optimized: string;
  compressionStats: {
    originalTokens: number;
    optimizedTokens: number;
    compressionRatio: number;
  };
  prompt: string; // Added prompt property
}

// Represents validation feedback
export interface ValidationFeedback {
  overallScore: number;
  logicalStructureScore: number;
  evidenceQualityScore: number;
  assumptionValidityScore: number;
  conclusionStrengthScore: number;
  detectedFallacies: Array<{
    type: string;
    description: string;
    thoughtNumbers: number[];
    suggestionForImprovement: string;
  }>;
  gaps: Array<{
    description: string;
    betweenThoughts: [number, number];
    suggestionForImprovement: string;
  }>;
  strengths: string[];
  improvementAreas: string[];
}


// Represents identified patterns in thinking
export interface ThinkingPattern {
  id: string;
  name: string;
  description: string;
  thoughts: ThoughtData[]; // Thoughts exhibiting the pattern
  confidence: number; // Confidence in pattern identification
}

// Represents potential issues detected in the thinking process
export interface ThinkingIssue {
  id: string;
  type: 'logical_gap' | 'bias' | 'lack_of_depth' | 'premature_conclusion' | 'other';
  description: string;
  severity: 'low' | 'medium' | 'high';
  relatedThoughts: number[]; // Thought numbers involved
}

// Represents AI-generated advice based on the session
export interface AIAdvice {
  focusArea: 'next_steps' | 'issues' | 'patterns' | 'overall';
  adviceText: string;
  confidence: number;
  supportingPatterns?: ThinkingPattern[];
  relatedIssues?: ThinkingIssue[];
}

// Represents Claude API response
export interface ClaudeResponse {
  choices: [{
    message: {
      content: string;
    };
  }];
}
