import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { metacognition } from '../../metacognition.js';

describe('Metacognition', () => {
  describe('generateReflectionPrompt', () => {
    it('should return null for exploring phase', () => {
      const result = metacognition.generateReflectionPrompt('exploring', 'stable', false, 0.5);
      expect(result).toBeNull();
    });

    it('should return prompt when circularity detected in converging phase', () => {
      const result = metacognition.generateReflectionPrompt('converging', 'stable', true, 0.5);
      expect(result).not.toBeNull();
      expect(result).toContain('loop');
    });

    it('should return prompt when confidence declining in converging phase', () => {
      const result = metacognition.generateReflectionPrompt('converging', 'declining', false, 0.5);
      expect(result).not.toBeNull();
      expect(result).toContain('declining');
    });

    it('should return prompt when high confidence in converging phase', () => {
      const result = metacognition.generateReflectionPrompt('converging', 'improving', false, 0.85);
      expect(result).not.toBeNull();
      expect(result).toContain('missing');
    });

    it('should return multiple prompts for concluded phase', () => {
      const result = metacognition.generateReflectionPrompt('concluded', 'stable', false, 0.7);
      expect(result).not.toBeNull();
      expect(result === 'What is the single strongest counterargument to your conclusion?' || result === 'If you were wrong, what would prove it?').toBe(true);
    });

    it('should not prompt for evaluating phase even with issues', () => {
      const result = metacognition.generateReflectionPrompt('evaluating', 'declining', true, 0.3);
      expect(result).toBeNull();
    });
  });

  describe('recordEvaluation and getAdaptiveStrategy', () => {
    const TEST_PROBLEM_TYPE = 'test-problem-adaptation';

    beforeEach(() => {
      metacognition.recordEvaluation(TEST_PROBLEM_TYPE, 'branch', 'skeptic', 0.9);
      metacognition.recordEvaluation(TEST_PROBLEM_TYPE, 'branch', 'skeptic', 0.7);
      metacognition.recordEvaluation(TEST_PROBLEM_TYPE, 'branch', 'skeptic', 0.8);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return null when insufficient history', () => {
      const result = metacognition.getAdaptiveStrategy('completely-unknown-problem-type-xyz');
      expect(result.recommendedStrategy).toBeNull();
      expect(result.recommendedPerspective).toBeNull();
      expect(result.reasoning).toContain('Insufficient');
    });

    it('should recommend strategy after 3 evaluations', () => {
      const result = metacognition.getAdaptiveStrategy(TEST_PROBLEM_TYPE);
      expect(result.recommendedStrategy).toBe('branch');
      expect(result.recommendedPerspective).toBe('skeptic');
      expect(result.reasoning).toContain('0.80');
    });

    it('should track multiple problem types separately', () => {
      metacognition.recordEvaluation('other-problem', 'continue', 'optimist', 0.5);
      metacognition.recordEvaluation('other-problem', 'continue', 'optimist', 0.6);
      metacognition.recordEvaluation('other-problem', 'continue', 'optimist', 0.7);
      const result1 = metacognition.getAdaptiveStrategy(TEST_PROBLEM_TYPE);
      const result2 = metacognition.getAdaptiveStrategy('other-problem');
      expect(result1.recommendedStrategy).toBe('branch');
      expect(result2.recommendedStrategy).toBe('continue');
    });
  });

  describe('analyzeReasoningGaps', () => {
    it('should detect premature conclusion (only 1 prior thought)', () => {
      const thoughts = [
        { thought: 'First thought', thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true },
        { thought: 'Therefore, this is the answer', thoughtNumber: 2, totalThoughts: 3, nextThoughtNeeded: true },
      ];
      const result = metacognition.analyzeReasoningGaps(thoughts);
      expect(result.hasGaps).toBe(true);
      expect(result.gaps[0].issue).toContain('Premature');
    });

    it('should detect conclusion lacking evidence markers', () => {
      const thoughts = [
        { thought: 'The sky is blue', thoughtNumber: 1, totalThoughts: 4, nextThoughtNeeded: true },
        { thought: 'It is raining', thoughtNumber: 2, totalThoughts: 4, nextThoughtNeeded: true },
        { thought: 'Therefore, the sky is green', thoughtNumber: 3, totalThoughts: 4, nextThoughtNeeded: true },
      ];
      const result = metacognition.analyzeReasoningGaps(thoughts);
      expect(result.hasGaps).toBe(true);
      expect(result.gaps[0].issue).toContain('evidence');
    });

    it('should return no gaps for well-reasoned thoughts with evidence markers', () => {
      const thoughts = [
        { thought: 'The sky appears blue because of Rayleigh scattering', thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true },
        { thought: 'However, clouds can make it appear gray', thoughtNumber: 2, totalThoughts: 3, nextThoughtNeeded: true },
        { thought: 'Therefore, sky color depends on atmospheric conditions', thoughtNumber: 3, totalThoughts: 3, nextThoughtNeeded: true },
      ];
      const result = metacognition.analyzeReasoningGaps(thoughts);
      expect(result.hasGaps).toBe(false);
    });

    it('should detect multiple gap types in same chain', () => {
      const thoughts = [
        { thought: 'Test failed', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true },
        { thought: 'Therefore, the code is correct', thoughtNumber: 2, totalThoughts: 2, nextThoughtNeeded: false },
      ];
      const result = metacognition.analyzeReasoningGaps(thoughts);
      expect(result.hasGaps).toBe(true);
      expect(result.gaps.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty thoughts', () => {
      const result = metacognition.analyzeReasoningGaps([]);
      expect(result.hasGaps).toBe(false);
      expect(result.gaps).toHaveLength(0);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 0 for disjoint sets', () => {
      const setA = new Set(['apple', 'banana']);
      const setB = new Set(['cat', 'dog']);
      const result = metacognition.jaccardSimilarity(setA, setB);
      expect(result).toBe(0);
    });

    it('should return 1 for identical sets', () => {
      const setA = new Set(['apple', 'banana']);
      const setB = new Set(['banana', 'apple']);
      const result = metacognition.jaccardSimilarity(setA, setB);
      expect(result).toBe(1);
    });

    it('should return 0.5 for partial overlap', () => {
      const setA = new Set(['apple', 'banana', 'cherry']);
      const setB = new Set(['banana', 'cherry', 'date']);
      const result = metacognition.jaccardSimilarity(setA, setB);
      expect(result).toBe(0.5);
    });
  });

  describe('tokenize', () => {
    it('should remove stop words', () => {
      const result = metacognition.tokenize('The quick brown fox');
      expect(result.has('quick')).toBe(true);
      expect(result.has('brown')).toBe(true);
      expect(result.has('fox')).toBe(true);
      expect(result.has('the')).toBe(false);
    });

    it('should lowercase and remove punctuation', () => {
      const result = metacognition.tokenize('Hello, World! TEST.');
      expect(result.has('hello')).toBe(true);
      expect(result.has('world')).toBe(true);
      expect(result.has('test')).toBe(true);
    });

    it('should filter short words', () => {
      const result = metacognition.tokenize('I am ok');
      expect(result.size).toBe(0);
    });
  });

  describe('analyzeComplexity', () => {
    it('should return simple for insufficient thoughts', () => {
      const thoughts = [{ thought: 'Just one thought', thoughtNumber: 1, totalThoughts: 1, nextThoughtNeeded: true }];
      const result = metacognition.analyzeComplexity(thoughts);
      expect(result.complexity).toBe('simple');
      expect(result.recommendedMode).toBe('fast');
    });

    it('should detect complex technical problems', () => {
      const thoughts = [
        { thought: 'I need to design and implement a complex algorithm to optimize the system architecture for performance', thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true },
        { thought: 'The current implementation has O(n^2) complexity, however there are multiple tradeoffs to consider', thoughtNumber: 2, totalThoughts: 3, nextThoughtNeeded: true },
        { thought: 'How can I reduce it to O(n log n) versus using alternative data structures?', thoughtNumber: 3, totalThoughts: 3, nextThoughtNeeded: false },
      ];
      const result = metacognition.analyzeComplexity(thoughts);
      expect(['moderate', 'complex']).toContain(result.complexity);
    });

    it('should detect moderate complexity with tradeoffs', () => {
      const thoughts = [
        { thought: 'We need to decide between option A or B', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true },
        { thought: 'Option A is faster but more expensive, however option B has tradeoffs', thoughtNumber: 2, totalThoughts: 2, nextThoughtNeeded: false },
      ];
      const result = metacognition.analyzeComplexity(thoughts);
      expect(['moderate', 'complex']).toContain(result.complexity);
    });

    it('should suggest fast for simple questions', () => {
      const thoughts = [
        { thought: 'What is 2 + 2?', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true },
        { thought: 'It is 4', thoughtNumber: 2, totalThoughts: 2, nextThoughtNeeded: false },
      ];
      const result = metacognition.analyzeComplexity(thoughts);
      expect(result.complexity).toBe('simple');
      expect(result.recommendedMode).toBe('fast');
    });
  });
});
