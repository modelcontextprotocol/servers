import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { KnowledgeGraphManager, Entity } from '../index.js';

/**
 * Regression tests for durable persistence of the knowledge graph.
 *
 * saveGraph() previously called fs.writeFile() directly on the memory file.
 * fs.writeFile opens the target with 'w', which truncates it before any new
 * bytes are written. If the process dies between truncation and completion
 * (SIGKILL, container stop, OOM kill, power loss) the memory file — the sole
 * persistence layer for the graph — is left empty or half-written, and the
 * accumulated memory is unrecoverable.
 *
 * The fix writes to a temporary file in the same directory and then renames
 * it over the target. rename(2) is atomic on POSIX filesystems: a reader
 * either sees the complete old file or the complete new one, never a
 * truncated intermediate state.
 */
describe('KnowledgeGraphManager persistence durability', () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-atomic-'));
    testFilePath = path.join(testDir, 'memory.jsonl');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('never truncates the live memory file in place', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([
      { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
    ]);

    // Any write that targets the live file directly is destructive: it
    // truncates committed data before the replacement is durable.
    const writeFileSpy = vi.spyOn(fs, 'writeFile');
    const openSpy = vi.spyOn(fs, 'open');

    await manager.createEntities([
      { name: 'Bob', entityType: 'person', observations: ['likes programming'] },
    ]);

    const destructiveTargets = [
      ...writeFileSpy.mock.calls.map(call => call[0]),
      ...openSpy.mock.calls.map(call => call[0]),
    ].filter(target => target === testFilePath);

    expect(destructiveTargets).toEqual([]);
  });

  it('leaves the committed graph intact when the write fails midway', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([
      { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
    ]);

    const before = await fs.readFile(testFilePath, 'utf-8');
    expect(before).toContain('Alice');

    // Simulate the process being interrupted while persisting the next write.
    const writeFile = fs.writeFile;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      if (String(args[0]).endsWith('.tmp')) throw new Error('ENOSPC: simulated interruption');
      return writeFile(...args);
    });

    await expect(
      manager.createEntities([
        { name: 'Bob', entityType: 'person', observations: ['likes programming'] },
      ])
    ).rejects.toThrow();

    vi.restoreAllMocks();

    // The previously committed graph must survive untouched.
    expect(await fs.readFile(testFilePath, 'utf-8')).toBe(before);

    const graph = await new KnowledgeGraphManager(testFilePath).readGraph();
    expect(graph.entities.map(e => e.name)).toEqual(['Alice']);
  });

  it('does not leave temporary files behind after a successful write', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([
      { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
    ]);

    expect(await fs.readdir(testDir)).toEqual(['memory.jsonl']);
  });

  it('cleans up the temporary file when the write fails', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([
      { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
    ]);

    const rename = fs.rename;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (to === testFilePath) throw new Error('EXDEV: simulated rename failure');
      return rename(from, to);
    });

    await expect(
      manager.createEntities([
        { name: 'Bob', entityType: 'person', observations: ['likes programming'] },
      ])
    ).rejects.toThrow();

    vi.restoreAllMocks();
    expect(await fs.readdir(testDir)).toEqual(['memory.jsonl']);
  });

  it('does not publish after losing its lease and can process a later mutation', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([
      { name: 'Alice', entityType: 'person', observations: [] },
    ]);
    const before = await fs.readFile(testFilePath, 'utf8');
    const lockPath = `${testFilePath}.lock`;
    const writeFile = fs.writeFile;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      await writeFile(...args);
      if (!String(args[0]).endsWith('.tmp')) return;
      // Replace the lease between preparation and publication of the graph.
      await fs.rm(lockPath, { recursive: true });
      await fs.mkdir(lockPath);
      const replacementTime = new Date(Date.now() + 10000);
      await fs.utimes(lockPath, replacementTime, replacementTime);
    });

    // Lease loss detected before the rename is NOT_COMMITTED: the graph file
    // was definitely not replaced, so a retry is safe.
    await expect(manager.createEntities([
      { name: 'Bob', entityType: 'person', observations: [] },
    ])).rejects.toMatchObject({ name: 'MemoryRequestError', state: 'NOT_COMMITTED' });
    expect(await fs.readFile(testFilePath, 'utf8')).toBe(before);
    expect((await fs.stat(lockPath)).isDirectory()).toBe(true);
    expect((await fs.readdir(testDir)).sort()).toEqual(['memory.jsonl', 'memory.jsonl.lock']);

    // The replacement owner releases its own lease; the failed request must
    // not leave the manager's in-process mutation queue permanently rejected.
    vi.restoreAllMocks();
    await fs.rmdir(lockPath);
    await manager.createEntities([
      { name: 'Carol', entityType: 'person', observations: [] },
    ]);
    expect((await manager.readGraph()).entities.map(entity => entity.name)).toEqual(['Alice', 'Carol']);
  });

  it('still persists graph contents correctly across reloads', async () => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([
      { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
      { name: 'Bob', entityType: 'person', observations: ['likes programming'] },
    ]);
    await manager.createRelations([
      { from: 'Alice', to: 'Bob', relationType: 'knows' },
    ]);

    const reloaded = await new KnowledgeGraphManager(testFilePath).readGraph();
    expect(reloaded.entities.map(e => e.name).sort()).toEqual(['Alice', 'Bob']);
    expect(reloaded.relations).toEqual([
      { from: 'Alice', to: 'Bob', relationType: 'knows' },
    ]);
  });
});
