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

  it('starts cleanly when a path with spaces arrives wrapped in literal quotes', async () => {
    // claude_desktop_config.json entries sometimes carry their own quote
    // characters around paths containing spaces (issue #447)
    const quoted = `"${accessibleDir}"`;

    const result = await spawnServer([quoted]);

    expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
    expect(result.stderr).not.toContain('Warning:');
  });

  it('accepts MSYS/Git-Bash style /c/ paths on Windows', async () => {
    if (process.platform !== 'win32') return;

    // C:\...\accessible -> /c/.../accessible
    const msysDir = `/${accessibleDir.charAt(0).toLowerCase()}${accessibleDir.slice(2).replace(/\\/g, '/')}`;

    const result = await spawnServer([msysDir]);

    expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
    expect(result.stderr).not.toContain('Warning:');
  });

  it('expands 8.3 short names at startup via native realpath resolution', async () => {
    if (process.platform !== 'win32') return;

    // Skip when 8.3 short-name generation is disabled on this volume
    try {
      await fs.stat('C:\\PROGRA~1');
    } catch {
      return;
    }

    const result = await spawnServer(['C:\\PROGRA~1']);

    // Startup must succeed without treating the short name as inaccessible
    expect(result.stderr).toContain('Secure MCP Filesystem Server running on stdio');
    expect(result.stderr).not.toContain('Warning: Cannot access directory');
  });
});
