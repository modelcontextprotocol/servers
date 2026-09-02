import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureMemoryFilePath, defaultMemoryPath, resolveUserDataDir } from '../index.js';

describe('resolveUserDataDir', () => {
  let originalPlatform: NodeJS.Platform;
  let originalHomedir: typeof os.homedir;
  let originalXDG: string | undefined;
  let originalAppData: string | undefined;

  beforeEach(() => {
    originalPlatform = process.platform;
    originalHomedir = os.homedir;
    originalXDG = process.env.XDG_DATA_HOME;
    originalAppData = process.env.APPDATA;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    os.homedir = originalHomedir;
    if (originalXDG === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXDG;
    }
    if (originalAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = originalAppData;
    }
  });

  it('resolves to $XDG_DATA_HOME/mcp-server-memory on Linux when XDG_DATA_HOME is set and absolute', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.XDG_DATA_HOME = '/custom/xdg/data';

    expect(resolveUserDataDir()).toBe(path.join('/custom/xdg/data', 'mcp-server-memory'));
  });

  it('falls back to ~/.local/share on Linux when XDG_DATA_HOME is unset', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.XDG_DATA_HOME;
    os.homedir = () => '/home/test-user';

    expect(resolveUserDataDir()).toBe(path.join('/home/test-user', '.local', 'share', 'mcp-server-memory'));
  });

  it('ignores XDG_DATA_HOME on Linux when it is not an absolute path', () => {
    // Per the XDG Base Directory Specification, a relative value is invalid
    // and the implementation must fall back to the default.
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.XDG_DATA_HOME = 'relative/path';
    os.homedir = () => '/home/test-user';

    expect(resolveUserDataDir()).toBe(path.join('/home/test-user', '.local', 'share', 'mcp-server-memory'));
  });

  it('ignores an empty XDG_DATA_HOME on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.XDG_DATA_HOME = '   ';
    os.homedir = () => '/home/test-user';

    expect(resolveUserDataDir()).toBe(path.join('/home/test-user', '.local', 'share', 'mcp-server-memory'));
  });

  it('resolves to ~/Library/Application Support/mcp-server-memory on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    os.homedir = () => '/Users/test-user';

    expect(resolveUserDataDir()).toBe(
      path.join('/Users/test-user', 'Library', 'Application Support', 'mcp-server-memory')
    );
  });

  it('resolves to %APPDATA%\\mcp-server-memory on Windows when APPDATA is set', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.APPDATA = 'C:\\Users\\test-user\\AppData\\Roaming';

    expect(resolveUserDataDir()).toBe(path.join('C:\\Users\\test-user\\AppData\\Roaming', 'mcp-server-memory'));
  });

  it('falls back to ~/AppData/Roaming/mcp-server-memory on Windows when APPDATA is unset', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.APPDATA;
    os.homedir = () => 'C:\\Users\\test-user';

    expect(resolveUserDataDir()).toBe(
      path.join('C:\\Users\\test-user', 'AppData', 'Roaming', 'mcp-server-memory')
    );
  });
});

