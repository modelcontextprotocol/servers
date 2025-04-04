/**
 * Validation Utilities for Sequential Thinking Server
 */
import { ThoughtData } from './types.js';

/**
 * Validates the structure and types of incoming thought data.
 * Throws an error if validation fails.
 * @param input The raw input data.
 * @returns Validated ThoughtData object.
 */
export function validateThoughtData(input: unknown): ThoughtData {
  const data = input as Record<string, unknown>;

  if (!data.thought || typeof data.thought !== 'string') {
    throw new Error('Invalid thought: must be a string');
  }
  if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
    throw new Error('Invalid thoughtNumber: must be a number');
  }
  if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
    throw new Error('Invalid totalThoughts: must be a number');
  }
  if (typeof data.nextThoughtNeeded !== 'boolean') {
    throw new Error('Invalid nextThoughtNeeded: must be a boolean');
  }

  // Validate confidence level if provided
  if (data.confidenceLevel !== undefined && 
      (typeof data.confidenceLevel !== 'number' || 
       data.confidenceLevel < 0 || 
       data.confidenceLevel > 100)) {
    throw new Error('Invalid confidenceLevel: must be a number between 0 and 100');
  }

  // Validate validation status if provided
  if (data.validationStatus !== undefined && 
      !['valid', 'invalid', 'uncertain'].includes(data.validationStatus as string)) {
    throw new Error('Invalid validationStatus: must be "valid", "invalid", or "uncertain"');
  }

  // Return a validated ThoughtData object (casting/asserting types)
  return {
    thought: data.thought as string,
    thoughtNumber: data.thoughtNumber as number,
    totalThoughts: data.totalThoughts as number,
    nextThoughtNeeded: data.nextThoughtNeeded as boolean,
    isRevision: data.isRevision as boolean | undefined,
    revisesThought: data.revisesThought as number | undefined,
    branchFromThought: data.branchFromThought as number | undefined,
    branchId: data.branchId as string | undefined,
    needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
    isChainOfThought: data.isChainOfThought as boolean | undefined,
    isHypothesis: data.isHypothesis as boolean | undefined,
    isVerification: data.isVerification as boolean | undefined,
    chainOfThoughtStep: data.chainOfThoughtStep as number | undefined,
    totalChainOfThoughtSteps: data.totalChainOfThoughtSteps as number | undefined,
    confidenceLevel: data.confidenceLevel as number | undefined,
    hypothesisId: data.hypothesisId as string | undefined,
    mergeBranchId: data.mergeBranchId as string | undefined,
    mergeBranchPoint: data.mergeBranchPoint as number | undefined,
    validationStatus: data.validationStatus as 'valid' | 'invalid' | 'uncertain' | undefined,
    validationReason: data.validationReason as string | undefined,
  };
}

/**
 * Validates a Chain of Thought step.
 * @param thought The ThoughtData object to validate.
 * @returns An object indicating validity and reason.
 */
export function validateChainOfThought(thought: ThoughtData): { isValid: boolean; reason: string } {
  // Simple validation: check if the thought is part of a Chain of Thought sequence
  if (!thought.isChainOfThought) {
    return { isValid: false, reason: 'Not part of a Chain of Thought sequence' };
  }

  // Check if the thought has a valid step number
  if (!thought.chainOfThoughtStep || !thought.totalChainOfThoughtSteps) {
    return { isValid: false, reason: 'Missing Chain of Thought step information' };
  }

  // Check if the step number is valid
  if (thought.chainOfThoughtStep > thought.totalChainOfThoughtSteps) {
    return { isValid: false, reason: 'Chain of Thought step number exceeds total steps' };
  }

  // More complex validation could be added here, such as checking for logical consistency
  // between steps, ensuring hypotheses are followed by verifications, etc.

  return { isValid: true, reason: 'Valid Chain of Thought step' };
}
