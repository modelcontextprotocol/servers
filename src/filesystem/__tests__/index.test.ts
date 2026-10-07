import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { createReadStream } from 'fs';

// Shared state between the module mocks and the tests
const mocks = vi.hoisted(() => ({
  registeredTools: [] as Array<{
    name: string;
    config: {
      description?: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    };
    handler: (args: any) => Promise<any>;
  }>,
  notificationHandler: null as null | ((...args: any[]) => Promise<any>),
  serverInstance: { current: null as any },
  fsPromisesMock: {} as Record<string, any>,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class FakeMcpServer {
    server = {
      // Captured so tests can drive the roots notification flow
      setNotificationHandler: (_schema: unknown, handler: (...args: any[]) => Promise<any>) => {
        mocks.notificationHandler = handler;
      },
      oninitialized: undefined as unknown as () => void | Promise<void>,
      listRoots: vi.fn(async () => ({ roots: [] })),
      getClientCapabilities: vi.fn(() => undefined),
    };

    constructor(_info: { name: string; version: string }) {
      mocks.serverInstance.current = this;
    }

    registerTool(
      name: string,
      config: any,
      handler: (args: any) => Promise<any>
    ) {
      mocks.registeredTools.push({ name, config, handler });
    }

    async connect() {}
  }
  return { McpServer: FakeMcpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));

// Consumers across lib.ts / index.ts / roots-utils.ts use different import
// shapes ('default', named 'promises'); route them all at one shared object.
vi.mock('fs/promises', () => ({
  default: mocks.fsPromisesMock,
  promises: mocks.fsPromisesMock,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    // roots-utils.ts consumes fs.promises; share the fs/promises mock so
    // roots flows stay deterministic
    promises: mocks.fsPromisesMock,
    createReadStream: vi.fn(),
  };
});

const mockFs = fs as any;
const mockCreateReadStream = vi.mocked(createReadStream);

import { setAllowedDirectories } from '../lib.js';

// index.ts scans process.argv.slice(2) at import to build its allowed
// directories; pin argv so vitest's own CLI arguments are not ingested.
const realArgv = [...process.argv];
process.argv = [process.argv[0], 'mcp-server-filesystem'];

function ensureFsMocks() {
  for (const method of ['realpath', 'stat', 'readFile', 'writeFile', 'mkdir', 'readdir', 'rename', 'unlink', 'open']) {
    mocks.fsPromisesMock[method] ??= vi.fn();
  }
}

ensureFsMocks();
mocks.fsPromisesMock.realpath.mockImplementation(async (p: any) => p.toString());
mocks.fsPromisesMock.stat.mockResolvedValue({ isDirectory: () => true });

// Runs runServer() and registers every tool; safe now that stdio + argv are stubbed
await import('../index.js');

process.argv = realArgv;

function getTool(name: string) {
  const tool = mocks.registeredTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function makeStream(chunks: Buffer[], error?: Error) {
  const stream = new EventEmitter();
  process.nextTick(() => {
    if (error) {
      stream.emit('error', error);
      return;
    }
    for (const chunk of chunks) stream.emit('data', chunk);
    stream.emit('end');
  });
  return stream;
}

// Platform-aware fixture roots following lib.test.ts conventions
const allowedDirs =
  process.platform === 'win32' ? ['C:\\Users\\test', 'C:\\temp'] : ['/home/user', '/tmp'];

beforeEach(() => {
  vi.clearAllMocks();
  ensureFsMocks();
  mocks.fsPromisesMock.realpath.mockImplementation(async (p: any) => p.toString());
  mocks.fsPromisesMock.unlink.mockResolvedValue(undefined);
  setAllowedDirectories(allowedDirs);
});

afterEach(() => {
  vi.restoreAllMocks();
  setAllowedDirectories([]);
});

describe('Filesystem Server Registration', () => {
  it('registers every filesystem tool exactly once', () => {
    const names = mocks.registeredTools.map((t) => t.name);
    const expected = [
      'read_file',
      'read_text_file',
      'read_media_file',
      'read_multiple_files',
      'write_file',
      'edit_file',
      'create_directory',
      'list_directory',
      'list_directory_with_sizes',
      'directory_tree',
      'move_file',
      'search_files',
      'get_file_info',
      'list_allowed_directories'
    ];
    for (const name of expected) {
      expect(names.filter((n) => n === name)).toHaveLength(1);
    }
  });

  it('gives every tool a non-empty description and an input schema', () => {
    for (const tool of mocks.registeredTools) {
      expect(tool.config.description?.length ?? 0).toBeGreaterThan(10);
      expect(tool.config.inputSchema).toBeDefined();
    }
  });

  it('marks read-only tools and destructive tools appropriately', () => {
    expect(getTool('read_text_file').config.annotations).toMatchObject({ readOnlyHint: true });
    expect(getTool('read_media_file').config.annotations).toMatchObject({ readOnlyHint: true });
    expect(getTool('write_file').config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true
    });
    expect(getTool('move_file').config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true
    });
    expect(getTool('create_directory').config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true
    });
  });

  it('connects the server to a stdio transport at startup', () => {
    expect(mocks.registeredTools.length).toBeGreaterThan(0);
  });
});

