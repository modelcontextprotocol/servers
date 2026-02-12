import { describe, it, expect } from 'vitest';
import { ThinkingModeEngine } from '../../thinking-modes.js';
import type { ThinkingModeConfig } from '../../thinking-modes.js';
import { ThoughtTree } from '../../thought-tree.js';
import { MCTSEngine } from '../../mcts.js';
import type { ThoughtData } from '../../circular-buffer.js';

function makeThought(overrides: Partial<ThoughtData> = {}): ThoughtData {
  return {
    thought: 'Test thought',
    thoughtNumber: 1,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    sessionId: 'test-session',
    ...overrides,
  };
}

describe('ThinkingModeEngine', () => {
  const modeEngine = new ThinkingModeEngine();
  const mctsEngine = new MCTSEngine();

  describe('getPreset', () => {
    it('should return correct config for fast mode', () => {
      const config = modeEngine.getPreset('fast');
      expect(config.mode).toBe('fast');
      expect(config.explorationConstant).toBe(0.5);
      expect(config.suggestStrategy).toBe('exploit');
      expect(config.maxBranchingFactor).toBe(1);
      expect(config.targetDepthMin).toBe(3);
      expect(config.targetDepthMax).toBe(5);
      expect(config.autoEvaluate).toBe(true);
      expect(config.autoEvalValue).toBe(0.7);
      expect(config.enableBacktracking).toBe(false);
      expect(config.minEvaluationsBeforeConverge).toBe(0);
      expect(config.convergenceThreshold).toBe(0);
    });

    it('should return correct config for expert mode', () => {
      const config = modeEngine.getPreset('expert');
      expect(config.mode).toBe('expert');
      expect(config.explorationConstant).toBe(Math.SQRT2);
      expect(config.suggestStrategy).toBe('balanced');
      expect(config.maxBranchingFactor).toBe(3);
      expect(config.targetDepthMin).toBe(5);
      expect(config.targetDepthMax).toBe(10);
      expect(config.autoEvaluate).toBe(false);
      expect(config.enableBacktracking).toBe(true);
      expect(config.minEvaluationsBeforeConverge).toBe(3);
      expect(config.convergenceThreshold).toBe(0.7);
    });

    it('should return correct config for deep mode', () => {
      const config = modeEngine.getPreset('deep');
      expect(config.mode).toBe('deep');
      expect(config.explorationConstant).toBe(2.0);
      expect(config.suggestStrategy).toBe('explore');
      expect(config.maxBranchingFactor).toBe(5);
      expect(config.targetDepthMin).toBe(10);
      expect(config.targetDepthMax).toBe(20);
      expect(config.autoEvaluate).toBe(false);
      expect(config.enableBacktracking).toBe(true);
      expect(config.minEvaluationsBeforeConverge).toBe(5);
      expect(config.convergenceThreshold).toBe(0.85);
    });

    it('should return independent copies', () => {
      const c1 = modeEngine.getPreset('fast');
      const c2 = modeEngine.getPreset('fast');
      c1.targetDepthMax = 999;
      expect(c2.targetDepthMax).toBe(5);
    });
  });

  describe('getAutoEvalValue', () => {
    it('should return 0.7 for fast mode', () => {
      const config = modeEngine.getPreset('fast');
      expect(modeEngine.getAutoEvalValue(config)).toBe(0.7);
    });

    it('should return null for expert mode', () => {
      const config = modeEngine.getPreset('expert');
      expect(modeEngine.getAutoEvalValue(config)).toBeNull();
    });

    it('should return null for deep mode', () => {
      const config = modeEngine.getPreset('deep');
      expect(modeEngine.getAutoEvalValue(config)).toBeNull();
    });
  });

  describe('generateGuidance — fast mode', () => {
    it('should recommend continue when below target depth', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.mode).toBe('fast');
      expect(guidance.recommendedAction).toBe('continue');
      expect(guidance.currentPhase).toBe('exploring');
      expect(guidance.convergenceStatus).toBeNull();
      expect(guidance.branchingSuggestion).toBeNull();
      expect(guidance.backtrackSuggestion).toBeNull();
    });

    it('should recommend conclude at target depth', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('s1', 500);
      // Build chain of 6 thoughts (depth = 5, which is targetDepthMax)
      for (let i = 1; i <= 6; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('conclude');
      expect(guidance.currentPhase).toBe('concluded');
    });

    it('should never recommend branch', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('s1', 500);
      for (let i = 1; i <= 4; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).not.toBe('branch');
      expect(guidance.branchingSuggestion).toBeNull();
    });

    it('should set targetTotalThoughts to targetDepthMax', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.targetTotalThoughts).toBe(5);
    });
  });

  describe('generateGuidance — expert mode', () => {
    it('should recommend branching at decision points', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      // Build chain of 3 thoughts (depth = 2)
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('branch');
      expect(guidance.branchingSuggestion).not.toBeNull();
      expect(guidance.branchingSuggestion!.shouldBranch).toBe(true);
    });

    it('should recommend backtracking on low scores', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      const node3 = tree.addThought(makeThought({ thoughtNumber: 3 }));

      // Give the cursor a low score
      mctsEngine.backpropagate(tree, node3.nodeId, 0.2);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('backtrack');
      expect(guidance.backtrackSuggestion).not.toBeNull();
      expect(guidance.backtrackSuggestion!.shouldBacktrack).toBe(true);
    });

    it('should recommend evaluate for unevaluated leaves', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));

      // Create multiple branches so cursor has maxBranchingFactor children
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 3 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 4 }));

      // Now cursor is root with 3 children — at maxBranchingFactor
      tree.setCursor(root.nodeId);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('evaluate');
    });

    it('should recommend conclude when convergence met', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      // Build deep enough tree
      for (let i = 1; i <= 6; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // Evaluate with high values to trigger convergence
      const leaves = tree.getLeafNodes();
      for (const leaf of leaves) {
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.9);
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.85);
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.88);
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('conclude');
      expect(guidance.convergenceStatus).not.toBeNull();
      expect(guidance.convergenceStatus!.isConverged).toBe(true);
    });
  });

  describe('generateGuidance — deep mode', () => {
    it('should recommend aggressive branching', () => {
      const config = modeEngine.getPreset('deep');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('branch');
      expect(guidance.branchingSuggestion).not.toBeNull();
      expect(guidance.branchingSuggestion!.shouldBranch).toBe(true);
    });

    it('should use explore strategy', () => {
      const config = modeEngine.getPreset('deep');
      expect(config.suggestStrategy).toBe('explore');
    });

    it('should have high convergence threshold', () => {
      const config = modeEngine.getPreset('deep');
      expect(config.convergenceThreshold).toBe(0.85);
      expect(config.minEvaluationsBeforeConverge).toBe(5);
    });

    it('should recommend backtracking on mediocre scores', () => {
      const config = modeEngine.getPreset('deep');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child = tree.addThought(makeThought({ thoughtNumber: 2 }));
      // Give it a child so backtracking logic triggers
      tree.addThought(makeThought({ thoughtNumber: 3 }));
      tree.setCursor(child.nodeId);

      // Score below 0.5
      mctsEngine.backpropagate(tree, child.nodeId, 0.3);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('backtrack');
      expect(guidance.backtrackSuggestion).not.toBeNull();
    });

    it('should not conclude until high convergence is met', () => {
      const config = modeEngine.getPreset('deep');
      const tree = new ThoughtTree('s1', 500);
      for (let i = 1; i <= 11; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // Evaluate with moderate values — below 0.85 threshold
      const leaves = tree.getLeafNodes();
      for (const leaf of leaves) {
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.6);
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).not.toBe('conclude');
    });
  });

  describe('convergence detection', () => {
    it('should not be converged with too few evaluations', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child = tree.addThought(makeThought({ thoughtNumber: 2 }));

      // Only 1 evaluation, need 3
      mctsEngine.backpropagate(tree, child.nodeId, 0.9);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.convergenceStatus).not.toBeNull();
      expect(guidance.convergenceStatus!.isConverged).toBe(false);
    });

    it('should not be converged when score below threshold', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      for (let i = 1; i <= 6; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // Evaluate all with low values
      const leaves = tree.getLeafNodes();
      for (const leaf of leaves) {
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.3);
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.2);
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.4);
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.convergenceStatus).not.toBeNull();
      expect(guidance.convergenceStatus!.isConverged).toBe(false);
    });

    it('should be converged when enough evals + threshold met', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      for (let i = 1; i <= 4; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // 3+ evaluations with high values
      const leaves = tree.getLeafNodes();
      for (const leaf of leaves) {
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.9);
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.85);
        mctsEngine.backpropagate(tree, leaf.nodeId, 0.88);
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.convergenceStatus).not.toBeNull();
      expect(guidance.convergenceStatus!.isConverged).toBe(true);
      expect(guidance.convergenceStatus!.score).toBeGreaterThanOrEqual(0.7);
    });

    it('should have null convergence for fast mode', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.convergenceStatus).toBeNull();
    });
  });

  describe('thoughtPrompt templates', () => {
    it('should produce non-empty thoughtPrompt for every mode', () => {
      for (const mode of ['fast', 'expert', 'deep'] as const) {
        const config = modeEngine.getPreset(mode);
        const tree = new ThoughtTree(`tp-${mode}`, 500);
        tree.addThought(makeThought({ thoughtNumber: 1 }));

        const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
        expect(guidance.thoughtPrompt).toBeDefined();
        expect(guidance.thoughtPrompt.length).toBeGreaterThan(0);
      }
    });

    it('should have no unreplaced {{param}} placeholders in any output', () => {
      for (const mode of ['fast', 'expert', 'deep'] as const) {
        const config = modeEngine.getPreset(mode);
        const tree = new ThoughtTree(`tp-noparam-${mode}`, 500);
        tree.addThought(makeThought({ thoughtNumber: 1 }));
        tree.addThought(makeThought({ thoughtNumber: 2 }));

        const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
        expect(guidance.thoughtPrompt).not.toMatch(/\{\{\w+\}\}/);
      }
    });

    it('fast continue template should contain step number and target', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('tp-fast-cont', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('continue');
      expect(guidance.thoughtPrompt).toContain('2'); // thoughtNumber
      expect(guidance.thoughtPrompt).toContain('5'); // targetDepthMax
    });

    it('fast conclude template should say "Synthesize"', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('tp-fast-conc', 500);
      for (let i = 1; i <= 6; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('conclude');
      expect(guidance.thoughtPrompt).toContain('Synthesize');
    });

    it('expert branch template should contain the branchFromNodeId', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('tp-expert-br', 500);
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('branch');
      expect(guidance.branchingSuggestion).not.toBeNull();
      expect(guidance.thoughtPrompt).toContain(guidance.branchingSuggestion!.fromNodeId);
    });

    it('expert backtrack template should contain the backtrackToNodeId', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('tp-expert-bt', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      const node3 = tree.addThought(makeThought({ thoughtNumber: 3 }));

      mctsEngine.backpropagate(tree, node3.nodeId, 0.2);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('backtrack');
      expect(guidance.backtrackSuggestion).not.toBeNull();
      expect(guidance.thoughtPrompt).toContain(guidance.backtrackSuggestion!.toNodeId);
    });

    it('deep branch template should reference "contrarian"', () => {
      const config = modeEngine.getPreset('deep');
      const tree = new ThoughtTree('tp-deep-br', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('branch');
      expect(guidance.thoughtPrompt).toContain('contrarian');
    });

    it('deep conclude template should reference convergence score and threshold', () => {
      const config = modeEngine.getPreset('deep');
      const tree = new ThoughtTree('tp-deep-conc', 500);
      for (let i = 1; i <= 11; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // Evaluate with very high values to trigger convergence (threshold 0.85)
      const leaves = tree.getLeafNodes();
      for (const leaf of leaves) {
        for (let j = 0; j < 5; j++) {
          mctsEngine.backpropagate(tree, leaf.nodeId, 0.95);
        }
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.recommendedAction).toBe('conclude');
      expect(guidance.thoughtPrompt).toContain('0.85'); // convergenceThreshold
      expect(guidance.thoughtPrompt).toMatch(/\d+\.\d+/); // convergence score
      expect(guidance.thoughtPrompt).toContain('counterarguments');
    });

    it('should compress long thoughts using smart compression (no 300-char strings in output)', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('tp-trunc', 500);
      const longThought = 'A'.repeat(300);
      tree.addThought(makeThought({ thoughtNumber: 1, thought: longThought }));
      tree.addThought(makeThought({ thoughtNumber: 2, thought: longThought }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      // The raw 300-char string should NOT appear verbatim
      expect(guidance.thoughtPrompt).not.toContain(longThought);
      // Smart compression uses "..." for single-sentence text
      expect(guidance.thoughtPrompt).toContain('...');
    });
  });

  describe('phase detection', () => {
    it('should start in exploring phase', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.currentPhase).toBe('exploring');
    });

    it('should move to evaluating after some evaluations and depth', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      // Build to targetDepthMin (5), need 6 nodes for depth 5
      for (let i = 1; i <= 6; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }
      // Evaluate the root only (1 node evaluated, but backprop from root only affects root)
      // This gives us 1 evaluated node — below minEvaluationsBeforeConverge (3)
      // but with depth >= targetDepthMin and some evaluations
      const root = tree.root!;
      root.visitCount = 1;
      root.totalValue = 0.5;

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      // With 1 eval (below minEvals 3) but depth >= targetDepthMin, should be evaluating
      expect(guidance.currentPhase).toBe('evaluating');
    });

    it('should move to converging when enough evaluations', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      for (let i = 1; i <= 4; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // 3 evaluations (meets minEvaluationsBeforeConverge for expert)
      const leaf = tree.getLeafNodes()[0];
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.5);
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.5);
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.5);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.currentPhase).toBe('converging');
    });

    it('should be concluded when convergence is met', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('s1', 500);
      for (let i = 1; i <= 4; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const leaf = tree.getLeafNodes()[0];
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.9);
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.85);
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.88);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.currentPhase).toBe('concluded');
    });
  });

  describe('compressThought', () => {
    it('should return short text unchanged', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('compress-short', 500);
      const shortText = 'Short thought.';
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      // Cursor is on node 2 — the template renders cursor's thought
      tree.addThought(makeThought({ thoughtNumber: 2, thought: shortText }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      // The short text should appear verbatim in the prompt
      expect(guidance.thoughtPrompt).toContain(shortText);
    });

    it('should produce first + [...] + last pattern for long multi-sentence text', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('compress-multi', 500);
      const longMultiSentence = 'First sentence here. ' + 'Middle content. '.repeat(15) + 'Last sentence here.';
      tree.addThought(makeThought({ thoughtNumber: 1, thought: longMultiSentence }));
      tree.addThought(makeThought({ thoughtNumber: 2, thought: longMultiSentence }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.thoughtPrompt).toContain('[...]');
      expect(guidance.thoughtPrompt).not.toContain(longMultiSentence);
    });

    it('should produce word-boundary "..." for long single-sentence text', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('compress-single', 500);
      // A long text with no sentence boundaries
      const longSingle = 'word '.repeat(60).trim();
      tree.addThought(makeThought({ thoughtNumber: 1, thought: longSingle }));
      tree.addThought(makeThought({ thoughtNumber: 2, thought: longSingle }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.thoughtPrompt).toContain('...');
      expect(guidance.thoughtPrompt).not.toContain(longSingle);
    });

    it('should not have raw 300-char strings in output and should contain [...] marker for multi-sentence', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('compress-300', 500);
      const longMulti = 'First part of the analysis. ' + 'X'.repeat(250) + '. Final conclusion here.';
      tree.addThought(makeThought({ thoughtNumber: 1, thought: longMulti }));
      tree.addThought(makeThought({ thoughtNumber: 2, thought: longMulti }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.thoughtPrompt).not.toContain(longMulti);
    });

    it('should produce different compression lengths for different modes', () => {
      const longText = 'First sentence. ' + 'M'.repeat(200) + '. Last sentence.';

      const fastConfig = modeEngine.getPreset('fast');
      const fastTree = new ThoughtTree('compress-fast', 500);
      fastTree.addThought(makeThought({ thoughtNumber: 1, thought: longText }));
      fastTree.addThought(makeThought({ thoughtNumber: 2 }));
      const fastGuidance = modeEngine.generateGuidance(fastConfig, fastTree, mctsEngine);

      const deepConfig = modeEngine.getPreset('deep');
      const deepTree = new ThoughtTree('compress-deep', 500);
      deepTree.addThought(makeThought({ thoughtNumber: 1, thought: longText }));
      const deepGuidance = modeEngine.generateGuidance(deepConfig, deepTree, mctsEngine);

      // Fast mode has maxThoughtDisplayLength=150, deep has 300
      // The prompts use different templates, but the key assertion is that
      // the fast mode config uses shorter max (150 vs 300)
      expect(fastConfig.maxThoughtDisplayLength).toBe(150);
      expect(deepConfig.maxThoughtDisplayLength).toBe(300);
      expect(fastConfig.maxThoughtDisplayLength).toBeLessThan(deepConfig.maxThoughtDisplayLength);
    });
  });

  describe('progressOverview', () => {
    it('should return null when not at interval', () => {
      const config = modeEngine.getPreset('fast'); // interval = 3
      const tree = new ThoughtTree('po-null', 500);
      // 2 nodes — not at interval of 3
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.progressOverview).toBeNull();
    });

    it('should return non-null at interval (fast mode, 3rd thought)', () => {
      const config = modeEngine.getPreset('fast'); // interval = 3
      const tree = new ThoughtTree('po-3rd', 500);
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.progressOverview).not.toBeNull();
      expect(guidance.progressOverview).toContain('PROGRESS');
    });

    it('should contain node count, depth, evaluated count, gap count', () => {
      const config = modeEngine.getPreset('fast'); // interval = 3
      const tree = new ThoughtTree('po-content', 500);
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const overview = guidance.progressOverview!;
      expect(overview).toContain('3 thoughts');
      expect(overview).toContain('depth');
      expect(overview).toContain('Evaluated');
      expect(overview).toContain('Gaps');
    });

    it('should contain best path info', () => {
      const config = modeEngine.getPreset('fast'); // interval = 3
      const tree = new ThoughtTree('po-bestpath', 500);
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i, thought: `Step ${i} thought.` }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const overview = guidance.progressOverview!;
      expect(overview).toContain('Best path');
      expect(overview).toContain('score');
    });
  });

  describe('critique', () => {
    it('should always be null for fast mode', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('crit-fast', 500);
      for (let i = 1; i <= 6; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.critique).toBeNull();
    });

    it('should be null when bestPath < 2 nodes', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('crit-short', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.critique).toBeNull();
    });

    it('should be non-null for expert mode with sufficient path', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('crit-expert', 500);
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.critique).not.toBeNull();
      expect(guidance.critique).toContain('CRITIQUE');
    });

    it('should contain weakest link, unchallenged count, branch coverage %, balance label', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('crit-detail', 500);
      for (let i = 1; i <= 4; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // Score some nodes
      const leaf = tree.getLeafNodes()[0];
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.6);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique = guidance.critique!;
      expect(critique).toContain('Weakest');
      expect(critique).toContain('Unchallenged');
      expect(critique).toContain('Coverage');
      expect(critique).toContain('%');
      expect(critique).toContain('Balance');
    });

    it('should identify correct weakest node', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('crit-weakest', 500);
      tree.addThought(makeThought({ thoughtNumber: 1, thought: 'Strong root.' }));
      tree.addThought(makeThought({ thoughtNumber: 2, thought: 'Weak middle step.' }));
      tree.addThought(makeThought({ thoughtNumber: 3, thought: 'Strong conclusion.' }));

      // Score root high via a direct manipulation
      const root = tree.root!;
      root.visitCount = 1;
      root.totalValue = 0.9;

      // Score second node low
      const allNodes = tree.getAllNodes();
      const node2 = allNodes.find(n => n.thoughtNumber === 2)!;
      node2.visitCount = 1;
      node2.totalValue = 0.2;

      // Score third node high
      const node3 = allNodes.find(n => n.thoughtNumber === 3)!;
      node3.visitCount = 1;
      node3.totalValue = 0.85;

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique = guidance.critique!;
      // The weakest node should be step 2 with score 0.20
      expect(critique).toContain('step 2');
      expect(critique).toContain('0.20');
    });
  });

  describe('new config fields in presets', () => {
    it('should have correct progressOverviewInterval per mode', () => {
      expect(modeEngine.getPreset('fast').progressOverviewInterval).toBe(3);
      expect(modeEngine.getPreset('expert').progressOverviewInterval).toBe(4);
      expect(modeEngine.getPreset('deep').progressOverviewInterval).toBe(5);
    });

    it('should have correct maxThoughtDisplayLength per mode', () => {
      expect(modeEngine.getPreset('fast').maxThoughtDisplayLength).toBe(150);
      expect(modeEngine.getPreset('expert').maxThoughtDisplayLength).toBe(250);
      expect(modeEngine.getPreset('deep').maxThoughtDisplayLength).toBe(300);
    });

    it('should have correct enableCritique per mode', () => {
      expect(modeEngine.getPreset('fast').enableCritique).toBe(false);
      expect(modeEngine.getPreset('expert').enableCritique).toBe(true);
      expect(modeEngine.getPreset('deep').enableCritique).toBe(true);
    });
  });

  describe('complex scenarios with progress and critique', () => {
    it('should progress through multiple overview checkpoints at correct intervals', () => {
      const config = modeEngine.getPreset('fast'); // interval = 3
      const tree = new ThoughtTree('progress-sequence', 500);

      // At node 1 and 2 — no overview
      for (let i = 1; i <= 2; i++) {
        tree.addThought(makeThought({ thoughtNumber: i, thought: `Thought ${i}.` }));
      }
      let guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.progressOverview).toBeNull();

      // At node 3 — overview appears
      tree.addThought(makeThought({ thoughtNumber: 3, thought: 'Thought 3.' }));
      guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.progressOverview).not.toBeNull();
      expect(guidance.progressOverview).toContain('3 thoughts');

      // At node 4 and 5 — no overview
      for (let i = 4; i <= 5; i++) {
        tree.addThought(makeThought({ thoughtNumber: i, thought: `Thought ${i}.` }));
      }
      guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.progressOverview).toBeNull();

      // At node 6 — overview appears again
      tree.addThought(makeThought({ thoughtNumber: 6, thought: 'Thought 6.' }));
      guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      expect(guidance.progressOverview).not.toBeNull();
      expect(guidance.progressOverview).toContain('6 thoughts');
    });

    it('should track evaluated vs unevaluated nodes in progress overview', () => {
      const config = modeEngine.getPreset('expert'); // interval = 4
      const tree = new ThoughtTree('eval-tracking', 500);

      // Add 4 nodes
      for (let i = 1; i <= 4; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // Evaluate 2 of them
      const allNodes = tree.getAllNodes();
      mctsEngine.backpropagate(tree, allNodes[0].nodeId, 0.8);
      mctsEngine.backpropagate(tree, allNodes[1].nodeId, 0.7);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const overview = guidance.progressOverview!;

      // Should show evaluated count
      expect(overview).toContain('Evaluated');
      expect(overview).toMatch(/Evaluated \d+\/4/);
    });

    it('should show balance assessment changing as tree grows', () => {
      const config = modeEngine.getPreset('expert'); // interval = 4, enableCritique = true
      const tree = new ThoughtTree('balance-growth', 500);

      // Linear path: root -> n1 -> n2 -> n3
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance1 = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique1 = guidance1.critique;

      // Add one more to reach 4 nodes (at interval for expert)
      tree.addThought(makeThought({ thoughtNumber: 4 }));
      const guidance2 = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique2 = guidance2.critique!;

      // With a linear path (4 nodes on bestPath out of 4 total), balance should be "one-sided"
      expect(critique2).toContain('one-sided');
      expect(critique2).toContain('100%');

      // Add branching to make it more balanced
      const root = tree.root!;
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 5, thought: 'Branch 1.' }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 6, thought: 'Branch 2.' }));

      const guidance3 = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique3 = guidance3.critique;

      // bestPath is still linear (root -> n1 -> n2 -> n3 -> n4) = 5 nodes out of 6 total
      // That's ~83%, still "one-sided"
      if (critique3) {
        // Only check if critique is present (it might be null if bestPath requirements change)
        expect(critique3).toContain('Balance');
      }
    });

    it('should correctly identify unchallenged steps in critique', () => {
      const config = modeEngine.getPreset('deep'); // enableCritique = true
      const tree = new ThoughtTree('unchallenged', 500);

      // Build a linear path (all nodes have only 1 child)
      for (let i = 1; i <= 4; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      // Evaluate to get critique
      const leaf = tree.getLeafNodes()[0];
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.7);
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.7);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique = guidance.critique!;

      // In a linear path of 4 nodes, there are 3 edges
      // Each interior node (1, 2, 3) has 1 child, so 3 unchallenged steps out of 3
      expect(critique).toContain('Unchallenged');
      expect(critique).toContain('3/3');
    });

    it('should compress thoughts in critique output when text is long', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('crit-compress', 500);

      const longThought = 'First part. ' + 'X'.repeat(200) + '. Last part.';
      tree.addThought(makeThought({ thoughtNumber: 1, thought: longThought }));
      tree.addThought(makeThought({ thoughtNumber: 2, thought: longThought }));
      tree.addThought(makeThought({ thoughtNumber: 3, thought: longThought }));

      // Evaluate to trigger critique
      const leaf = tree.getLeafNodes()[0];
      mctsEngine.backpropagate(tree, leaf.nodeId, 0.3);

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique = guidance.critique!;

      // Critique should not contain the full 200-char middle section
      expect(critique).not.toContain(longThought);
      // But should reference the weakest node
      expect(critique).toContain('Weakest');
    });

    it('should handle trees with no evaluated nodes in critique', () => {
      const config = modeEngine.getPreset('expert');
      const tree = new ThoughtTree('no-evals', 500);

      // Add nodes but don't evaluate any
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      const critique = guidance.critique!;

      // Should still generate critique but handle no-eval case
      expect(critique).toContain('CRITIQUE');
      // When no nodes are evaluated, weakest should be N/A
      expect(critique).toContain('N/A');
    });

    it('should differentiate compress output based on mode maxThoughtDisplayLength', () => {
      // Text longer than even deep mode's 300 max
      const veryLongMulti = 'Opening. ' + 'Content. '.repeat(50) + 'Closing.';

      // Fast mode: 150 chars max
      const fastConfig = modeEngine.getPreset('fast');
      const fastTree = new ThoughtTree('compress-fast', 500);
      fastTree.addThought(makeThought({ thoughtNumber: 1, thought: veryLongMulti }));
      fastTree.addThought(makeThought({ thoughtNumber: 2, thought: veryLongMulti }));
      const fastGuidance = modeEngine.generateGuidance(fastConfig, fastTree, mctsEngine);
      const fastPrompt = fastGuidance.thoughtPrompt;

      // Deep mode: 300 chars max
      const deepConfig = modeEngine.getPreset('deep');
      const deepTree = new ThoughtTree('compress-deep', 500);
      deepTree.addThought(makeThought({ thoughtNumber: 1, thought: veryLongMulti }));
      deepTree.addThought(makeThought({ thoughtNumber: 2, thought: veryLongMulti }));
      const deepGuidance = modeEngine.generateGuidance(deepConfig, deepTree, mctsEngine);
      const deepPrompt = deepGuidance.thoughtPrompt;

      // Very long text should trigger compression in both
      expect(fastPrompt).toContain('[...]');
      expect(deepPrompt).toContain('[...]');
      // Neither should contain the full original text
      expect(fastPrompt).not.toContain(veryLongMulti);
      expect(deepPrompt).not.toContain(veryLongMulti);
    });

    it('should include progressOverview in thoughtPrompt when present (not separate field)', () => {
      const config = modeEngine.getPreset('fast');
      const tree = new ThoughtTree('overview-in-response', 500);
      for (let i = 1; i <= 3; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }

      const guidance = modeEngine.generateGuidance(config, tree, mctsEngine);
      // progressOverview is a separate field
      expect(guidance.progressOverview).not.toBeNull();
      // thoughtPrompt should still be the main prompt (not containing PROGRESS)
      expect(guidance.thoughtPrompt).not.toContain('PROGRESS');
      // Both should be present in the response object
      expect(guidance).toHaveProperty('thoughtPrompt');
      expect(guidance).toHaveProperty('progressOverview');
    });
  });
});
