import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, Relation, KnowledgeGraph } from '../index.js';

describe('KnowledgeGraphManager', () => {
  let manager: KnowledgeGraphManager;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a temporary test file path
    testFilePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-memory-${Date.now()}.jsonl`
    );
    manager = new KnowledgeGraphManager(testFilePath);
  });

  afterEach(async () => {
    // Clean up test file
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore errors if file doesn't exist
    }
  });

  describe('createEntities', () => {
    it('should create new entities', async () => {
      const entities: Entity[] = [
        { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
        { name: 'Bob', entityType: 'person', observations: ['likes programming'] },
      ];

      const newEntities = await manager.createEntities(entities);
      expect(newEntities).toHaveLength(2);
      expect(newEntities).toEqual(entities);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(2);
    });

    it('should not create duplicate entities', async () => {
      const entities: Entity[] = [
        { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
      ];

      await manager.createEntities(entities);
      const newEntities = await manager.createEntities(entities);

      expect(newEntities).toHaveLength(0);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
    });

    it('should handle empty entity arrays', async () => {
      const newEntities = await manager.createEntities([]);
      expect(newEntities).toHaveLength(0);
    });
  });

  describe('createRelations', () => {
    it('should create new relations', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: [] },
        { name: 'Bob', entityType: 'person', observations: [] },
      ]);

      const relations: Relation[] = [
        { from: 'Alice', to: 'Bob', relationType: 'knows' },
      ];

      const newRelations = await manager.createRelations(relations);
      expect(newRelations).toHaveLength(1);
      expect(newRelations).toEqual(relations);

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
    });

    it('should not create duplicate relations', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: [] },
        { name: 'Bob', entityType: 'person', observations: [] },
      ]);

      const relations: Relation[] = [
        { from: 'Alice', to: 'Bob', relationType: 'knows' },
      ];

      await manager.createRelations(relations);
      const newRelations = await manager.createRelations(relations);

      expect(newRelations).toHaveLength(0);

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
    });

    it('should handle empty relation arrays', async () => {
      const newRelations = await manager.createRelations([]);
      expect(newRelations).toHaveLength(0);
    });
  });

  describe('addObservations', () => {
    it('should add observations to existing entities', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
      ]);

      const results = await manager.addObservations([
        { entityName: 'Alice', contents: ['likes coffee', 'has a dog'] },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].entityName).toBe('Alice');
      expect(results[0].addedObservations).toHaveLength(2);

      const graph = await manager.readGraph();
      const alice = graph.entities.find(e => e.name === 'Alice');
      expect(alice?.observations).toHaveLength(3);
    });

    it('should not add duplicate observations', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
      ]);

      await manager.addObservations([
        { entityName: 'Alice', contents: ['likes coffee'] },
      ]);

      const results = await manager.addObservations([
        { entityName: 'Alice', contents: ['likes coffee', 'has a dog'] },
      ]);

      expect(results[0].addedObservations).toHaveLength(1);
      expect(results[0].addedObservations).toContain('has a dog');

      const graph = await manager.readGraph();
      const alice = graph.entities.find(e => e.name === 'Alice');
      expect(alice?.observations).toHaveLength(3);
    });

    it('should throw error for non-existent entity', async () => {
      await expect(
        manager.addObservations([
          { entityName: 'NonExistent', contents: ['some observation'] },
        ])
      ).rejects.toThrow('Entity with name NonExistent not found');
    });
  });

  describe('deleteEntities', () => {
    it('should delete entities', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: [] },
        { name: 'Bob', entityType: 'person', observations: [] },
      ]);

      await manager.deleteEntities(['Alice']);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Bob');
    });

    it('should cascade delete relations when deleting entities', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: [] },
        { name: 'Bob', entityType: 'person', observations: [] },
        { name: 'Charlie', entityType: 'person', observations: [] },
      ]);

      await manager.createRelations([
        { from: 'Alice', to: 'Bob', relationType: 'knows' },
        { from: 'Bob', to: 'Charlie', relationType: 'knows' },
      ]);

      await manager.deleteEntities(['Bob']);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(0);
    });

    it('should handle deleting non-existent entities', async () => {
      await manager.deleteEntities(['NonExistent']);
      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(0);
    });
  });

  describe('deleteObservations', () => {
    it('should delete observations from entities', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp', 'likes coffee'] },
      ]);

      await manager.deleteObservations([
        { entityName: 'Alice', observations: ['likes coffee'] },
      ]);

      const graph = await manager.readGraph();
      const alice = graph.entities.find(e => e.name === 'Alice');
      expect(alice?.observations).toHaveLength(1);
      expect(alice?.observations).toContain('works at Acme Corp');
    });

    it('should handle deleting from non-existent entities', async () => {
      await manager.deleteObservations([
        { entityName: 'NonExistent', observations: ['some observation'] },
      ]);
      // Should not throw error
      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(0);
    });
  });

  describe('deleteRelations', () => {
    it('should delete specific relations', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: [] },
        { name: 'Bob', entityType: 'person', observations: [] },
      ]);

      await manager.createRelations([
        { from: 'Alice', to: 'Bob', relationType: 'knows' },
        { from: 'Alice', to: 'Bob', relationType: 'works_with' },
      ]);

      await manager.deleteRelations([
        { from: 'Alice', to: 'Bob', relationType: 'knows' },
      ]);

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].relationType).toBe('works_with');
    });
  });

  describe('readGraph', () => {
    it('should return empty graph when file does not exist', async () => {
      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(0);
      expect(graph.relations).toHaveLength(0);
    });

    it('should return complete graph with entities and relations', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
      ]);

      await manager.createRelations([
        { from: 'Alice', to: 'Alice', relationType: 'self' },
      ]);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.relations).toHaveLength(1);
    });
  });

  describe('searchNodes', () => {
    beforeEach(async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp', 'likes programming'] },
        { name: 'Bob', entityType: 'person', observations: ['works at TechCo'] },
        { name: 'Acme Corp', entityType: 'company', observations: ['tech company'] },
      ]);

      await manager.createRelations([
        { from: 'Alice', to: 'Acme Corp', relationType: 'works_at' },
        { from: 'Bob', to: 'Acme Corp', relationType: 'competitor' },
      ]);
    });

    it('should search by entity name', async () => {
      const result = await manager.searchNodes('Alice');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
    });

    it('should search by entity type', async () => {
      const result = await manager.searchNodes('company');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Acme Corp');
    });

    it('should search by observation content', async () => {
      const result = await manager.searchNodes('programming');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
    });

    it('should be case insensitive', async () => {
      const result = await manager.searchNodes('ALICE');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
    });

    it('should include relations between matched entities', async () => {
      const result = await manager.searchNodes('Acme');
      expect(result.entities).toHaveLength(2); // Alice and Acme Corp
      expect(result.relations).toHaveLength(1); // Only Alice -> Acme Corp relation
    });

    it('should return empty graph for no matches', async () => {
      const result = await manager.searchNodes('NonExistent');
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('openNodes', () => {
    beforeEach(async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: [] },
        { name: 'Bob', entityType: 'person', observations: [] },
        { name: 'Charlie', entityType: 'person', observations: [] },
      ]);

      await manager.createRelations([
        { from: 'Alice', to: 'Bob', relationType: 'knows' },
        { from: 'Bob', to: 'Charlie', relationType: 'knows' },
      ]);
    });

    it('should open specific nodes by name', async () => {
      const result = await manager.openNodes(['Alice', 'Bob']);
      expect(result.entities).toHaveLength(2);
      expect(result.entities.map(e => e.name)).toContain('Alice');
      expect(result.entities.map(e => e.name)).toContain('Bob');
    });

    it('should include relations between opened nodes', async () => {
      const result = await manager.openNodes(['Alice', 'Bob']);
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].from).toBe('Alice');
      expect(result.relations[0].to).toBe('Bob');
    });

    it('should exclude relations to unopened nodes', async () => {
      const result = await manager.openNodes(['Bob']);
      expect(result.relations).toHaveLength(0);
    });

    it('should handle opening non-existent nodes', async () => {
      const result = await manager.openNodes(['NonExistent']);
      expect(result.entities).toHaveLength(0);
    });

    it('should handle empty node list', async () => {
      const result = await manager.openNodes([]);
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('file persistence', () => {
    it('should persist data across manager instances', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: ['persistent data'] },
      ]);

      // Create new manager instance with same file path
      const manager2 = new KnowledgeGraphManager(testFilePath);
      const graph = await manager2.readGraph();

      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Alice');
    });

    it('should handle JSONL format correctly', async () => {
      await manager.createEntities([
        { name: 'Alice', entityType: 'person', observations: [] },
      ]);
      await manager.createRelations([
        { from: 'Alice', to: 'Alice', relationType: 'self' },
      ]);

      // Read file directly
      const fileContent = await fs.readFile(testFilePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toHaveProperty('type', 'entity');
      expect(JSON.parse(lines[1])).toHaveProperty('type', 'relation');
    });
  });
});