describe('Filesystem Tool Handlers', () => {
  describe('read_text_file / read_file', () => {
    it.each(['read_file', 'read_text_file'])('%s returns full contents by default', async (name) => {
      mockFs.readFile.mockResolvedValue('file body');
      const result = await getTool(name).handler({ path: '/home/user/file.txt' });
      expect(result.content[0].text).toBe('file body');
      expect(result.structuredContent).toEqual({ content: 'file body' });
      expect(mockFs.readFile).toHaveBeenCalledWith('/home/user/file.txt', 'utf-8');
    });

    it('returns only the tail lines when tail is provided', async () => {
      const fileBody = Buffer.from('line1\nline2\nline3');
      mockFs.stat.mockResolvedValue({ size: fileBody.length });
      mockFs.open.mockResolvedValue({
        read: async (chunk: any, _offset: number, length: number, position: number) => {
          chunk.write(fileBody.toString('utf-8'), 0, length, 'utf-8');
          return { bytesRead: length };
        },
        close: async () => {}
      });
      const result = await getTool('read_text_file').handler({ path: '/home/user/file.txt', tail: 2 });
      expect(result.content[0].text).toBe('line2\nline3');
      expect(mockFs.open).toHaveBeenCalledWith('/home/user/file.txt', 'r');
    });

    it('returns only the head lines when head is provided', async () => {
      const fileBody = Buffer.from('line1\nline2\nline3');
      mockFs.open.mockResolvedValue({
        read: async (chunk: any, _offset: number, length: number) => {
          chunk.write(fileBody.toString('utf-8'), 0, length, 'utf-8');
          return { bytesRead: length };
        },
        close: async () => {}
      });
      const result = await getTool('read_text_file').handler({ path: '/home/user/file.txt', head: 2 });
      expect(result.content[0].text).toBe('line1\nline2');
    });

    it('throws when both head and tail are requested', async () => {
      await expect(
        getTool('read_text_file').handler({ path: '/home/user/file.txt', head: 5, tail: 5 })
      ).rejects.toThrow('Cannot specify both head and tail parameters simultaneously');
    });
  });

  describe('read_media_file', () => {
    it('returns image content for image extensions', async () => {
      mockCreateReadStream.mockReturnValue(makeStream([Buffer.from('abc')]) as any);
      const result = await getTool('read_media_file').handler({ path: '/home/user/pic.png' });
      expect(result.content[0]).toEqual({
        type: 'image',
        data: Buffer.from('abc').toString('base64'),
        mimeType: 'image/png'
      });
      expect(result.structuredContent.content).toEqual(result.content);
    });

    it('returns audio content for audio extensions', async () => {
      mockCreateReadStream.mockReturnValue(makeStream([Buffer.from('ogg-data')]) as any);
      const result = await getTool('read_media_file').handler({ path: '/home/user/sound.OGG' });
      expect(result.content[0]).toMatchObject({ type: 'audio', mimeType: 'audio/ogg' });
    });

    it('falls back to an embedded resource for other binaries', async () => {
      mockCreateReadStream.mockReturnValue(makeStream([Buffer.from('pdf-bytes')]) as any);
      const result = await getTool('read_media_file').handler({ path: '/home/user/doc.pdf' });
      expect(result.content[0].type).toBe('resource');
      expect(result.content[0].resource.blob).toBe(Buffer.from('pdf-bytes').toString('base64'));
      expect(result.content[0].resource.mimeType).toBe('application/octet-stream');
    });

    it('propagates stream read errors', async () => {
      mockCreateReadStream.mockReturnValue(makeStream([], new Error('EIO: stream failure')) as any);
      await expect(getTool('read_media_file').handler({ path: '/home/user/pic.png' }))
        .rejects.toThrow('EIO: stream failure');
    });
  });

  describe('read_multiple_files', () => {
    it('joins successful reads and embeds individual failures', async () => {
      mockFs.readFile.mockImplementation(async (filePath: any) => {
        if (String(filePath).includes('missing')) {
          throw new Error('ENOENT: no such file');
        }
        if (String(filePath).includes('strangefail')) {
          // Non-Error rejection values take the String(error) branch
          throw 'plain-string-failure';
        }
        return `contents of ${filePath}`;
      });
      const result = await getTool('read_multiple_files').handler({
        paths: ['/home/user/a.txt', '/home/user/missing.txt', '/home/user/strangefail.txt']
      });
      expect(result.content[0].text).toContain('/home/user/a.txt:\ncontents of /home/user/a.txt');
      expect(result.content[0].text).toContain('/home/user/missing.txt: Error - ENOENT: no such file');
      expect(result.content[0].text).toContain('/home/user/strangefail.txt: Error - plain-string-failure');
      expect(result.content[0].text).toContain('\n---\n');
    });
  });

  describe('write_file', () => {
    it('writes content and reports success', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      const result = await getTool('write_file').handler({
        path: '/home/user/out.txt',
        content: 'hello world'
      });
      expect(result.content[0].text).toBe('Successfully wrote to /home/user/out.txt');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/home/user/out.txt',
        'hello world',
        { encoding: 'utf-8', flag: 'wx' }
      );
    });

    it('surfaces write failures', async () => {
      mockFs.writeFile.mockRejectedValue(Object.assign(new Error('disk full'), { code: 'ENOSPC' }));
      await expect(
        getTool('write_file').handler({ path: '/home/user/out.txt', content: 'x' })
      ).rejects.toThrow('disk full');
    });
  });

  describe('edit_file', () => {
    const edits = [{ oldText: 'World', newText: 'MCP' }];

    it('applies edits and writes the result when not a dry run', async () => {
      mockFs.readFile.mockResolvedValue('Hello World\n');
      mockFs.writeFile.mockResolvedValue(undefined);
      const result = await getTool('edit_file').handler({
        path: '/home/user/hello.txt',
        edits,
        dryRun: false
      });
      expect(result.structuredContent.content).toContain('modified');
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    });

    it('skips writing on dry runs', async () => {
      mockFs.readFile.mockResolvedValue('Hello World\n');
      const result = await getTool('edit_file').handler({
        path: '/home/user/hello.txt',
        edits,
        dryRun: true
      });
      expect(result.structuredContent.content).toContain('original');
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('create_directory', () => {
    it('creates directories recursively and reports success', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      const result = await getTool('create_directory').handler({ path: '/home/user/a/b/c' });
      expect(result.content[0].text).toBe('Successfully created directory /home/user/a/b/c');
      expect(mockFs.mkdir).toHaveBeenCalledWith('/home/user/a/b/c', { recursive: true });
    });
  });

  describe('list_directory', () => {
    it('formats entries with DIR and FILE prefixes', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'sub', isDirectory: () => true },
        { name: 'a.txt', isDirectory: () => false }
      ]);
      const result = await getTool('list_directory').handler({ path: '/home/user' });
      expect(result.content[0].text).toBe('[DIR] sub\n[FILE] a.txt');
    });

    it('propagates readdir errors', async () => {
      mockFs.readdir.mockRejectedValue(new Error('EACCES: denied'));
      await expect(getTool('list_directory').handler({ path: '/home/user' }))
        .rejects.toThrow('EACCES: denied');
    });
  });

  describe('list_directory_with_sizes', () => {
    const entries = [
      { name: 'b.txt', isDirectory: () => false },
      { name: 'zdir', isDirectory: () => true },
      { name: 'a.txt', isDirectory: () => false }
    ];

    it('sorts by name by default and appends a summary', async () => {
      mockFs.readdir.mockResolvedValue(entries);
      mockFs.stat.mockImplementation(async (p: any) => {
        if (String(p).endsWith('a.txt')) return { size: 2048, isDirectory: () => false };
        if (String(p).endsWith('b.txt')) return { size: 512, isDirectory: () => false };
        return { size: 4096, isDirectory: () => true };
      });
      const result = await getTool('list_directory_with_sizes').handler({ path: '/home/user' });
      const text = result.content[0].text as string;
      expect(text.indexOf('[FILE] a.txt')).toBeLessThan(text.indexOf('[FILE] b.txt'));
      expect(text).toContain('[DIR] zdir');
      expect(text).toContain('Total: 2 files, 1 directories');
      expect(text).toContain('Combined size: 2.50 KB');
    });

    it('sorts descending by size when sortBy is size', async () => {
      mockFs.readdir.mockResolvedValue(entries);
      mockFs.stat.mockImplementation(async (p: any) => {
        if (String(p).endsWith('a.txt')) return { size: 10, isDirectory: () => false };
        if (String(p).endsWith('b.txt')) return { size: 9999, isDirectory: () => false };
        return { size: 5, isDirectory: () => true };
      });
      const result = await getTool('list_directory_with_sizes').handler({
        path: '/home/user',
        sortBy: 'size'
      });
      const text = result.content[0].text as string;
      expect(text.indexOf('[FILE] b.txt')).toBeLessThan(text.indexOf('[FILE] a.txt'));
    });

    it('falls back to zero size when stat fails for an entry', async () => {
      mockFs.readdir.mockResolvedValue([{ name: 'ghost.txt', isDirectory: () => false }]);
      mockFs.stat.mockRejectedValue(new Error(' vanished'));
      const result = await getTool('list_directory_with_sizes').handler({ path: '/home/user' });
      expect(result.content[0].text).toContain('[FILE] ghost.txt');
      expect(result.content[0].text).toContain('Total: 1 files, 0 directories');
    });
  });

  describe('directory_tree', () => {
    function dirent(name: string, isDir: boolean) {
      return { name, isDirectory: () => isDir };
    }

    it('builds a nested JSON tree', async () => {
      mockFs.readdir.mockImplementation(async (p: any) => {
        if (String(p).endsWith('/home/user')) {
          return [dirent('src', true), dirent('README.md', false)];
        }
        return [dirent('main.ts', false)];
      });
      const result = await getTool('directory_tree').handler({ path: '/home/user' });
      const tree = JSON.parse(result.content[0].text);
      expect(tree).toEqual([
        {
          name: 'src',
          type: 'directory',
          children: [{ name: 'main.ts', type: 'file' }]
        },
        { name: 'README.md', type: 'file' }
      ]);
    });

    it('excludes entries matching glob patterns', async () => {
      mockFs.readdir.mockImplementation(async (p: any) => {
        if (String(p).endsWith('/home/user')) {
          return [dirent('debug.log', false), dirent('keep.txt', false)];
        }
        return [];
      });
      const result = await getTool('directory_tree').handler({
        path: '/home/user',
        excludePatterns: ['*.log']
      });
      const tree = JSON.parse(result.content[0].text);
      expect(tree).toEqual([{ name: 'keep.txt', type: 'file' }]);
    });

    it('excludes directories by plain name across the tree', async () => {
      mockFs.readdir.mockImplementation(async (p: any) => {
        if (String(p).endsWith('/home/user')) {
          return [dirent('node_modules', true), dirent('app', true)];
        }
        if (String(p).includes('app')) {
          return [dirent('index.js', false)];
        }
        return [];
      });
      const result = await getTool('directory_tree').handler({
        path: '/home/user',
        excludePatterns: ['node_modules']
      });
      const tree = JSON.parse(result.content[0].text);
      expect(tree.map((e: any) => e.name)).toEqual(['app']);
    });
  });

  describe('move_file', () => {
    it('renames and reports both endpoints', async () => {
      mockFs.rename.mockResolvedValue(undefined);
      const result = await getTool('move_file').handler({
        source: '/home/user/from.txt',
        destination: '/tmp/to.txt'
      });
      expect(result.content[0].text).toBe('Successfully moved /home/user/from.txt to /tmp/to.txt');
      expect(mockFs.rename).toHaveBeenCalledWith('/home/user/from.txt', '/tmp/to.txt');
    });

    it('propagates rename failures', async () => {
      mockFs.rename.mockRejectedValue(new Error('EBUSY: resource busy'));
      await expect(
        getTool('move_file').handler({ source: '/home/user/a', destination: '/tmp/b' })
      ).rejects.toThrow('EBUSY: resource busy');
    });
  });

  describe('search_files', () => {
    it('returns matching paths recursively', async () => {
      mockFs.readdir.mockImplementation(async (p: any) => {
        if (String(p) === '/home/user') {
          return [
            { name: 'match1.txt', isDirectory: () => false },
            { name: 'src', isDirectory: () => true }
          ];
        }
        return [{ name: 'match2.txt', isDirectory: () => false }];
      });
      const result = await getTool('search_files').handler({
        path: '/home/user',
        pattern: '**/*.txt'
      });
      const lines = result.content[0].text.split('\n');
      expect(lines).toContain('/home/user/match1.txt');
      expect(lines).toContain(path.join('/home/user', 'src', 'match2.txt'));
    });

    it('honors exclude patterns', async () => {
      mockFs.readdir.mockImplementation(async (p: any) => {
        if (String(p) === '/home/user') {
          return [
            { name: 'keep.txt', isDirectory: () => false },
            { name: 'vendor', isDirectory: () => true }
          ];
        }
        return [{ name: 'drop.txt', isDirectory: () => false }];
      });
      const result = await getTool('search_files').handler({
        path: '/home/user',
        pattern: '**/*.txt',
        excludePatterns: ['vendor/**']
      });
      expect(result.content[0].text).toBe('/home/user/keep.txt');
    });

    it('reports no matches found', async () => {
      mockFs.readdir.mockResolvedValue([]);
      const result = await getTool('search_files').handler({
        path: '/home/user',
        pattern: '**/*.xyz'
      });
      expect(result.content[0].text).toBe('No matches found');
    });
  });

  describe('get_file_info', () => {
    it('formats stats as key value lines', async () => {
      const birth = new Date('2026-01-01T00:00:00Z');
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: birth,
        mtime: birth,
        atime: birth,
        isDirectory: () => false,
        isFile: () => true,
        mode: 0o644
      });
      const result = await getTool('get_file_info').handler({ path: '/home/user/file.txt' });
      const text = result.content[0].text as string;
      expect(text).toContain('size: 1024');
      expect(text).toContain('isDirectory: false');
      expect(text).toContain('isFile: true');
      expect(text).toContain('permissions: 644');
      expect(text).toContain(String(birth));
    });
  });

  describe('list_allowed_directories', () => {
    it('lists the configured directories', async () => {
      const result = await getTool('list_allowed_directories').handler({});
      // Reads the module-level array, which is empty until a roots update
      expect(result.content[0].text).toBe('Allowed directories:\n');
    });
  });
});

