import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, Relation } from '../index.js';

/**
 * The delete tools stay silent when a target is absent, which the README
 * documents. What they must not do is report a deletion that did not happen:
 * an agent that mistypes a name is told its memory is clean while the data is
 * still on disk, and nothing in the response contradicts that.
 */
describe('delete reporting', () => {
  let manager: KnowledgeGraphManager;
  let testFilePath: string;

  const entities: Entity[] = [
    { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp', 'likes tea'] },
    { name: 'Bob', entityType: 'person', observations: ['likes programming'] },
  ];
  const relations: Relation[] = [{ from: 'Alice', to: 'Bob', relationType: 'works_with' }];

  beforeEach(async () => {
    testFilePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-delete-reporting-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`
    );
    manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities(entities);
    await manager.createRelations(relations);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // the file is gone already
    }
  });

  describe('deleteEntities', () => {
    it('reports which names matched and which did not', async () => {
      const result = await manager.deleteEntities(['Alice', 'Alise']);
      expect(result).toEqual({ deleted: ['Alice'], notFound: ['Alise'] });
    });

    it('reports nothing deleted when no name matches', async () => {
      const result = await manager.deleteEntities(['Nobody']);
      expect(result).toEqual({ deleted: [], notFound: ['Nobody'] });

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(2);
    });

    it('still deletes the entity and its relations', async () => {
      await manager.deleteEntities(['Alice']);

      const graph = await manager.readGraph();
      expect(graph.entities.map(e => e.name)).toEqual(['Bob']);
      expect(graph.relations).toHaveLength(0);
    });
  });

  describe('deleteObservations', () => {
    it('counts only the observations that were present', async () => {
      const result = await manager.deleteObservations([
        { entityName: 'Alice', observations: ['likes tea', 'never said this'] },
      ]);
      expect(result).toEqual({ deletedCount: 1, missingEntities: [] });
    });

    it('names an entity that does not exist', async () => {
      const result = await manager.deleteObservations([
        { entityName: 'Carol', observations: ['anything'] },
      ]);
      expect(result).toEqual({ deletedCount: 0, missingEntities: ['Carol'] });
    });
  });

  describe('deleteRelations', () => {
    it('counts only the relations that matched', async () => {
      const result = await manager.deleteRelations([
        { from: 'Alice', to: 'Bob', relationType: 'works_with' },
        { from: 'Alice', to: 'Bob', relationType: 'never_existed' },
      ]);
      expect(result).toEqual({ deletedCount: 1 });
    });

    it('reports nothing deleted when the relation type is wrong', async () => {
      const result = await manager.deleteRelations([
        { from: 'Alice', to: 'Bob', relationType: 'manages' },
      ]);
      expect(result).toEqual({ deletedCount: 0 });

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
    });
  });
});
