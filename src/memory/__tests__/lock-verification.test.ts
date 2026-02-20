import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, Relation, KnowledgeGraph } from '../index.js';

/**
 * This test suite verifies that the locking mechanism correctly prevents race conditions.
 * It demonstrates that all concurrent operations complete successfully and maintain
 * data integrity by preserving all writes without corruption.
 * 
 * The fix uses an in-memory lock manager that serializes file operations,
 * ensuring atomic read-modify-write cycles.
 */

describe('Lock Mechanism Verification', () => {
  let testFilePath: string;

  beforeEach(async () => {
    testFilePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `lock-verify-${Date.now()}.jsonl`
    );
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  it('should serialize concurrent writes to prevent corruption', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Define test data for multiple concurrent operations
    const entity1: Entity = {
      name: 'Process1_Entity',
      entityType: 'Actor',
      observations: ['created by process 1']
    };

    const entity2: Entity = {
      name: 'Process2_Entity',
      entityType: 'Actor',
      observations: ['created by process 2']
    };

    // Execute concurrent entity creation
    const [result1, result2] = await Promise.all([
      manager.createEntities([entity1]),
      manager.createEntities([entity2])
    ]);

    // Both operations should succeed
    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(1);

    // Read the final graph
    const finalGraph = await manager.readGraph();

    // Verify both entities exist and no data was lost
    expect(finalGraph.entities).toHaveLength(2);
    const entityNames = finalGraph.entities.map(e => e.name);
    expect(entityNames).toContain('Process1_Entity');
    expect(entityNames).toContain('Process2_Entity');
    
    // Verify entity types and observations
    const foundEntity1 = finalGraph.entities.find(e => e.name === 'Process1_Entity');
    const foundEntity2 = finalGraph.entities.find(e => e.name === 'Process2_Entity');
    expect(foundEntity1?.entityType).toBe('Actor');
    expect(foundEntity2?.entityType).toBe('Actor');
    expect(foundEntity1?.observations).toContain('created by process 1');
    expect(foundEntity2?.observations).toContain('created by process 2');
  });

  it('should handle river-crossing scenario with locked writes', async () => {
    /**
     * Classic river-crossing puzzle scenario:
     * - A man, goat, cabbage, and wolf need to cross a river
     * - The boat can only carry the man and one other item
     * - The goat and cabbage cannot be left alone
     * - The goat and wolf cannot be left alone
     */

    const manager = new KnowledgeGraphManager(testFilePath);

    // Create entities concurrently
    const entities: Entity[] = [
      { name: 'Human', entityType: 'Actor', observations: ['controls the boat'] },
      { name: 'Goat', entityType: 'Actor', observations: ['eats cabbage'] },
      { name: 'Cabbage', entityType: 'Item', observations: ['eaten by goat'] },
      { name: 'Wolf', entityType: 'Actor', observations: ['eats goat'] },
      { name: 'Start_Bank', entityType: 'Location', observations: ['initial position'] },
      { name: 'End_Bank', entityType: 'Location', observations: ['final destination'] }
    ];

    const entityResults = await Promise.all(
      entities.map(entity => manager.createEntities([entity]))
    );

    // Verify all entities were created
    entityResults.forEach(result => {
      expect(result).toHaveLength(1);
    });

    // Create initial state relations
    const initialRelations: Relation[] = [
      { from: 'Human', to: 'Start_Bank', relationType: 'is_at' },
      { from: 'Goat', to: 'Start_Bank', relationType: 'is_at' },
      { from: 'Cabbage', to: 'Start_Bank', relationType: 'is_at' },
      { from: 'Wolf', to: 'Start_Bank', relationType: 'is_at' }
    ];

    const relationResults = await Promise.all(
      initialRelations.map(relation => manager.createRelations([relation]))
    );

    // Verify all relations were created
    relationResults.forEach(result => {
      expect(result).toHaveLength(1);
    });

    // Verify complete initial state
    const initialState = await manager.readGraph();
    expect(initialState.entities).toHaveLength(6);
    expect(initialState.relations).toHaveLength(4);

    // Verify all items are at start bank
    const startBankItems = initialState.relations
      .filter(r => r.to === 'Start_Bank')
      .map(r => r.from);
    expect(startBankItems).toContain('Human');
    expect(startBankItems).toContain('Goat');
    expect(startBankItems).toContain('Cabbage');
    expect(startBankItems).toContain('Wolf');
  });

  it('should maintain JSONL format with concurrent writes', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Create multiple entities and relations concurrently
    const createOps = [
      manager.createEntities([
        { name: 'Entity_A', entityType: 'Type_A', observations: ['obs_a'] },
        { name: 'Entity_B', entityType: 'Type_B', observations: ['obs_b'] }
      ]),
      manager.createEntities([
        { name: 'Entity_C', entityType: 'Type_C', observations: ['obs_c'] }
      ])
    ];

    await Promise.all(createOps);

    // Read the raw file
    const rawContent = await fs.readFile(testFilePath, 'utf-8');
    const lines = rawContent.split('\n').filter(line => line.trim() !== '');

    // Verify JSONL format: each non-empty line should be valid JSON
    lines.forEach(line => {
      expect(() => JSON.parse(line)).not.toThrow();
    });

    // Verify content can be parsed
    const graph = await manager.readGraph();
    expect(graph.entities.length).toBeGreaterThan(0);
  });

  it('should prevent file corruption with rapid consecutive operations', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // First, create some base entities
    await manager.createEntities([
      { name: 'Base_1', entityType: 'Base', observations: [] },
      { name: 'Base_2', entityType: 'Base', observations: [] }
    ]);

    // Perform rapid sequential operations that internally use concurrency
    const operations = [];
    for (let i = 0; i < 5; i++) {
      operations.push(
        manager.addObservations([
          { entityName: 'Base_1', contents: [`observation_${i}`] }
        ])
      );
    }

    await Promise.all(operations);

    // Verify the final state
    const graph = await manager.readGraph();
    const baseEntity = graph.entities.find(e => e.name === 'Base_1');

    expect(baseEntity).toBeDefined();
    expect(baseEntity?.observations.length).toBe(5);
    expect(baseEntity?.observations).toContain('observation_0');
    expect(baseEntity?.observations).toContain('observation_4');
  });

  it('should correctly parse JSONL file after multiple concurrent operations', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Perform many concurrent operations
    const concurrentOps = [];
    for (let i = 0; i < 3; i++) {
      concurrentOps.push(
        manager.createEntities([
          {
            name: `Entity_${i}`,
            entityType: `Type_${i}`,
            observations: [`observation_${i}`]
          }
        ])
      );
    }

    await Promise.all(concurrentOps);

    // Read and parse the JSONL file
    const rawContent = await fs.readFile(testFilePath, 'utf-8');
    const lines = rawContent.split('\n').filter(line => line.trim() !== '');

    // Manually parse JSONL to verify structure
    const parsedLines = lines.map((line, index) => {
      try {
        return { data: JSON.parse(line), valid: true };
      } catch (e) {
        return { data: null, valid: false, error: e, line: index, content: line };
      }
    });

    // All lines should be valid JSON
    parsedLines.forEach(parsed => {
      expect(parsed.valid).toBe(true);
      expect(parsed.data).toHaveProperty('type');
    });

    // Verify the data can be reconstructed
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(3);
    expect(graph.relations).toHaveLength(0);
  });

  it('should demonstrate the fix prevents "Unexpected non-whitespace character" errors', async () => {
    /**
     * This test specifically verifies that the fix prevents the original bug:
     * "Unexpected non-whitespace character after JSON"
     * 
     * This error occurred when the file was partially written during a race condition,
     * resulting in truncated JSON on a line, followed by additional text from
     * another process's write.
     */

    const manager = new KnowledgeGraphManager(testFilePath);

    // Simulate the exact scenario that would have caused the error:
    // Multiple concurrent writes that would have previously caused file corruption
    const operations = [];
    const numConcurrentOps = 10;

    for (let i = 0; i < numConcurrentOps; i++) {
      operations.push(
        manager.createEntities([
          {
            name: `ConcurrentEntity_${i}`,
            entityType: 'TestType',
            observations: [`concurrent_observation_${i}`]
          }
        ])
      );
    }

    // Execute all operations concurrently
    const results = await Promise.all(operations);

    // All operations should succeed without errors
    expect(results).toHaveLength(numConcurrentOps);
    results.forEach(result => {
      expect(result).toHaveLength(1);
    });

    // Read the file and verify it can be parsed without JSON errors
    const rawContent = await fs.readFile(testFilePath, 'utf-8');
    const lines = rawContent.split('\n').filter(line => line.trim() !== '');

    // Should not throw "Unexpected non-whitespace character after JSON"
    let parseErrors = 0;
    lines.forEach(line => {
      try {
        JSON.parse(line);
      } catch (e) {
        parseErrors++;
      }
    });

    expect(parseErrors).toBe(0);

    // Verify all entities were created and can be read
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(numConcurrentOps);
  });
});