describe('Filesystem Server Roots Integration', () => {
  // These tests mutate the module-level allowed directories, so they run last.

  it('rejects startup-style initialization when client has no roots capability and no directories were configured', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.getClientCapabilities.mockReturnValue(undefined);
    setAllowedDirectories([]);
    await expect(serverStub.oninitialized()).rejects.toThrow('Server cannot operate');
  });

  it('fetches roots on initialization when the client supports them', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.getClientCapabilities.mockReturnValue({ roots: {} });
    serverStub.listRoots.mockResolvedValue({ roots: [{ uri: 'file:///home/user/project' }] });
    mockFs.stat.mockResolvedValue({ isDirectory: () => true });

    await serverStub.oninitialized();

    const result = await getTool('list_allowed_directories').handler({});
    expect(result.content[0].text).toBe('Allowed directories:\n/home/user/project');
  });

  it('refreshes allowed directories when the client notifies roots changed', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.listRoots.mockResolvedValue({ roots: [{ uri: 'file:///tmp/newroot' }] });
    mockFs.stat.mockResolvedValue({ isDirectory: () => true });

    await mocks.notificationHandler!();

    const result = await getTool('list_allowed_directories').handler({});
    expect(result.content[0].text).toBe('Allowed directories:\n/tmp/newroot');
  });

  it('keeps current settings when the roots response has no roots field', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.listRoots.mockResolvedValue({});

    await mocks.notificationHandler!();

    const result = await getTool('list_allowed_directories').handler({});
    expect(result.content[0].text).toBe('Allowed directories:\n/tmp/newroot');
  });

  it('logs and continues when requesting roots fails', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.listRoots.mockRejectedValue(new Error('connection lost'));

    await mocks.notificationHandler!();

    const result = await getTool('list_allowed_directories').handler({});
    expect(result.content[0].text).toBe('Allowed directories:\n/tmp/newroot');
  });

  it('filters out invalid and non-directory roots', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.listRoots.mockResolvedValue({
      roots: [
        { uri: 'file:///home/user/vanished' }, // realpath fails -> skipped
        { uri: 'file:///tmp/plainfile' }, // not a directory -> skipped
        { uri: 'file:///home/user/valid' } // accepted
      ]
    });
    mockFs.realpath.mockImplementation(async (p: any) => {
      if (String(p).includes('vanished')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return p.toString();
    });
    mockFs.stat.mockImplementation(async (p: any) => ({
      isDirectory: () => !String(p).includes('plainfile')
    }));

    await mocks.notificationHandler!();

    const result = await getTool('list_allowed_directories').handler({});
    expect(result.content[0].text).toBe('Allowed directories:\n/home/user/valid');
  });

  it('keeps current directories when no root resolves to a valid directory', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.listRoots.mockResolvedValue({ roots: [{ uri: 'file:///home/user/gone' }] });
    mockFs.realpath.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await mocks.notificationHandler!();

    expect(errSpy).toHaveBeenCalledWith('No valid root directories provided by client');
    errSpy.mockRestore();
  });

  it('keeps current settings when initialized client returns no roots field', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.getClientCapabilities.mockReturnValue({ roots: {} });
    serverStub.listRoots.mockResolvedValue({});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await serverStub.oninitialized();

    expect(errSpy).toHaveBeenCalledWith('Client returned no roots set, keeping current settings');
    errSpy.mockRestore();
  });

  it.each([
    ['Error instance', new Error('roots request timed out'), 'roots request timed out'],
    ['non-Error value', 'kaboom', 'kaboom']
  ])('logs failures requesting roots (%s)', async (_label, rejection, fragment) => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.listRoots.mockRejectedValueOnce(rejection);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await mocks.notificationHandler!();

    expect(errSpy).toHaveBeenCalledWith(
      'Failed to request roots from client:',
      fragment
    );
    errSpy.mockRestore();
  });

  it('falls back to server args messaging when initialized client lacks roots capability', async () => {
    const serverStub = mocks.serverInstance.current.server;
    serverStub.getClientCapabilities.mockReturnValue(undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await serverStub.oninitialized();

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Client does not support MCP Roots'),
      expect.any(Array)
    );
    errSpy.mockRestore();
  });
});

