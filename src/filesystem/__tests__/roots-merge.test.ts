import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('updateAllowedDirectoriesFromRoots merge behaviour', () => {
  let cliDir: string;
  let mcpDir1: string;
  let mcpDir2: string;

  beforeEach(() => {
    cliDir = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-cli-')));
    mcpDir1 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots1-')));
    mcpDir2 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots2-')));
  });

  afterEach(() => {
    rmSync(cliDir, { recursive: true, force: true });
    rmSync(mcpDir1, { recursive: true, force: true });
    rmSync(mcpDir2, { recursive: true, force: true });
  });

  it('should preserve CLI dirs after init with roots', () => {
    // Simulates the snapshot: cliAllowedDirectories = [cliDir]
    const cliAllowedDirectories = [cliDir];
    const validatedRootDirs = [mcpDir1];

    const merged = new Set([...cliAllowedDirectories, ...validatedRootDirs]);
    const allowedDirectories = [...merged];

    expect(allowedDirectories).toContain(cliDir);
    expect(allowedDirectories).toContain(mcpDir1);
  });

  it('should replace MCP roots on roots/list_changed without accumulating', () => {
    // Simulates: CLI dir + first MCP root
    const cliAllowedDirectories = [cliDir];
    const firstMcpRoots = [mcpDir1];

    let merged = new Set([...cliAllowedDirectories, ...firstMcpRoots]);
    let allowedDirectories = [...merged];

    expect(allowedDirectories).toContain(cliDir);
    expect(allowedDirectories).toContain(mcpDir1);
    expect(allowedDirectories).toHaveLength(2);

    // Simulates: roots/list_changed with new root (mcpDir2 replaces mcpDir1)
    const secondMcpRoots = [mcpDir2];
    merged = new Set([...cliAllowedDirectories, ...secondMcpRoots]);
    allowedDirectories = [...merged];

    expect(allowedDirectories).toContain(cliDir);
    expect(allowedDirectories).toContain(mcpDir2);
    expect(allowedDirectories).not.toContain(mcpDir1);
    expect(allowedDirectories).toHaveLength(2);
  });

  it('should not accumulate stale roots across multiple updates', () => {
    const cliAllowedDirectories = [cliDir];
    let allowedDirectories: string[] = [];

    for (let i = 0; i < 5; i++) {
      const tmpDir = realpathSync(mkdtempSync(join(tmpdir(), `mcp-root-${i}-`)));
      const merged = new Set([...cliAllowedDirectories, tmpDir]);
      allowedDirectories = [...merged];
      rmSync(tmpDir, { recursive: true, force: true });
    }

    // After each iteration, only CLI dir + latest root should be present
    expect(allowedDirectories).toHaveLength(2);
    expect(allowedDirectories).toContain(cliDir);
  });
});
