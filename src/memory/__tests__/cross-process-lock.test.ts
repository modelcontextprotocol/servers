import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { KnowledgeGraphManager } from '../index.js';

/**
 * Regression tests for cross-process exclusion (#1819, #3286).
 *
 * The in-process mutation queue (#4555) serialises one instance's mutations,
 * but the server is stdio-only, so every client is its own process with its
 * own queue. Two instances on one file are a faithful stand-in: nothing but
 * the sidecar lock file separates them, exactly as with two processes.
 */
describe('KnowledgeGraphManager cross-process exclusion', () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-xproc-'));
    testFilePath = path.join(testDir, 'memory.jsonl');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  const entity = (name: string) => ({ name, entityType: 'thing', observations: [] as string[] });

  it('keeps every entity when two instances write the same file concurrently', async () => {
    const a = new KnowledgeGraphManager(testFilePath);
    const b = new KnowledgeGraphManager(testFilePath);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? b : a).createEntities([entity(`e${i}`)])),
    );
    const names = (await a.readGraph()).entities.map(e => e.name).sort();
    expect(names).toEqual(Array.from({ length: 20 }, (_, i) => `e${i}`).sort());
  });

  it('removes its lock file after each mutation', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([entity('x')]);
    await expect(fs.stat(`${testFilePath}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reclaims a lock left behind by a crashed process', async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(`${testFilePath}.lock`, '');
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(`${testFilePath}.lock`, old, old);
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([entity('x')]);
    expect((await manager.readGraph()).entities).toHaveLength(1);
  });
});