describe('Filesystem Server Startup From Command Line Arguments', () => {
  // Re-evaluates index.ts with seeded argv; runs last because it duplicates
  // tool registrations in the capture array.

  afterEach(() => {
    process.argv = realArgv;
  });

  it('derives allowed directories from argv, resolving symlinks and skipping unusable entries', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFs.realpath.mockImplementation(async (p: any) => {
      if (String(p).endsWith('linked')) return '/private/home/user/linked';
      if (String(p).endsWith('gone')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return p.toString();
    });
    mockFs.stat.mockImplementation(async (p: any) => {
      if (String(p).includes('notadir') || String(p).includes('gone')) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }
      return { isDirectory: () => true };
    });

    process.argv = [process.argv[0], 'mcp-server-filesystem', '/home/user', '/private/home/user/linked', '/home/user/notadir', '/home/user/gone'];
    vi.resetModules();
    await import('../index.js');

    expect(exitSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot access directory'));
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('exits when every specified directory is inaccessible', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFs.realpath.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockFs.stat.mockRejectedValue(new Error('EACCES'));

    process.argv = [process.argv[0], 'mcp-server-filesystem', '/only/inaccessible'];
    vi.resetModules();
    await import('../index.js');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith('Error: None of the specified directories are accessible');
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('reports a fatal error and exits when the transport cannot connect', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const McpServerModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const proto = (McpServerModule.McpServer as unknown as { prototype: { connect: () => Promise<void> } }).prototype;
    const originalConnect = proto.connect;
    proto.connect = async () => {
      throw new Error('stdio unavailable');
    };

    try {
      vi.resetModules();
      await import('../index.js');
      // Allow runServer().catch(...) to settle
      await new Promise((resolve) => setImmediate(resolve));
      expect(errSpy).toHaveBeenCalledWith('Fatal error running server:', expect.any(Error));
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      proto.connect = originalConnect;
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
