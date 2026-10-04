/**
 * Tests for Issue #2219 — hidden file filtering in the directory_tree handler.
 *
 * Replicates the buildTree logic (as directory-tree.test.ts does) and tests it
 * against a real temporary directory. No vi.mock here so real fs calls work.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { minimatch } from 'minimatch';

// ---------------------------------------------------------------------------
// Local replica of the directory_tree buildTree logic extended with the new
// `includeHidden` flag introduced by this PR.
// ---------------------------------------------------------------------------
interface TreeEntry {
  name: string;
  type: 'file' | 'directory';
  children?: TreeEntry[];
}

async function buildTreeForTesting(
  currentPath: string,
  rootPath: string,
  excludePatterns: string[] = [],
  includeHidden = false,
): Promise<TreeEntry[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const result: TreeEntry[] = [];

  for (const entry of entries) {
    // Guard mirrors the change made to the real handler in index.ts (Issue #2219)
    if (!includeHidden && entry.name.startsWith('.')) continue;

    const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));
    const shouldExclude = excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        return minimatch(relativePath, pattern, { dot: true });
      }
      return (
        minimatch(relativePath, pattern, { dot: true }) ||
        minimatch(relativePath, `**/${pattern}`, { dot: true }) ||
        minimatch(relativePath, `**/${pattern}/**`, { dot: true })
      );
    });
    if (shouldExclude) continue;

    const entryData: TreeEntry = {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    if (entry.isDirectory()) {
      const subPath = path.join(currentPath, entry.name);
      entryData.children = await buildTreeForTesting(subPath, rootPath, excludePatterns, includeHidden);
    }

    result.push(entryData);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('buildTree — hidden file filtering (directory_tree handler, Issue #2219)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hidden-tree-test-'));

    await fs.writeFile(path.join(testDir, 'visible.txt'), 'hello');
    await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'src', 'app.ts'), 'export {}');
    await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    await fs.mkdir(path.join(testDir, '.terraform'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.terraform', 'config.json'), '{}');
    await fs.writeFile(path.join(testDir, '.env'), 'SECRET=value');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('excludes dot-prefixed entries at root level by default (includeHidden=false)', async () => {
    const tree = await buildTreeForTesting(testDir, testDir);
    const names = tree.map(e => e.name);

    expect(names).toContain('visible.txt');
    expect(names).toContain('src');
    expect(names).not.toContain('.git');
    expect(names).not.toContain('.terraform');
    expect(names).not.toContain('.env');
  });

  it('does not recurse into hidden directories when includeHidden is false', async () => {
    const tree = await buildTreeForTesting(testDir, testDir, [], false);
    const allNames = (function flatten(entries: TreeEntry[]): string[] {
      return entries.flatMap(e => [e.name, ...(e.children ? flatten(e.children) : [])]);
    })(tree);

    expect(allNames).not.toContain('.git');
    expect(allNames).not.toContain('HEAD');          // nested inside .git
    expect(allNames).not.toContain('config.json');   // nested inside .terraform
  });

  it('includes hidden entries and their children when includeHidden is true', async () => {
    const tree = await buildTreeForTesting(testDir, testDir, [], true);
    const names = tree.map(e => e.name);

    expect(names).toContain('.git');
    expect(names).toContain('.terraform');
    expect(names).toContain('.env');

    const gitEntry = tree.find(e => e.name === '.git');
    expect(gitEntry?.children?.map(c => c.name)).toContain('HEAD');
  });

  it('excludePatterns and includeHidden work independently of each other', async () => {
    // With includeHidden=true, src should still be excluded by pattern
    const tree = await buildTreeForTesting(testDir, testDir, ['src'], true);
    const names = tree.map(e => e.name);

    expect(names).not.toContain('src');   // excluded by pattern
    expect(names).toContain('.git');      // hidden but allowed by includeHidden
  });
});
