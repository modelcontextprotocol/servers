import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SequentialThinkingServer } from '../../lib.js';

describe('SequentialThinkingServer - Performance Tests', () => {
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

  describe('Memory Efficiency', () => {
    it('should handle large thoughts efficiently', async () => {
      const largeThought = 'a'.repeat(4000); // Within default 5000 limit

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await server.processThought({
          thought: largeThought,
          thoughtNumber: i + 1,
          totalThoughts: 100,
          nextThoughtNeeded: i < 99,
        });
      }

      const duration = Date.now() - startTime;

      // Should process 100 large thoughts quickly (100ms per thought reasonable)
      expect(duration).toBeLessThan(1000);

      const history = server.getThoughtHistory();
      expect(history.length).toBe(100);
    });

    it('should maintain performance with history at capacity', async () => {
      // Fill history with many thoughts
      for (let i = 0; i < 200; i++) {
        await server.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i + 1,
          totalThoughts: 200,
          nextThoughtNeeded: true,
        });
      }

      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        await server.processThought({
          thought: `Capacity test ${i}`,
          thoughtNumber: i + 1,
          totalThoughts: 50,
          nextThoughtNeeded: true,
        });
      }

      const duration = Date.now() - startTime;

      // Should still be performant at capacity
      expect(duration).toBeLessThan(500);
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
          nextThoughtNeeded: i < concurrentRequests - 1,
        }),
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results.every(r => !r.isError)).toBe(true);
      expect(duration).toBeLessThan(500);

      const history = server.getThoughtHistory();
      expect(history).toHaveLength(concurrentRequests);
    });

    it('should maintain consistency under high load', async () => {
      const batchSize = 50;
      const batches = 3;

      for (let batch = 0; batch < batches; batch++) {
        const promises = Array.from({ length: batchSize }, (_, i) =>
          server.processThought({
            thought: `Batch ${batch}-${i}`,
            thoughtNumber: i + 1,
            totalThoughts: batchSize,
            nextThoughtNeeded: i < batchSize - 1,
          }),
        );

        await Promise.all(promises);
      }

      const history = server.getThoughtHistory();
      expect(history.length).toBe(batches * batchSize);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory during extended operation', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 500; i++) {
        await server.processThought({
          thought: `Memory test ${i}`,
          thoughtNumber: i % 100 + 1,
          totalThoughts: 100,
          nextThoughtNeeded: true,
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB for 500 operations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
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
          nextThoughtNeeded: i < 99,
        });

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      const avgResponseTime =
        responseTimes.reduce((sum, time) => sum + time, 0) /
        responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      expect(avgResponseTime).toBeLessThan(50);
      expect(maxResponseTime).toBeLessThan(200);
    });
  });
});
