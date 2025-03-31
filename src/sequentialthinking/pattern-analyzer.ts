/**
 * Pattern Analyzer for Sequential Thinking
 *
 * This module implements the PatternAnalyzer component that identifies patterns
 * in thinking sessions.
 */

import { ThoughtData, ThinkingPattern } from './types.js';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator

 /**
  * PatternAnalyzer class
  */
 export class PatternAnalyzer {
  /**
   * Identify patterns in the thinking
   */
  public identifyPatterns(thoughtHistory: ThoughtData[]): ThinkingPattern[] {
    const patterns: ThinkingPattern[] = [];

    // Identify linear thinking pattern
    if (this.isLinearThinking(thoughtHistory)) {
      patterns.push({
        id: uuidv4(),
        name: 'Linear Thinking',
        description: 'Thoughts follow a single, sequential path without branching or revision.',
        thoughts: thoughtHistory,
        confidence: 0.8
      });
    }

    // Identify branching pattern
    const branchingThoughts = thoughtHistory.filter(t => t.branchFromThought);
    if (branchingThoughts.length > 0) {
      patterns.push({
        id: uuidv4(),
        name: 'Branching',
        description: 'Exploration of alternative paths or ideas.',
        thoughts: branchingThoughts,
        confidence: 0.9
      });
    }

    // Identify revision pattern
    const revisionThoughts = thoughtHistory.filter(t => t.isRevision);
    if (revisionThoughts.length > 0) {
      patterns.push({
        id: uuidv4(),
        name: 'Revision',
        description: 'Revisiting and modifying previous thoughts.',
        thoughts: revisionThoughts,
        confidence: 0.85
      });
    }

    // Identify Chain of Thought pattern
    const cotThoughts = thoughtHistory.filter(t => t.isChainOfThought);
    if (cotThoughts.length > 0) {
      patterns.push({
        id: uuidv4(),
        name: 'Chain of Thought',
        description: 'Explicit step-by-step reasoning process.',
        thoughts: cotThoughts,
        confidence: 0.95
      });
    }

    // Identify Hypothesis-Verification pattern
    const hypothesisThoughts = thoughtHistory.filter(t => t.isHypothesis);
    const verificationThoughts = thoughtHistory.filter(t => t.isVerification);
    if (hypothesisThoughts.length > 0 && verificationThoughts.length > 0) {
      patterns.push({
        id: uuidv4(),
        name: 'Hypothesis-Verification',
        description: 'Formulating and testing hypotheses.',
        thoughts: [...hypothesisThoughts, ...verificationThoughts],
        confidence: 0.9
      });
    }

    // Identify Repetitive Thinking pattern
    if (this.hasRepetitiveThinking(thoughtHistory)) {
      patterns.push({
        id: uuidv4(),
        name: 'Repetitive Thinking',
        description: 'Circling back to the same ideas without progress.',
        thoughts: this.getRepetitiveThoughts(thoughtHistory),
        confidence: 0.7
      });
    }

    // Identify Confirmation Bias pattern
    if (this.hasConfirmationBias(thoughtHistory)) {
      patterns.push({
        id: uuidv4(),
        name: 'Confirmation Bias',
        description: 'Favoring information that confirms pre-existing beliefs.',
        thoughts: this.getConfirmationBiasThoughts(thoughtHistory),
        confidence: 0.6
      });
    }

    // Identify Anchoring Bias pattern
    if (this.hasAnchoringBias(thoughtHistory)) {
      patterns.push({
        id: uuidv4(),
        name: 'Anchoring Bias',
        description: 'Over-reliance on the first piece of information encountered.',
        thoughts: this.getAnchoringBiasThoughts(thoughtHistory),
        confidence: 0.65
      });
    }

    // Identify Learning/Improvement pattern
    if (this.showsLearningImprovement(thoughtHistory)) {
      patterns.push({
        id: uuidv4(),
        name: 'Learning/Improvement',
        description: 'Demonstrates learning from previous steps or feedback.',
        thoughts: this.getLearningImprovementThoughts(thoughtHistory),
        confidence: 0.8
      });
    }

    // Identify Adaptive Thinking pattern
    if (this.showsAdaptiveThinking(thoughtHistory)) {
      patterns.push({
        id: uuidv4(),
        name: 'Adaptive Thinking',
        description: 'Adjusts approach based on new information or changing context.',
        thoughts: this.getAdaptiveThinkingThoughts(thoughtHistory),
        confidence: 0.85
      });
    }

    return patterns;
  }

  /**
   * Check if the thinking process is primarily linear
   */
  private isLinearThinking(thoughts: ThoughtData[]): boolean {
    // Simplified check: linear if no branching or revision
    return !thoughts.some(t => t.branchFromThought || t.isRevision);
  }

  /**
   * Check for repetitive thinking patterns
   */
  public hasRepetitiveThinking(thoughtHistory: ThoughtData[]): boolean { // Made public
    // Simplified implementation: Check if the last few thoughts are very similar
    if (thoughtHistory.length < 3) return false;
    const lastThree = thoughtHistory.slice(-3);
    const thoughtTexts = lastThree.map(t => t.thought.toLowerCase().trim());
    return thoughtTexts[0] === thoughtTexts[1] || thoughtTexts[1] === thoughtTexts[2];
  }

  /**
   * Get thoughts involved in repetitive thinking
   */
  private getRepetitiveThoughts(thoughtHistory: ThoughtData[]): ThoughtData[] {
    // Simplified implementation
    if (this.hasRepetitiveThinking(thoughtHistory)) {
      return thoughtHistory.slice(-3);
    }
    return [];
  }

  /**
   * Check for confirmation bias
   */
  public hasConfirmationBias(thoughtHistory: ThoughtData[]): boolean { // Made public
    // Simplified implementation
    return false; // Placeholder
  }

  /**
   * Get thoughts potentially exhibiting confirmation bias
   */
  private getConfirmationBiasThoughts(thoughtHistory: ThoughtData[]): ThoughtData[] {
    // Simplified implementation
    return []; // Placeholder
  }

  /**
   * Check for anchoring bias
   */
  public hasAnchoringBias(thoughtHistory: ThoughtData[]): boolean { // Made public
    // Simplified implementation
    return false; // Placeholder
  }

  /**
   * Get thoughts potentially exhibiting anchoring bias
   */
  private getAnchoringBiasThoughts(thoughtHistory: ThoughtData[]): ThoughtData[] {
    // Simplified implementation
    return []; // Placeholder
  }

  /**
   * Check if the thinking process shows learning or improvement
   */
  private showsLearningImprovement(thoughts: ThoughtData[]): boolean {
    // Simplified check: Look for revisions that increase confidence or resolve issues
    return thoughts.some(t => t.isRevision && t.confidenceLevel && t.confidenceLevel > (thoughts.find(p => p.thoughtNumber === t.revisesThought)?.confidenceLevel || 0));
  }

  /**
   * Get thoughts demonstrating learning or improvement
   */
  private getLearningImprovementThoughts(thoughts: ThoughtData[]): ThoughtData[] {
    // Simplified implementation
    return thoughts.filter(t => t.isRevision && t.confidenceLevel && t.confidenceLevel > (thoughts.find(p => p.thoughtNumber === t.revisesThought)?.confidenceLevel || 0));
  }

  /**
   * Check if the thinking process shows adaptation
   */
  private showsAdaptiveThinking(thoughts: ThoughtData[]): boolean {
    // Simplified check: Look for branching or revision after low confidence or identified issues
    return thoughts.some((t, i) => (t.branchFromThought || t.isRevision) && i > 0 && (thoughts[i-1].confidenceLevel || 100) < 50);
  }

  /**
   * Get thoughts demonstrating adaptive thinking
   */
  private getAdaptiveThinkingThoughts(thoughts: ThoughtData[]): ThoughtData[] {
    // Simplified implementation
    return thoughts.filter((t, i) => (t.branchFromThought || t.isRevision) && i > 0 && (thoughts[i-1].confidenceLevel || 100) < 50);
  }
 }
