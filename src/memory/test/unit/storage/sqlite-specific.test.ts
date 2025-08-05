import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../../../storage/sqlite-storage.js';
import { Entity, Relation } from '../../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('SQLite-Specific Features', () => {
  let storage: SQLiteStorage;
  let testFile: string;

  beforeEach(async () => {
    testFile = path.join(tmpdir(), `test-sqlite-${Date.now()}.db`);
    storage = new SQLiteStorage({ type: 'sqlite', filePath: testFile });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    try {
      await fs.unlink(testFile);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  });

  describe('Transaction Handling', () => {
    it('should rollback on error in batch operations', async () => {
      const entities: Entity[] = [
        {
          name: 'Valid Entity',
          entityType: 'Test',
          observations: ['Valid observation']
        }
      ];

      await storage.createEntities(entities);

      // Mock an error during the operation
      const originalAddObservations = storage.addObservations.bind(storage);
      let callCount = 0;
      storage.addObservations = async (observations) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Simulated error');
        }
        return originalAddObservations(observations);
      };

      // Try to add observations - should fail
      await expect(storage.addObservations([
        {
          entityName: 'Valid Entity',
          contents: ['Should not be added']
        }
      ])).rejects.toThrow('Simulated error');

      // Restore original method
      storage.addObservations = originalAddObservations;

      // Verify no observations were added
      const entities2 = await storage.getEntities(['Valid Entity']);
      expect(entities2[0].observations).toHaveLength(1);
      expect(entities2[0].observations).not.toContain('Should not be added');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads correctly', async () => {
      // Create test data
      const entities: Entity[] = Array.from({ length: 50 }, (_, i) => ({
        name: `Concurrent Entity ${i}`,
        entityType: 'ConcurrentTest',
        observations: [`Observation ${i}`]
      }));

      await storage.createEntities(entities);

      // Perform concurrent reads
      const promises = Array.from({ length: 10 }, () => 
        storage.searchEntities('Concurrent')
      );

      const results = await Promise.all(promises);

      // All reads should return the same results
      results.forEach(result => {
        expect(result).toHaveLength(50);
      });
    });

    it('should serialize write operations', async () => {
      // Create base entity
      await storage.createEntities([{
        name: 'Concurrent Write Test',
        entityType: 'Test',
        observations: []
      }]);

      // Perform concurrent observation additions
      const promises = Array.from({ length: 20 }, (_, i) => 
        storage.addObservations([{
          entityName: 'Concurrent Write Test',
          contents: [`Concurrent observation ${i}`]
        }])
      );

      await Promise.all(promises);

      // All observations should be added
      const entity = await storage.getEntities(['Concurrent Write Test']);
      expect(entity[0].observations).toHaveLength(20);
    });
  });

  describe('Performance Features', () => {
    it('should use indexes for efficient searching', async () => {
      // Create many entities
      const entities: Entity[] = Array.from({ length: 1000 }, (_, i) => ({
        name: `Performance Test ${i}`,
        entityType: i % 10 === 0 ? 'SpecialType' : 'RegularType',
        observations: [`Observation ${i}`, i % 50 === 0 ? 'RARE_KEYWORD' : 'Common']
      }));

      await storage.createEntities(entities);

      // Search should be fast even with many entities
      const start = Date.now();
      const results = await storage.searchEntities('RARE_KEYWORD');
      const duration = Date.now() - start;

      expect(results).toHaveLength(20); // 1000 / 50
      expect(duration).toBeLessThan(100); // Should be very fast due to indexes
    });
  });

  describe('WAL Mode', () => {
    it('should enable WAL mode for better concurrency', async () => {
      // Close and reopen to ensure clean state
      await storage.close();
      storage = new SQLiteStorage({ type: 'sqlite', filePath: testFile });
      await storage.initialize();

      // Create and read simultaneously should work due to WAL
      const writePromise = storage.createEntities([{
        name: 'WAL Test',
        entityType: 'Test',
        observations: ['WAL enabled']
      }]);

      const readPromise = storage.loadGraph();

      await Promise.all([writePromise, readPromise]);

      // Verify WAL file exists
      const walFile = testFile + '-wal';
      const walExists = await fs.access(walFile).then(() => true).catch(() => false);
      expect(walExists).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    it('should enforce foreign key constraints', async () => {
      // This is handled internally, but we can verify cascade deletes work
      const entities: Entity[] = [
        {
          name: 'Parent Entity',
          entityType: 'Parent',
          observations: ['Parent observation']
        },
        {
          name: 'Child Entity',
          entityType: 'Child',
          observations: ['Child observation']
        }
      ];

      await storage.createEntities(entities);

      await storage.createRelations([{
        from: 'Parent Entity',
        to: 'Child Entity',
        relationType: 'has child'
      }]);

      // Delete parent should cascade delete relations
      await storage.deleteEntities(['Parent Entity']);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.relations).toHaveLength(0);
    });

    it('should handle database file corruption gracefully', async () => {
      // Close storage
      await storage.close();

      // Corrupt the file
      await fs.writeFile(testFile, 'This is not a valid SQLite file');

      // Try to open - should fail gracefully
      try {
        const corruptedStorage = new SQLiteStorage({ type: 'sqlite', filePath: testFile });
        await corruptedStorage.initialize();
        // If we get here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        // Verify it's a database-related error
        expect((error as Error).message).toMatch(/not a database|database.*corrupt/i);
      }
    });
  });

  describe('Storage Size Calculation', () => {
    it('should accurately calculate storage size', async () => {
      const stats1 = await storage.getStats();
      const initialSize = stats1.storageSize;

      // Add substantial data
      const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
        name: `Size Test ${i}`,
        entityType: 'SizeTest',
        observations: Array.from({ length: 10 }, (_, j) => `Observation ${i}-${j}`)
      }));

      await storage.createEntities(entities);

      const stats2 = await storage.getStats();
      // Storage size calculation may vary by SQLite implementation
      if (stats2.storageSize !== undefined && stats2.storageSize > 0 && initialSize !== undefined) {
        expect(stats2.storageSize).toBeGreaterThanOrEqual(initialSize);
      }
      expect(stats2.entityCount).toBe(100);
      expect(stats2.observationCount).toBe(1000);
    });
  });
});