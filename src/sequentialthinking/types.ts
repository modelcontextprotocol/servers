/**
 * Type definitions for the Sequential Thinking tool
 */

/**
 * Represents a single thought in the sequential thinking process
 */
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
  // Chain of Thought specific fields
  isChainOfThought?: boolean;
  isHypothesis?: boolean;
  isVerification?: boolean;
  chainOfThoughtStep?: number;
  totalChainOfThoughtSteps?: number;
  // Enhanced fields
  confidenceLevel?: number; // 0-100 confidence level for hypotheses
  hypothesisId?: string; // For multiple hypotheses support
  mergeBranchId?: string; // For merging branches
  mergeBranchPoint?: number; // The thought number where branches merge
  validationStatus?: 'valid' | 'invalid' | 'uncertain'; // For Chain of Thought validation
  validationReason?: string; // Reason for validation status
}

/**
 * Represents a session of sequential thinking
 */
export interface SessionData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thoughtHistory: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
}

/**
 * Thinking pattern interface with enhanced ML capabilities
 */
export interface ThinkingPattern {
  type: string;
  description: string;
  thoughtNumbers: number[];
  significance: 'positive' | 'negative' | 'neutral';
  confidence?: number; // ML confidence score for pattern detection
}

/**
 * Pattern scores interface for ML-based analysis
 */
export interface PatternScores {
  linearConfidence: number;
  branchingConfidence: number;
  branchingComplexity: number;
  revisionConfidence: number;
  revisionQuality: number;
  cotConfidence: number;
  cotQuality: number;
  hypothesisVerificationConfidence: number;
  hypothesisVerificationQuality: number;
  repetitiveConfidence: number;
}

/**
 * Cognitive bias detection interface
 */
export interface CognitiveBias {
  type: string;
  description: string;
  thoughtNumbers: number[];
  confidence: number;
}