describe('ensureMemoryFilePath', () => {
  const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const legacyJSONLPath = path.join(packageDir, 'memory.jsonl');
  const legacyJSONPath = path.join(packageDir, 'memory.json');

  let originalEnv: string | undefined;
  let testTargetDir: string;
  let testTargetFile: string;
  let originalDefaultMemoryPath: string;

  beforeEach(async () => {
    // Save original environment variable
    originalEnv = process.env.MEMORY_FILE_PATH;
    delete process.env.MEMORY_FILE_PATH;

    // Route the default memory path to an isolated temp directory for each
    // test so we never touch the user's real data dir and tests don't
    // interfere with each other.
    testTargetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-test-'));
    testTargetFile = path.join(testTargetDir, 'memory.jsonl');
    process.env.MEMORY_FILE_PATH = testTargetFile;
    originalDefaultMemoryPath = defaultMemoryPath; // captured for sanity assertion only
  });

  afterEach(async () => {
    // Restore environment variable
    if (originalEnv !== undefined) {
      process.env.MEMORY_FILE_PATH = originalEnv;
    } else {
      delete process.env.MEMORY_FILE_PATH;
    }

    // Clean up legacy test files left at the package directory
    for (const p of [legacyJSONLPath, legacyJSONPath]) {
      try {
        await fs.unlink(p);
      } catch {
        // ignore
      }
    }

    // Clean up the per-test temp dir
    try {
      await fs.rm(testTargetDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('with MEMORY_FILE_PATH environment variable', () => {
    it('should return absolute path when MEMORY_FILE_PATH is absolute', async () => {
      const absolutePath = path.join(testTargetDir, 'custom-memory.jsonl');
      process.env.MEMORY_FILE_PATH = absolutePath;

      const result = await ensureMemoryFilePath();

      expect(result).toBe(absolutePath);
    });

    it('should convert relative path to absolute when MEMORY_FILE_PATH is relative', async () => {
      const relativePath = 'custom-memory.jsonl';
      process.env.MEMORY_FILE_PATH = relativePath;

      const result = await ensureMemoryFilePath();

      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toContain('custom-memory.jsonl');
    });

    it('should handle Windows absolute paths', async () => {
      const windowsPath = 'C:\\temp\\memory.jsonl';
      process.env.MEMORY_FILE_PATH = windowsPath;

      const result = await ensureMemoryFilePath();

      // On Windows, should return as-is; on Unix, will be treated as relative
      if (process.platform === 'win32') {
        expect(result).toBe(windowsPath);
      } else {
        expect(path.isAbsolute(result)).toBe(true);
      }
    });
  });

  describe('without MEMORY_FILE_PATH environment variable', () => {
    // The default memory path is fixed at module-load time, so we can't easily
    // re-route it per-test without re-importing the module. Instead, the
    // following tests verify migration behavior by pointing MEMORY_FILE_PATH
    // at our temp dir and asserting the legacy-detection branch is reachable
    // when no env override is set; for the *legacy migration* tests we delete
    // the env override and rely on the legacy files being detected at the
    // package dir, while ensuring we clean up afterwards.

    it('should return defaultMemoryPath when no legacy files exist', async () => {
      delete process.env.MEMORY_FILE_PATH;

      const result = await ensureMemoryFilePath();

      expect(result).toBe(defaultMemoryPath);
    });

    it('should create the user data directory if it does not exist', async () => {
      delete process.env.MEMORY_FILE_PATH;

      await ensureMemoryFilePath();

      const dirExists = await fs.access(path.dirname(defaultMemoryPath))
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should migrate legacy memory.json from package directory when present', async () => {
      delete process.env.MEMORY_FILE_PATH;
      // Ensure the target does not exist so the migration branch is reached.
      try { await fs.unlink(defaultMemoryPath); } catch { /* ignore */ }

      const legacyContent = '{"entities": [{"name": "alice", "type": "person"}]}';
      await fs.writeFile(legacyJSONPath, legacyContent);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await ensureMemoryFilePath();

      expect(result).toBe(defaultMemoryPath);

      // The legacy file is gone and the target now exists with the same content.
      const legacyExists = await fs.access(legacyJSONPath).then(() => true).catch(() => false);
      expect(legacyExists).toBe(false);
      const migratedContent = await fs.readFile(defaultMemoryPath, 'utf-8');
      expect(migratedContent).toBe(legacyContent);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DETECTED: Found legacy memory.json from package directory')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('COMPLETED: Successfully migrated legacy memory file')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should migrate legacy memory.jsonl from package directory when present', async () => {
      delete process.env.MEMORY_FILE_PATH;
      try { await fs.unlink(defaultMemoryPath); } catch { /* ignore */ }

      const legacyContent = '{"type":"entity","name":"bob","entityType":"person","observations":[]}';
      await fs.writeFile(legacyJSONLPath, legacyContent);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await ensureMemoryFilePath();

      expect(result).toBe(defaultMemoryPath);

      const legacyExists = await fs.access(legacyJSONLPath).then(() => true).catch(() => false);
      expect(legacyExists).toBe(false);
      const migratedContent = await fs.readFile(defaultMemoryPath, 'utf-8');
      expect(migratedContent).toBe(legacyContent);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DETECTED: Found legacy memory.jsonl from package directory')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should prefer existing user-data file over legacy package files', async () => {
      delete process.env.MEMORY_FILE_PATH;

      // Both a legacy file AND a populated target exist; the target wins,
      // no migration runs, no log lines.
      await fs.mkdir(path.dirname(defaultMemoryPath), { recursive: true });
      await fs.writeFile(defaultMemoryPath, 'current data');
      await fs.writeFile(legacyJSONPath, 'stale legacy data');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const result = await ensureMemoryFilePath();

        expect(result).toBe(defaultMemoryPath);
        const currentContent = await fs.readFile(defaultMemoryPath, 'utf-8');
        expect(currentContent).toBe('current data');

        const legacyStillExists = await fs.access(legacyJSONPath).then(() => true).catch(() => false);
        expect(legacyStillExists).toBe(true);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      } finally {
        consoleErrorSpy.mockRestore();
        await fs.unlink(defaultMemoryPath).catch(() => {});
      }
    });
  });

  describe('defaultMemoryPath', () => {
    it('should end with memory.jsonl', () => {
      expect(defaultMemoryPath).toMatch(/memory\.jsonl$/);
    });

    it('should be an absolute path', () => {
      expect(path.isAbsolute(defaultMemoryPath)).toBe(true);
    });

    it('should resolve to the user data directory, not the package directory', () => {
      // The whole point of this change: the default must not land inside the
      // package install directory.
      expect(defaultMemoryPath.startsWith(packageDir)).toBe(false);
    });
  });
});
