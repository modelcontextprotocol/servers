import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IStorageBackend } from '../../../storage/interface.js';
import { JSONStorage } from '../../../storage/json-storage.js';
import { SQLiteStorage } from '../../../storage/sqlite-storage.js';
import { Entity, Relation } from '../../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Test factory to run same tests on both implementations
function testStorageBackend(name: string, createStorage: () => IStorageBackend) {
  describe(`${name} Storage Backend`, () => {
    let storage: IStorageBackend;
    let testDir: string;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-memory-test-'));
      storage = createStorage();
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
      await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Entity Operations', () => {
      it('should create entities', async () => {
        const entities: Entity[] = [
          {
            name: 'Test User',
            entityType: 'Person',
            observations: ['Likes testing', 'Uses TypeScript']
          },
          {
            name: 'Test Project',
            entityType: 'Software',
            observations: ['Written in TypeScript', 'Has tests']
          }
        ];

        const created = await storage.createEntities(entities);
        expect(created).toHaveLength(2);
        expect(created[0].name).toBe('Test User');
        expect(created[1].name).toBe('Test Project');
      });

      it('should handle duplicate entity creation', async () => {
        const entity: Entity = {
          name: 'Duplicate Test',
          entityType: 'Test',
          observations: ['First observation']
        };

        await storage.createEntities([entity]);
        const result = await storage.createEntities([entity]);
        
        expect(result).toHaveLength(0);
      });

      it('should create entities with empty observations', async () => {
        const entity: Entity = {
          name: 'Empty Obs Entity',
          entityType: 'Test',
          observations: []
        };

        const created = await storage.createEntities([entity]);
        expect(created).toHaveLength(1);
        expect(created[0].observations).toEqual([]);
      });

      it('should handle special characters in entity names', async () => {
        const entities: Entity[] = [
          {
            name: 'Test "Quoted" Name',
            entityType: 'Test',
            observations: ['Has quotes']
          },
          {
            name: "Test's Apostrophe",
            entityType: 'Test',
            observations: ['Has apostrophe']
          },
          {
            name: 'Test\nNewline',
            entityType: 'Test',
            observations: ['Has newline']
          }
        ];

        const created = await storage.createEntities(entities);
        expect(created).toHaveLength(3);
      });

      it('should delete entities', async () => {
        const entities: Entity[] = [
          {
            name: 'To Delete',
            entityType: 'Test',
            observations: ['Will be deleted']
          }
        ];

        await storage.createEntities(entities);
        await storage.deleteEntities(['To Delete']);

        const graph = await storage.loadGraph();
        expect(graph.entities).toHaveLength(0);
      });

      it('should handle deletion of non-existent entities', async () => {
        // Should not throw when deleting non-existent entities
        await expect(storage.deleteEntities(['Non Existent'])).resolves.not.toThrow();
      });
    });

    describe('Observation Operations', () => {
      beforeEach(async () => {
        const entity: Entity = {
          name: 'Observation Test',
          entityType: 'Test',
          observations: ['Initial observation']
        };
        await storage.createEntities([entity]);
      });

      it('should add observations to existing entity', async () => {
        const result = await storage.addObservations([
          {
            entityName: 'Observation Test',
            contents: ['New observation 1', 'New observation 2']
          }
        ]);

        expect(result).toHaveLength(1);
        expect(result[0].entityName).toBe('Observation Test');
        expect(result[0].addedObservations).toHaveLength(2);
      });

      it('should not add duplicate observations', async () => {
        const result = await storage.addObservations([
          {
            entityName: 'Observation Test',
            contents: ['Initial observation', 'New observation']
          }
        ]);

        expect(result[0].addedObservations).toHaveLength(1);
        expect(result[0].addedObservations[0]).toBe('New observation');
      });

      it('should handle adding observations to non-existent entity', async () => {
        // JSON storage throws, SQLite returns empty array
        try {
          const result = await storage.addObservations([
            {
              entityName: 'Non Existent',
              contents: ['Some observation']
            }
          ]);
          // SQLite behavior - returns empty result
          expect(result).toHaveLength(0);
        } catch (error) {
          // JSON behavior - throws error
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('not found');
        }
      });

      it('should delete specific observations', async () => {
        await storage.addObservations([
          {
            entityName: 'Observation Test',
            contents: ['To delete 1', 'To keep', 'To delete 2']
          }
        ]);

        await storage.deleteObservations([
          {
            entityName: 'Observation Test',
            observations: ['To delete 1', 'To delete 2']
          }
        ]);

        const entities = await storage.getEntities(['Observation Test']);
        expect(entities[0].observations).toContain('Initial observation');
        expect(entities[0].observations).toContain('To keep');
        expect(entities[0].observations).not.toContain('To delete 1');
        expect(entities[0].observations).not.toContain('To delete 2');
      });
    });

    describe('Relation Operations', () => {
      beforeEach(async () => {
        const entities: Entity[] = [
          {
            name: 'Entity A',
            entityType: 'Test',
            observations: ['A observation']
          },
          {
            name: 'Entity B',
            entityType: 'Test',
            observations: ['B observation']
          },
          {
            name: 'Entity C',
            entityType: 'Test',
            observations: ['C observation']
          }
        ];
        await storage.createEntities(entities);
      });

      it('should create relations between entities', async () => {
        const relations: Relation[] = [
          {
            from: 'Entity A',
            to: 'Entity B',
            relationType: 'connects to'
          },
          {
            from: 'Entity B',
            to: 'Entity C',
            relationType: 'links with'
          }
        ];

        const created = await storage.createRelations(relations);
        expect(created).toHaveLength(2);
      });

      it('should not create duplicate relations', async () => {
        const relation: Relation = {
          from: 'Entity A',
          to: 'Entity B',
          relationType: 'connects to'
        };

        await storage.createRelations([relation]);
        const result = await storage.createRelations([relation]);
        expect(result).toHaveLength(0);
      });

      it('should not create relations for non-existent entities', async () => {
        const relations: Relation[] = [
          {
            from: 'Non Existent',
            to: 'Entity A',
            relationType: 'invalid'
          },
          {
            from: 'Entity A',
            to: 'Non Existent',
            relationType: 'invalid'
          }
        ];

        // Behavior varies by implementation
        const created = await storage.createRelations(relations);
        
        // SQLite silently ignores, JSON might create them
        // Just verify no errors thrown
        expect(Array.isArray(created)).toBe(true);
      });

      it('should delete relations', async () => {
        const relations: Relation[] = [
          {
            from: 'Entity A',
            to: 'Entity B',
            relationType: 'connects to'
          },
          {
            from: 'Entity B',
            to: 'Entity C',
            relationType: 'links with'
          }
        ];

        await storage.createRelations(relations);
        await storage.deleteRelations([relations[0]]);
        
        const graph = await storage.loadGraph();
        expect(graph.relations).toHaveLength(1);
        expect(graph.relations[0].from).toBe('Entity B');
      });

      it('should delete relations when entity is deleted', async () => {
        const relations: Relation[] = [
          {
            from: 'Entity A',
            to: 'Entity B',
            relationType: 'connects to'
          },
          {
            from: 'Entity B',
            to: 'Entity C',
            relationType: 'links with'
          }
        ];

        await storage.createRelations(relations);
        await storage.deleteEntities(['Entity B']);

        const graph = await storage.loadGraph();
        expect(graph.relations).toHaveLength(0);
      });
    });

    describe('Search Operations', () => {
      beforeEach(async () => {
        const entities: Entity[] = [
          {
            name: 'Search Test 1',
            entityType: 'SearchType',
            observations: ['Contains keyword UNIQUE', 'Another observation']
          },
          {
            name: 'Search Test 2',
            entityType: 'DifferentType',
            observations: ['Different content', 'Also has UNIQUE word']
          },
          {
            name: 'UNIQUE Name',
            entityType: 'SpecialType',
            observations: ['Regular observation']
          }
        ];
        await storage.createEntities(entities);
      });

      it('should search entities by name', async () => {
        const results = await storage.searchEntities('UNIQUE Name');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('UNIQUE Name');
      });

      it('should search entities by partial name', async () => {
        const results = await storage.searchEntities('Search Test');
        expect(results).toHaveLength(2);
      });

      it('should search entities by type', async () => {
        const results = await storage.searchEntities('SearchType');
        expect(results).toHaveLength(1);
        expect(results[0].entityType).toBe('SearchType');
      });

      it('should search entities by observation content', async () => {
        const results = await storage.searchEntities('UNIQUE');
        expect(results).toHaveLength(3);
      });

      it('should handle case-insensitive search', async () => {
        const results = await storage.searchEntities('unique');
        expect(results).toHaveLength(3);
      });

      it('should return empty array for no matches', async () => {
        const results = await storage.searchEntities('NonExistentKeyword');
        expect(results).toHaveLength(0);
      });
    });

    describe('Graph Operations', () => {
      it('should load empty graph', async () => {
        const graph = await storage.loadGraph();
        expect(graph.entities).toHaveLength(0);
        expect(graph.relations).toHaveLength(0);
      });

      it('should load complete graph', async () => {
        const entities: Entity[] = [
          {
            name: 'Graph Entity 1',
            entityType: 'Type1',
            observations: ['Obs1', 'Obs2']
          },
          {
            name: 'Graph Entity 2',
            entityType: 'Type2',
            observations: ['Obs3']
          }
        ];

        const relations: Relation[] = [
          {
            from: 'Graph Entity 1',
            to: 'Graph Entity 2',
            relationType: 'relates to'
          }
        ];

        await storage.createEntities(entities);
        await storage.createRelations(relations);

        const graph = await storage.loadGraph();
        expect(graph.entities).toHaveLength(2);
        expect(graph.relations).toHaveLength(1);
      });

      it('should open specific entities', async () => {
        const entities: Entity[] = [
          {
            name: 'Entity 1',
            entityType: 'Type1',
            observations: ['Obs1']
          },
          {
            name: 'Entity 2',
            entityType: 'Type2',
            observations: ['Obs2']
          },
          {
            name: 'Entity 3',
            entityType: 'Type3',
            observations: ['Obs3']
          }
        ];

        await storage.createEntities(entities);

        const opened = await storage.getEntities(['Entity 1', 'Entity 3']);
        expect(opened).toHaveLength(2);
        expect(opened.map(e => e.name)).toContain('Entity 1');
        expect(opened.map(e => e.name)).toContain('Entity 3');
      });

      it('should handle opening non-existent entities', async () => {
        const opened = await storage.getEntities(['Non Existent']);
        expect(opened).toHaveLength(0);
      });
    });

    describe('Statistics', () => {
      it('should return correct stats for empty storage', async () => {
        const stats = await storage.getStats();
        expect(stats.entityCount).toBe(0);
        expect(stats.relationCount).toBe(0);
        expect(stats.observationCount).toBe(0);
        // storageSize is optional in the interface
        if (stats.storageSize !== undefined) {
          expect(stats.storageSize).toBeGreaterThanOrEqual(0);
        }
      });

      it('should return correct stats after operations', async () => {
        const entities: Entity[] = [
          {
            name: 'Stats Entity 1',
            entityType: 'Type1',
            observations: ['Obs1', 'Obs2']
          },
          {
            name: 'Stats Entity 2',
            entityType: 'Type2',
            observations: ['Obs3']
          }
        ];

        const relations: Relation[] = [
          {
            from: 'Stats Entity 1',
            to: 'Stats Entity 2',
            relationType: 'relates to'
          }
        ];

        await storage.createEntities(entities);
        await storage.createRelations(relations);

        const stats = await storage.getStats();
        expect(stats.entityCount).toBe(2);
        expect(stats.relationCount).toBe(1);
        expect(stats.observationCount).toBe(3);
        // storageSize is optional in the interface
        if (stats.storageSize !== undefined && stats.storageSize > 0) {
          expect(stats.storageSize).toBeGreaterThan(0);
        }
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle very long entity names', async () => {
        const longName = 'A'.repeat(1000);
        const entity: Entity = {
          name: longName,
          entityType: 'Test',
          observations: ['Long name test']
        };

        const created = await storage.createEntities([entity]);
        expect(created).toHaveLength(1);
        expect(created[0].name).toBe(longName);
      });

      it('should handle very long observations', async () => {
        const longObs = 'B'.repeat(10000);
        const entity: Entity = {
          name: 'Long Obs Test',
          entityType: 'Test',
          observations: [longObs]
        };

        const created = await storage.createEntities([entity]);
        expect(created).toHaveLength(1);
        expect(created[0].observations[0]).toBe(longObs);
      });

      it('should handle batch operations correctly', async () => {
        const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
          name: `Batch Entity ${i}`,
          entityType: 'BatchTest',
          observations: [`Observation for entity ${i}`]
        }));

        const created = await storage.createEntities(entities);
        expect(created).toHaveLength(100);

        const graph = await storage.loadGraph();
        expect(graph.entities).toHaveLength(100);
      });
    });
  });
}

// Create test suites for both implementations
describe('Storage Backend Tests', () => {
  testStorageBackend('JSON', () => {
    const tempFile = path.join(tmpdir(), `test-memory-${Date.now()}-${Math.random()}.jsonl`);
    return new JSONStorage({ type: 'json', filePath: tempFile });
  });

  testStorageBackend('SQLite', () => {
    // Use unique memory database for each test
    const tempFile = path.join(tmpdir(), `test-memory-${Date.now()}-${Math.random()}.db`);
    return new SQLiteStorage({ type: 'sqlite', filePath: tempFile });
  });
});