import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SequentialThinkingServer, ProcessThoughtRequest } from '../../lib.js';

describe('MCTS Server Integration', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    process.env.DISABLE_THOUGHT_LOGGING = 'true';
    server = new SequentialThinkingServer();
  });

  afterEach(() => {
    if (server && typeof server.destroy === 'function') {
      server.destroy();
    }
  });

  describe('Tree Auto-Building', () => {
    it('should include nodeId in processThought response', async () => {
      const result = await server.processThought({
        thought: 'First thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'mcts-test-1',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.nodeId).toBeDefined();
      expect(data.parentNodeId).toBeNull(); // First node has no parent
      expect(data.treeStats).toBeDefined();
      expect(data.treeStats.totalNodes).toBe(1);
    });

    it('should build parent-child relationships', async () => {
      const r1 = await server.processThought({
        thought: 'Root thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'mcts-test-2',
      });

      const r2 = await server.processThought({
        thought: 'Child thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'mcts-test-2',
      });

      const d1 = JSON.parse(r1.content[0].text);
      const d2 = JSON.parse(r2.content[0].text);

      expect(d2.parentNodeId).toBe(d1.nodeId);
      expect(d2.treeStats.totalNodes).toBe(2);
    });

    it('should handle branching in tree', async () => {
      await server.processThought({
        thought: 'Root',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'mcts-branch',
      });

      await server.processThought({
        thought: 'Main path',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'mcts-branch',
      });

      const branchResult = await server.processThought({
        thought: 'Alternative path',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'alt',
        sessionId: 'mcts-branch',
      });

      const data = JSON.parse(branchResult.content[0].text);
      expect(data.treeStats.totalNodes).toBe(3);
    });
  });

  describe('Backtrack Tool', () => {
    it('should backtrack to a previous node', async () => {
      const r1 = await server.processThought({
        thought: 'Root thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'bt-test',
      });
      const d1 = JSON.parse(r1.content[0].text);

      await server.processThought({
        thought: 'Second thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'bt-test',
      });

      const btResult = await server.backtrack('bt-test', d1.nodeId);
      expect(btResult.isError).toBeUndefined();

      const btData = JSON.parse(btResult.content[0].text);
      expect(btData.node.nodeId).toBe(d1.nodeId);
      expect(btData.children).toHaveLength(1);
      expect(btData.treeStats.totalNodes).toBe(2);
    });

    it('should return error for invalid session', async () => {
      const result = await server.backtrack('nonexistent', 'node-1');
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('TREE_ERROR');
    });
  });

  describe('Evaluate Tool', () => {
    it('should evaluate a thought node', async () => {
      const r1 = await server.processThought({
        thought: 'Evaluate me',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        sessionId: 'eval-test',
      });
      const d1 = JSON.parse(r1.content[0].text);

      const evalResult = await server.evaluateThought('eval-test', d1.nodeId, 0.85);
      expect(evalResult.isError).toBeUndefined();

      const evalData = JSON.parse(evalResult.content[0].text);
      expect(evalData.nodeId).toBe(d1.nodeId);
      expect(evalData.newVisitCount).toBe(1);
      expect(evalData.newAverageValue).toBeCloseTo(0.85);
      expect(evalData.nodesUpdated).toBe(1);
    });

    it('should reject value out of range', async () => {
      const r1 = await server.processThought({
        thought: 'Test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'eval-range-test',
      });
      const d1 = JSON.parse(r1.content[0].text);

      const result = await server.evaluateThought('eval-range-test', d1.nodeId, 1.5);
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject negative value', async () => {
      const result = await server.evaluateThought('eval-range-test', 'node-1', -0.1);
      expect(result.isError).toBe(true);
    });
  });

  describe('Suggest Tool', () => {
    it('should suggest next thought to explore', async () => {
      await server.processThought({
        thought: 'Root',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'suggest-test',
      });

      await server.processThought({
        thought: 'Child',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'suggest-test',
      });

      const result = await server.suggestNextThought('suggest-test', 'balanced');
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.suggestion).not.toBeNull();
      expect(data.suggestion.nodeId).toBeDefined();
      expect(data.suggestion.ucb1Score).toBeDefined();
      expect(data.treeStats).toBeDefined();
    });

    it('should return null suggestion when all terminal', async () => {
      await server.processThought({
        thought: 'Final',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'terminal-test',
      });

      const result = await server.suggestNextThought('terminal-test');
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.suggestion).toBeNull();
    });

    it('should return error for invalid session', async () => {
      const result = await server.suggestNextThought('nonexistent');
      expect(result.isError).toBe(true);
    });
  });

  describe('Summary Tool', () => {
    it('should return thinking summary with best path', async () => {
      const r1 = await server.processThought({
        thought: 'Start here',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: 'summary-test',
      });
      const d1 = JSON.parse(r1.content[0].text);

      const r2 = await server.processThought({
        thought: 'Good path',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        sessionId: 'summary-test',
      });
      const d2 = JSON.parse(r2.content[0].text);

      // Evaluate the good path
      await server.evaluateThought('summary-test', d2.nodeId, 0.9);

      const result = await server.getThinkingSummary('summary-test');
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.bestPath).toBeDefined();
      expect(data.bestPath.length).toBeGreaterThanOrEqual(1);
      expect(data.treeStructure).not.toBeNull();
      expect(data.treeStats.totalNodes).toBe(2);
    });

    it('should return error for invalid session', async () => {
      const result = await server.getThinkingSummary('nonexistent');
      expect(result.isError).toBe(true);
    });
  });

  describe('End-to-End MCTS Cycle', () => {
    it('should complete a full MCTS exploration cycle', async () => {
      const sessionId = 'e2e-mcts';

      // Step 1: Submit initial thoughts
      const t1 = await server.processThought({
        thought: 'Problem: Find the optimal sorting algorithm',
        thoughtNumber: 1,
        totalThoughts: 5,
        nextThoughtNeeded: true,
        sessionId,
      });
      const d1 = JSON.parse(t1.content[0].text);

      const t2 = await server.processThought({
        thought: 'Approach 1: QuickSort — average O(n log n)',
        thoughtNumber: 2,
        totalThoughts: 5,
        nextThoughtNeeded: true,
        sessionId,
      });
      const d2 = JSON.parse(t2.content[0].text);

      // Step 2: Evaluate the first approach
      await server.evaluateThought(sessionId, d2.nodeId, 0.7);

      // Step 3: Backtrack to root and try alternative
      await server.backtrack(sessionId, d1.nodeId);

      const t3 = await server.processThought({
        thought: 'Approach 2: MergeSort — guaranteed O(n log n)',
        thoughtNumber: 3,
        totalThoughts: 5,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'mergesort',
        sessionId,
      });
      const d3 = JSON.parse(t3.content[0].text);

      // Step 4: Evaluate the second approach higher
      await server.evaluateThought(sessionId, d3.nodeId, 0.9);

      // Step 5: Get suggestion — should favor under-explored areas
      const suggestion = await server.suggestNextThought(sessionId, 'balanced');
      const suggestData = JSON.parse(suggestion.content[0].text);
      expect(suggestData.suggestion).not.toBeNull();

      // Step 6: Verify best path follows higher-rated approach
      const summary = await server.getThinkingSummary(sessionId);
      const summaryData = JSON.parse(summary.content[0].text);

      expect(summaryData.bestPath.length).toBeGreaterThanOrEqual(2);
      expect(summaryData.treeStats.totalNodes).toBe(3);

      // The best path should include the root and the mergesort branch (higher value)
      const bestPathThoughts = summaryData.bestPath.map((n: any) => n.thought);
      expect(bestPathThoughts[0]).toContain('sorting');
      expect(bestPathThoughts[1]).toContain('MergeSort');
    });
  });

  describe('set_thinking_mode Tool', () => {
    it('should set thinking mode and return config', async () => {
      const result = await server.setThinkingMode('mode-test-1', 'fast');
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe('mode-test-1');
      expect(data.mode).toBe('fast');
      expect(data.config).toBeDefined();
      expect(data.config.explorationConstant).toBe(0.5);
      expect(data.config.suggestStrategy).toBe('exploit');
      expect(data.config.maxBranchingFactor).toBe(1);
      expect(data.config.autoEvaluate).toBe(true);
      expect(data.config.enableBacktracking).toBe(false);
    });

    it('should reject invalid mode', async () => {
      const result = await server.setThinkingMode('mode-test-2', 'invalid');
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Fast Mode E2E', () => {
    it('should include modeGuidance and auto-evaluate', async () => {
      const sessionId = 'fast-e2e';
      await server.setThinkingMode(sessionId, 'fast');

      // Submit 3 thoughts
      for (let i = 1; i <= 3; i++) {
        const result = await server.processThought({
          thought: `Fast thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 5,
          nextThoughtNeeded: true,
          sessionId,
        });
        const data = JSON.parse(result.content[0].text);
        expect(data.modeGuidance).toBeDefined();
        expect(data.modeGuidance.mode).toBe('fast');

        // Auto-eval: node should be evaluated (unexploredCount decreasing)
        expect(data.treeStats.unexploredCount).toBe(0);
      }
    });

    it('should recommend conclude at target depth', async () => {
      const sessionId = 'fast-conclude';
      await server.setThinkingMode(sessionId, 'fast');

      // Submit 6 thoughts (depth reaches 5 = targetDepthMax)
      let lastGuidance: any;
      for (let i = 1; i <= 6; i++) {
        const result = await server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true,
          sessionId,
        });
        const data = JSON.parse(result.content[0].text);
        lastGuidance = data.modeGuidance;
      }

      expect(lastGuidance.recommendedAction).toBe('conclude');
      expect(lastGuidance.currentPhase).toBe('concluded');
    });
  });

  describe('Expert Mode E2E', () => {
    it('should provide branching suggestions', async () => {
      const sessionId = 'expert-e2e';
      await server.setThinkingMode(sessionId, 'expert');

      // Submit 3 thoughts (depth = 2, triggers branching)
      let lastGuidance: any;
      for (let i = 1; i <= 3; i++) {
        const result = await server.processThought({
          thought: `Expert thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true,
          sessionId,
        });
        const data = JSON.parse(result.content[0].text);
        lastGuidance = data.modeGuidance;
      }

      expect(lastGuidance.recommendedAction).toBe('branch');
      expect(lastGuidance.branchingSuggestion).not.toBeNull();
      expect(lastGuidance.branchingSuggestion.shouldBranch).toBe(true);
    });

    it('should converge with enough high evaluations', async () => {
      const sessionId = 'expert-converge';
      await server.setThinkingMode(sessionId, 'expert');

      // Build some thoughts
      const nodeIds: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const result = await server.processThought({
          thought: `Convergence thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true,
          sessionId,
        });
        const data = JSON.parse(result.content[0].text);
        nodeIds.push(data.nodeId);
      }

      // Evaluate leaf with high values 3 times
      const leafNodeId = nodeIds[nodeIds.length - 1];
      for (let i = 0; i < 3; i++) {
        await server.evaluateThought(sessionId, leafNodeId, 0.9);
      }

      // Submit another thought to get updated guidance
      const result = await server.processThought({
        thought: 'Check convergence',
        thoughtNumber: 5,
        totalThoughts: 10,
        nextThoughtNeeded: true,
        sessionId,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.modeGuidance.convergenceStatus).not.toBeNull();
      // With high evals on the path, should converge
      expect(data.modeGuidance.convergenceStatus.score).toBeGreaterThan(0);
    });
  });

  describe('Deep Mode E2E', () => {
    it('should provide explore-heavy guidance', async () => {
      const sessionId = 'deep-e2e';
      await server.setThinkingMode(sessionId, 'deep');

      const result = await server.processThought({
        thought: 'Deep exploration start',
        thoughtNumber: 1,
        totalThoughts: 20,
        nextThoughtNeeded: true,
        sessionId,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.modeGuidance).toBeDefined();
      expect(data.modeGuidance.mode).toBe('deep');
      // Deep mode should recommend branching aggressively
      expect(data.modeGuidance.recommendedAction).toBe('branch');
      expect(data.modeGuidance.branchingSuggestion).not.toBeNull();
      expect(data.modeGuidance.targetTotalThoughts).toBe(20);
    });
  });

  describe('thinkingMode parameter on sequentialthinking', () => {
    it('should auto-set mode when thinkingMode provided on first thought', async () => {
      const result = await server.processThought({
        thought: 'Inline mode test',
        thoughtNumber: 1,
        totalThoughts: 5,
        nextThoughtNeeded: true,
        sessionId: 'inline-mode',
        thinkingMode: 'fast',
      } as any);

      const data = JSON.parse(result.content[0].text);
      expect(data.modeGuidance).toBeDefined();
      expect(data.modeGuidance.mode).toBe('fast');
    });
  });

  describe('thoughtPrompt in responses', () => {
    it('should include thoughtPrompt in processThought response when mode is set', async () => {
      const sessionId = 'tp-present';
      await server.setThinkingMode(sessionId, 'fast');

      const result = await server.processThought({
        thought: 'First thought',
        thoughtNumber: 1,
        totalThoughts: 5,
        nextThoughtNeeded: true,
        sessionId,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.modeGuidance).toBeDefined();
      expect(data.modeGuidance.thoughtPrompt).toBeDefined();
      expect(typeof data.modeGuidance.thoughtPrompt).toBe('string');
      expect(data.modeGuidance.thoughtPrompt.length).toBeGreaterThan(0);
    });

    it('should change thoughtPrompt as depth/phase progresses (continue -> conclude in fast mode)', async () => {
      const sessionId = 'tp-progress';
      await server.setThinkingMode(sessionId, 'fast');

      // Submit first thought — should be "continue"
      const r1 = await server.processThought({
        thought: 'Step one',
        thoughtNumber: 1,
        totalThoughts: 10,
        nextThoughtNeeded: true,
        sessionId,
      });
      const d1 = JSON.parse(r1.content[0].text);
      expect(d1.modeGuidance.recommendedAction).toBe('continue');
      const promptContinue = d1.modeGuidance.thoughtPrompt;

      // Submit enough thoughts to reach targetDepthMax (5) for fast mode
      for (let i = 2; i <= 6; i++) {
        await server.processThought({
          thought: `Step ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true,
          sessionId,
        });
      }

      // The 6th thought brings depth to 5 — should conclude
      const rLast = await server.processThought({
        thought: 'Final step',
        thoughtNumber: 7,
        totalThoughts: 10,
        nextThoughtNeeded: true,
        sessionId,
      });
      const dLast = JSON.parse(rLast.content[0].text);
      expect(dLast.modeGuidance.recommendedAction).toBe('conclude');
      const promptConclude = dLast.modeGuidance.thoughtPrompt;

      // The two prompts should be different
      expect(promptContinue).not.toBe(promptConclude);
      expect(promptConclude).toContain('Synthesize');
    });
  });

  describe('progressOverview and critique in modeGuidance', () => {
    it('should include progressOverview and critique fields in modeGuidance response', async () => {
      const sessionId = 'guidance-fields';
      await server.setThinkingMode(sessionId, 'expert');

      const result = await server.processThought({
        thought: 'First thought',
        thoughtNumber: 1,
        totalThoughts: 10,
        nextThoughtNeeded: true,
        sessionId,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.modeGuidance).toBeDefined();
      expect('progressOverview' in data.modeGuidance).toBe(true);
      expect('critique' in data.modeGuidance).toBe(true);
    });

    it('fast mode: critique always null, progressOverview appears at interval 3', async () => {
      const sessionId = 'fast-guidance';
      await server.setThinkingMode(sessionId, 'fast');

      // Submit 3 thoughts (interval = 3)
      let lastData: any;
      for (let i = 1; i <= 3; i++) {
        const result = await server.processThought({
          thought: `Fast thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 5,
          nextThoughtNeeded: true,
          sessionId,
        });
        lastData = JSON.parse(result.content[0].text);
        // Critique always null for fast mode
        expect(lastData.modeGuidance.critique).toBeNull();
      }

      // At 3 nodes, progressOverview should be non-null
      expect(lastData.modeGuidance.progressOverview).not.toBeNull();
      expect(lastData.modeGuidance.progressOverview).toContain('PROGRESS');
    });

    it('expert mode: both fields populate with sufficient data', async () => {
      const sessionId = 'expert-guidance';
      await server.setThinkingMode(sessionId, 'expert');

      // Submit 4 thoughts (expert interval = 4, critique needs bestPath >= 2)
      for (let i = 1; i <= 4; i++) {
        await server.processThought({
          thought: `Expert thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 10,
          nextThoughtNeeded: true,
          sessionId,
        });
      }

      // 4 nodes = interval for expert, bestPath >= 2 with enableCritique
      // Need to check the last response
      const result = await server.processThought({
        thought: 'Expert thought 5',
        thoughtNumber: 5,
        totalThoughts: 10,
        nextThoughtNeeded: true,
        sessionId,
      });
      const data = JSON.parse(result.content[0].text);

      // critique should be non-null (expert mode, bestPath >= 2)
      expect(data.modeGuidance.critique).not.toBeNull();
      expect(data.modeGuidance.critique).toContain('CRITIQUE');
    });
  });

  describe('MCTS Metrics Instrumentation', () => {
    it('should increment totalRequests and successfulRequests on successful ops', async () => {
      const sessionId = 'metrics-success';
      await server.processThought({
        thought: 'Setup',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId,
      });

      const metricsBefore = server.getMetrics() as Record<string, any>;
      const totalBefore = metricsBefore.requests.totalRequests;
      const successBefore = metricsBefore.requests.successfulRequests;

      await server.setThinkingMode(sessionId, 'fast');
      await server.suggestNextThought(sessionId);

      const metricsAfter = server.getMetrics() as Record<string, any>;
      expect(metricsAfter.requests.totalRequests).toBe(totalBefore + 2);
      expect(metricsAfter.requests.successfulRequests).toBe(successBefore + 2);
    });

    it('should increment failedRequests on tree errors inside withMetrics', async () => {
      const metricsBefore = server.getMetrics() as Record<string, any>;
      const failedBefore = metricsBefore.requests.failedRequests;

      // backtrack on nonexistent session: validateSessionId passes, tree error inside withMetrics
      await server.backtrack('valid-but-no-tree', 'node-1');

      const metricsAfter = server.getMetrics() as Record<string, any>;
      expect(metricsAfter.requests.failedRequests).toBe(failedBefore + 1);
    });
  });

  describe('Session Validation for MCTS Operations', () => {
    it('should reject empty sessionId on backtrack', async () => {
      const result = await server.backtrack('', 'node-1');
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject oversized sessionId on evaluateThought', async () => {
      const result = await server.evaluateThought('a'.repeat(101), 'node-1', 0.5);
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
    });

    it('should reject empty sessionId on suggestNextThought', async () => {
      const result = await server.suggestNextThought('');
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject empty sessionId on getThinkingSummary', async () => {
      const result = await server.getThinkingSummary('');
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject empty sessionId on setThinkingMode', async () => {
      const result = await server.setThinkingMode('', 'fast');
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should accept valid sessionId on all operations', async () => {
      const sessionId = 'valid-session';
      // Set up a tree with a thought first
      const t1 = await server.processThought({
        thought: 'Setup thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId,
      });
      const d1 = JSON.parse(t1.content[0].text);

      // All should succeed (not return validation/security errors)
      const btResult = await server.backtrack(sessionId, d1.nodeId);
      expect(btResult.isError).toBeUndefined();

      const evalResult = await server.evaluateThought(sessionId, d1.nodeId, 0.5);
      expect(evalResult.isError).toBeUndefined();

      const suggestResult = await server.suggestNextThought(sessionId);
      expect(suggestResult.isError).toBeUndefined();

      const summaryResult = await server.getThinkingSummary(sessionId);
      expect(summaryResult.isError).toBeUndefined();

      const modeResult = await server.setThinkingMode(sessionId, 'fast');
      expect(modeResult.isError).toBeUndefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should not break existing processThought response structure', async () => {
      const result = await server.processThought({
        thought: 'Backward compat test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'compat-test',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);

      // Existing fields still present
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(1);
      expect(data.nextThoughtNeeded).toBe(false);
      expect(data.sessionId).toBe('compat-test');
      expect(typeof data.timestamp).toBe('number');
      expect(typeof data.thoughtHistoryLength).toBe('number');
      expect(Array.isArray(data.branches)).toBe(true);

      // New MCTS fields are additive
      expect(data.nodeId).toBeDefined();
      expect(data.treeStats).toBeDefined();
    });
  });
});
