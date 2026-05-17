import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const SERVER_PATH = path.join(__dirname, '..', 'dist', 'index.js');

/**
 * Spawns the filesystem server with given arguments and returns exit info
 */
async function spawnServer(args: string[], timeoutMs = 2000): Promise<{ exitCode: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [SERVER_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: code, stderr });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ exitCode: 1, stderr: err.message });
    });
  });
}

describe('Startup Directory Validation', () => {
  let testDir: string;
  let accessibleDir: string;
  let accessibleDir2: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-startup-test-'));
    accessibleDir = path.join(testDir, 'accessible');
    accessibleDir2 = path.join(testDir, 'accessible2');
    await fs.mkdir(accessibleDir, { recursive: true });
    await fs.mkdir(accessibleDir2, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should start successfully with all accessible directories', async () => {
    const result = await spawnServer([accessibleDir, accessibleDir2]);
    // Server starts and runs (we kill it after timeout, so exit code is null or from SIGTERM)
    expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
    expect(result.stderr).not.toContain('Error:');
  });

  it('should skip inaccessible directory and continue with accessible one', async () => {
    const nonExistentDir = path.join(testDir, 'non-existent-dir-12345');

    const result = await spawnServer([nonExistentDir, accessibleDir]);

    // Should warn about inaccessible directory
    expect(result.stderr).toContain('Warning: Cannot access directory');
    expect(result.stderr).toContain(nonExistentDir);

    // Should still start successfully
    expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
  });

  it('should exit with error when ALL directories are inaccessible', async () => {
    const nonExistent1 = path.join(testDir, 'non-existent-1');
    const nonExistent2 = path.join(testDir, 'non-existent-2');

    const result = await spawnServer([nonExistent1, nonExistent2]);

    // Should exit with error
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: None of the specified directories are accessible');
  });

  it('should warn when path is not a directory', async () => {
    const filePath = path.join(testDir, 'not-a-directory.txt');
    await fs.writeFile(filePath, 'content');

    const result = await spawnServer([filePath, accessibleDir]);

    // Should warn about non-directory
    expect(result.stderr).toContain('Warning:');
    expect(result.stderr).toContain('not a directory');

    // Should still start with the valid directory
    expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
  });

  // Regression coverage for #4152 — warnings about inaccessible startup
  // directories must include the underlying error reason so hosts can
  // surface an actionable diagnostic to end users (the original report
  // saw a silent transport close because nothing identified the bad path
  // beyond a generic "Cannot access directory" line).
  it('should include the underlying error reason in the per-directory warning (#4152)', async () => {
    const nonExistentDir = path.join(testDir, 'non-existent-dir-with-reason');

    const result = await spawnServer([nonExistentDir, accessibleDir]);

    // Should still skip + continue with the valid directory.
    expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
    // Diagnostic must name the directory AND the OS-level error reason.
    expect(result.stderr).toContain(nonExistentDir);
    expect(result.stderr).toMatch(/ENOENT|no such file or directory/i);
  });

  // Regression coverage for #4152 — permission-denied (EACCES) directories
  // must surface the OS reason in the warning the same way ENOENT does. The
  // original report only mentioned non-existent dirs, but the underlying
  // try/catch handles every fs.stat failure and hosts on Windows / locked
  // mounts hit EACCES just as often. Skipped on POSIX root (no chmod 0o000
  // restriction) and on Windows (chmod has no effect on directory access).
  const skipChmodEacces = process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0);
  (skipChmodEacces ? it.skip : it)('should include EACCES reason for permission-denied directory (#4152)', async () => {
    const lockedDir = path.join(testDir, 'locked-dir');
    await fs.mkdir(lockedDir);
    // Drop *all* perms on the parent so fs.stat on a child path returns EACCES.
    const parent = path.join(testDir, 'no-traverse');
    await fs.mkdir(parent);
    const child = path.join(parent, 'inner');
    await fs.mkdir(child);
    await fs.chmod(parent, 0o000);

    try {
      const result = await spawnServer([child, accessibleDir]);
      // Should still continue with the accessible one.
      expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
      expect(result.stderr).toContain(child);
      expect(result.stderr).toMatch(/EACCES|permission denied/i);
    } finally {
      // Restore perms so afterEach() can remove the tree.
      await fs.chmod(parent, 0o700).catch(() => {});
    }
  });

  // Regression coverage for #4152 — when ALL startup directories fail, the
  // aggregate exit error must enumerate each offending path AFTER the
  // "Error:" marker (not only as scattered per-directory warnings) so a
  // host capturing only the final fatal line can show users every entry of
  // allowed_directories that needs fixing.
  it('should list every offending directory inside the aggregate startup error (#4152)', async () => {
    const bad1 = path.join(testDir, 'aggregate-fail-1');
    const bad2 = path.join(testDir, 'aggregate-fail-2');

    const result = await spawnServer([bad1, bad2]);

    expect(result.exitCode).toBe(1);

    // Slice from the "Error:" marker to end-of-stderr — the aggregate
    // message itself must contain both paths, not only the per-directory
    // warnings that precede it.
    const errIdx = result.stderr.indexOf('Error:');
    expect(errIdx, 'aggregate Error: line missing').toBeGreaterThanOrEqual(0);
    const aggregate = result.stderr.slice(errIdx);
    expect(aggregate).toContain(bad1);
    expect(aggregate).toContain(bad2);
  });
});
