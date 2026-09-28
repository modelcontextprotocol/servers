import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraphManager, Entity, skippedEntityNames, skippedEntitiesNotice } from '../index.js';

/**
 * create_entities ignores entities whose name already exists, as the README
 * documents. The agent only sees the tool description, though, so the response
 * must say which entities were skipped: otherwise their observations look
 * stored when nothing was written.
 */
describe('create reporting', () => {
  let manager: KnowledgeGraphManager;
  let testFilePath: string;

  beforeEach(async () => {
    testFilePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      `test-create-reporting-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`
    );
    manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([{ name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] }]);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // the file is gone already
    }
  });

  it('names an entity skipped because it already exists', async () => {
    const requested: Entity[] = [
      { name: 'Alice', entityType: 'person', observations: ['allergic to penicillin'] },
      { name: 'Bob', entityType: 'person', observations: [] },
    ];
    const created = await manager.createEntities(requested);
    expect(created.map(e => e.name)).toEqual(['Bob']);
    expect(skippedEntityNames(requested, created)).toEqual(['Alice']);
  });

  it('names a repeat within the same batch', async () => {
    const requested: Entity[] = [
      { name: 'Carol', entityType: 'person', observations: ['first'] },
      { name: 'Carol', entityType: 'person', observations: ['second'] },
    ];
    const created = await manager.createEntities(requested);
    expect(skippedEntityNames(requested, created)).toEqual(['Carol']);
  });

  it('reports nothing skipped when every entity is new', async () => {
    const requested: Entity[] = [{ name: 'Dan', entityType: 'person', observations: [] }];
    const created = await manager.createEntities(requested);
    expect(skippedEntityNames(requested, created)).toEqual([]);
  });

  it('words the notice for one and for several skipped entities', () => {
    expect(skippedEntitiesNotice(['Alice'])).toBe(
      'Skipped 1 entity that already exists: Alice. Its observations were not added; ' +
      'use add_observations for existing entities.'
    );
    expect(skippedEntitiesNotice(['Alice', 'Bob'])).toBe(
      'Skipped 2 entities that already exist: Alice, Bob. Their observations were not added; ' +
      'use add_observations for existing entities.'
    );
  });
});
