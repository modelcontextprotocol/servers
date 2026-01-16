import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, Relation } from '../index.js';
import { Worker } from 'worker_threads';

/**
 * This test suite demonstrates concurrent access to the knowledge graph
 * and verifies that the locking mechanism prevents race conditions.
 * 
 * The race condition occurs when multiple processes/threads attempt to
 * read, modify, and write to the same file simultaneously without synchronization.
 */

describe('Race Condition Prevention', () => {
  let testFilePath: string;

  beforeEach(async () => {
    testFilePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `race-test-${Date.now()}.jsonl`
    );
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  it('should handle concurrent entity creation without data loss', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Simulate concurrent operations
    const operations = [
      manager.createEntities([
        { name: 'Human', entityType: 'Actor', observations: ['is_actor'] }
      ]),
      manager.createEntities([
        { name: 'Goat', entityType: 'Actor', observations: ['is_actor'] }
      ]),
      manager.createEntities([
        { name: 'Cabbage', entityType: 'Item', observations: ['is_item'] }
      ])
    ];

    // Wait for all operations to complete
    const results = await Promise.all(operations);

    // Verify all entities were created successfully
    expect(results[0]).toHaveLength(1);
    expect(results[1]).toHaveLength(1);
    expect(results[2]).toHaveLength(1);

    // Verify final state
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(3);
    expect(graph.entities.map(e => e.name)).toContain('Human');
    expect(graph.entities.map(e => e.name)).toContain('Goat');
    expect(graph.entities.map(e => e.name)).toContain('Cabbage');
  });

  it('should handle concurrent relation creation without data loss', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Create entities first
    await manager.createEntities([
      { name: 'Human', entityType: 'Actor', observations: [] },
      { name: 'Goat', entityType: 'Actor', observations: [] },
      { name: 'Cabbage', entityType: 'Item', observations: [] },
      { name: 'Start_Bank', entityType: 'Location', observations: [] },
      { name: 'End_Bank', entityType: 'Location', observations: [] }
    ]);

    // Simulate concurrent relation creation
    const operations = [
      manager.createRelations([
        { from: 'Human', to: 'Start_Bank', relationType: 'is_at' }
      ]),
      manager.createRelations([
        { from: 'Goat', to: 'Start_Bank', relationType: 'is_at' }
      ]),
      manager.createRelations([
        { from: 'Cabbage', to: 'Start_Bank', relationType: 'is_at' }
      ]),
      manager.createRelations([
        { from: 'Human', to: 'Goat', relationType: 'can_take' }
      ]),
      manager.createRelations([
        { from: 'Human', to: 'Cabbage', relationType: 'can_take' }
      ])
    ];

    const results = await Promise.all(operations);

    // Verify all relations were created
    results.forEach(result => {
      expect(result).toHaveLength(1);
    });

    // Verify final state
    const graph = await manager.readGraph();
    expect(graph.relations).toHaveLength(5);
  });

  it('should handle mixed concurrent operations (create + read)', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Mix create and read operations
    const operations = [
      manager.createEntities([
        { name: 'Entity1', entityType: 'Type1', observations: ['obs1'] }
      ]),
      manager.readGraph(),
      manager.createEntities([
        { name: 'Entity2', entityType: 'Type2', observations: ['obs2'] }
      ]),
      manager.readGraph(),
      manager.createEntities([
        { name: 'Entity3', entityType: 'Type3', observations: ['obs3'] }
      ])
    ];

    const results = await Promise.all(operations);

    // Check that reads returned valid graphs
    const readResults = [results[1], results[3]];
    readResults.forEach((graph: any) => {
      expect(graph).toHaveProperty('entities');
      expect(graph).toHaveProperty('relations');
      expect(Array.isArray(graph.entities)).toBe(true);
    });

    // Verify final state contains all created entities
    const finalGraph = await manager.readGraph();
    expect(finalGraph.entities).toHaveLength(3);
  });

  it('should handle concurrent observations addition without data loss', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Create an entity first
    await manager.createEntities([
      { name: 'TestEntity', entityType: 'TestType', observations: ['initial_obs'] }
    ]);

    // Add observations concurrently
    const operations = [
      manager.addObservations([
        { entityName: 'TestEntity', contents: ['observation_1'] }
      ]),
      manager.addObservations([
        { entityName: 'TestEntity', contents: ['observation_2'] }
      ]),
      manager.addObservations([
        { entityName: 'TestEntity', contents: ['observation_3'] }
      ])
    ];

    await Promise.all(operations);

    // Verify all observations were added
    const graph = await manager.readGraph();
    const entity = graph.entities.find(e => e.name === 'TestEntity');
    expect(entity).toBeDefined();
    expect(entity?.observations).toContain('initial_obs');
    expect(entity?.observations).toContain('observation_1');
    expect(entity?.observations).toContain('observation_2');
    expect(entity?.observations).toContain('observation_3');
  });

  it('should maintain data integrity under high concurrency', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);

    // Create base entities
    const baseEntities: Entity[] = Array.from({ length: 5 }, (_, i) => ({
      name: `Entity_${i}`,
      entityType: `Type_${i % 2}`,
      observations: [`obs_${i}`]
    }));

    await manager.createEntities(baseEntities);

    // Create many concurrent operations
    const operations = [];
    for (let i = 0; i < 10; i++) {
      operations.push(
        manager.addObservations([
          { entityName: `Entity_${i % 5}`, contents: [`concurrent_obs_${i}`] }
        ])
      );
    }

    await Promise.all(operations);

    // Verify data integrity
    const graph = await manager.readGraph();
    expect(graph.entities).toHaveLength(5);
    
    let totalObservations = 0;
    graph.entities.forEach(entity => {
      totalObservations += entity.observations.length;
      // Each entity should have at least 1 initial observation + some concurrent ones
      expect(entity.observations.length).toBeGreaterThanOrEqual(1);
    });

    // Should have 5 initial + 10 concurrent observations
    expect(totalObservations).toBe(15);
  });
});
