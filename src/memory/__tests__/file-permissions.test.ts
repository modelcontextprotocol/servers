import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { KnowledgeGraphManager } from '../index.js';

/**
 * Regression tests for the memory file's permission bits.
 *
 * saveGraph() writes a temporary file and renames it over the memory file.
 * The rename replaces the inode, and the temp file is created under the
 * process umask, so any permission bits the operator set on the memory file
 * (chmod 600, restored from a 600 backup, written by another tool) are lost
 * on the next mutation and the file comes back 0644. The filesystem server
 * (src/filesystem/lib.ts) restores the original bits after the same
 * temp-file + rename sequence; the memory server must do the same.
 */
describe('KnowledgeGraphManager file permissions', () => {
  let testDir: string;
  let testFilePath: string;

  // Octal, so a failure reports the modes an operator would have typed.
  const modeOf = async (file: string): Promise<string> =>
    ((await fs.stat(file)).mode & 0o777).toString(8);

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-perms-'));
    testFilePath = path.join(testDir, 'memory.jsonl');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it.each([
    { label: 'owner-only (0600)', mode: 0o600 },
    { label: 'group-readable (0640)', mode: 0o640 },
  ])('keeps a $label memory file at that mode across a mutation', async ({ mode }) => {
    const manager = new KnowledgeGraphManager(testFilePath);
    await manager.createEntities([
      { name: 'Alice', entityType: 'person', observations: ['works at Acme Corp'] },
    ]);

    await fs.chmod(testFilePath, mode);
    expect(await modeOf(testFilePath), 'mode set by the operator').toBe(mode.toString(8));

    await manager.createEntities([
      { name: 'Bob', entityType: 'person', observations: ['likes programming'] },
    ]);

    expect(await modeOf(testFilePath), 'mode after a save').toBe(mode.toString(8));

    // The mutation must still have been persisted.
    const reloaded = await new KnowledgeGraphManager(testFilePath).readGraph();
    expect(reloaded.entities.map(e => e.name).sort()).toEqual(['Alice', 'Bob']);
  });
});
