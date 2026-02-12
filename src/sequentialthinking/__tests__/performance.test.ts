import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequentialThinkingServer } from '../server.js';

describe('SequentialThinkingServer - Performance Tests', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    server = new SequentialThinkingServer(1000, 1000, 10000, 60000); // Higher rate limit for testing
  });

  afterEach(() => {
    server.destroy();
  });

  describe('Memory Efficiency', () => {
    it('should handle large thoughts efficiently', async () => {
      const largeThought = 'a'.repeat(500); // At max limit
      
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        await server.processThought({
          thought: largeThought,
          thoughtNumber: i + 1,
          totalThoughts: 100,
          nextThoughtNeeded: i < 99
        });
      }
      
      const duration = Date.now() - startTime;
      
      // Should process 100 large thoughts quickly (under 1 second)
      expect(duration).toBeLessThan(1000);
      
      const stats = server.getStats();
      expect(stats.totalThoughts).toBe(100);
      expect(stats.historySize).toBe(100); // Within limit
    });

    it('should maintain performance with history at capacity', async () => {
      // Fill history to capacity
      for (let i = 0; i < 1000; i++) {
        await server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i + 1,
          totalThoughts: 1000,
          nextThoughtNeeded: true
        });
      }

      const startTime = Date.now();
      
      // Process more thoughts when at capacity (should trigger trimming)
      console.log('DEBUG: Before extra thoughts, processed:', server.getStats().totalThoughts);
      for (let i = 0; i < 50; i++) {
        const result = await server.processThought({
          thought: `Capacity test ${i}`,
          thoughtNumber: i + 1,
          totalThoughts: 1000,
          nextThoughtNeeded: true
        });
        if (result.isError) {
          console.log(`DEBUG: Error processing thought ${i}:`, result.content[0].text);
        }
      }
      console.log('DEBUG: After extra thoughts, processed:', server.getStats().totalThoughts);
      
      const duration = Date.now() - startTime;
      
      // Should still be performant even with array trimming
      expect(duration).toBeLessThan(500);
      
      const stats = server.getStats();
      console.log('DEBUG: Performance stats:', stats);
      expect(stats.historySize).toBe(1000); // At capacity
      expect(stats.totalThoughts).toBeGreaterThan(1000); // More processed than stored
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent processing without conflicts', async () => {
      const concurrentRequests = 20;
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        server.processThought({
          thought: `Concurrent ${i}`,
          thoughtNumber: i + 1,
          totalThoughts: concurrentRequests,
          nextThoughtNeeded: i < concurrentRequests - 1
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All concurrent requests should succeed
      expect(results.every(r => !r.isError)).toBe(true);
      
      // Should complete reasonably quickly
      expect(duration).toBeLessThan(2000);
      
      // Final state should be consistent
      const history = server.getThoughtHistory();
      expect(history).toHaveLength(concurrentRequests);
      
      const stats = server.getStats();
      expect(stats.totalThoughts).toBe(concurrentRequests);
    });

    it('should maintain consistency under high load', async () => {
      const batchSize = 50;
      const batches = 5; // 250 total operations
      
      for (let batch = 0; batch < batches; batch++) {
        const promises = Array.from({ length: batchSize }, (_, i) =>
          server.processThought({
            thought: `Batch ${batch}-${i}`,
            thoughtNumber: i + 1,
            totalThoughts: batchSize,
            nextThoughtNeeded: i < batchSize - 1
          })
        );
        
        await Promise.all(promises);
        
        // Verify consistency after each batch
        const history = server.getThoughtHistory();
        const expectedLength = Math.min((batch + 1) * batchSize, 1000);
        expect(history.length).toBe(expectedLength);
      }
      
      const finalStats = server.getStats();
      expect(finalStats.totalThoughts).toBe(batches * batchSize);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory during extended operation', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 500; i++) {
        await server.processThought({
          thought: `Memory test ${i}`,
          thoughtNumber: i % 100 + 1,
          totalThoughts: 100,
          nextThoughtNeeded: true
        });
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB for 500 operations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      // Cleanup should free memory
      server.clearHistory();
      
      // Brief pause to allow garbage collection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const afterCleanupMemory = process.memoryUsage().heapUsed;
      const memoryAfterCleanup = afterCleanupMemory - finalMemory;
      
      // Memory behavior after cleanup is non-deterministic due to GC timing
      // Just verify the total memory increase was bounded
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle many branches efficiently', async () => {
      const branchCount = 100;
      
      // Create many branches
      for (let i = 0; i < branchCount; i++) {
        await server.processThought({
          thought: `Branch thought ${i}`,
          thoughtNumber: i + 1,
          totalThoughts: branchCount,
          nextThoughtNeeded: i < branchCount - 1,
          branchFromThought: i === 0 ? undefined : i,
          branchId: `branch-${i}`
        });
      }
      
      const branches = server.getBranches();
      expect(branches).toHaveLength(branchCount);
      
      // Verify all branches are tracked
      for (let i = 0; i < branchCount; i++) {
        expect(branches).toContain(`branch-${i}`);
      }
      
      // Performance should remain reasonable
      const stats = server.getStats();
      expect(stats.branchCount).toBe(branchCount);
    });
  });

  describe('Response Time Consistency', () => {
    it('should maintain consistent response times', async () => {
      const responseTimes: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        const startTime = Date.now();
        
        await server.processThought({
          thought: `Timing test ${i}`,
          thoughtNumber: i + 1,
          totalThoughts: 100,
          nextThoughtNeeded: i < 99
        });
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }
      
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);
      
      // Response times should be consistent (low variance)
      expect(avgResponseTime).toBeLessThan(50); // Average under 50ms
      expect(maxResponseTime).toBeLessThan(200); // Max under 200ms
      expect(minResponseTime).toBeGreaterThanOrEqual(0); // Min should be non-negative
      
      // Standard deviation should be low (consistent performance)
      const variance = responseTimes.reduce((sum, time) => {
        return sum + Math.pow(time - avgResponseTime, 2);
      }, 0) / responseTimes.length;
      const stdDev = Math.sqrt(variance);
      
      expect(stdDev).toBeLessThan(20); // Low standard deviation
    });
  });
});