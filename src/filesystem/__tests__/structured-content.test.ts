import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Integration tests to verify that tool handlers return structuredContent
 * that matches the declared outputSchema.
 *
 * These tests address issues #3110, #3106, #3093 where tools were returning
 * structuredContent: { content: [contentBlock] } (array) instead of
 * structuredContent: { content: string } as declared in outputSchema.
 *
 * Coverage: all 14 tools registered by the filesystem MCP server.
 */
describe('structuredContent schema compliance', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    // Create a temp directory for testing
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-test-'));

    // Create test files
    await fs.writeFile(path.join(testDir, 'test.txt'), 'test content');
    await fs.mkdir(path.join(testDir, 'subdir'));
    await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested content');

    // Start the MCP server
    const serverPath = path.resolve(__dirname, '../dist/index.js');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath, testDir],
    });

    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ── Tools with outputSchema { content: z.string() } ──────────────

  describe('read_text_file', () => {
    it('should return structuredContent.content as a string', async () => {
      const result = await client.callTool({
        name: 'read_text_file',
        arguments: { path: path.join(testDir, 'test.txt') }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('test content');
    });
  });

  describe('read_file (deprecated, back-compat)', () => {
    it('should return structuredContent.content as a string, matching read_text_file', async () => {
      const result = await client.callTool({
        name: 'read_file',
        arguments: { path: path.join(testDir, 'test.txt') }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('test content');
    });
  });

  describe('read_multiple_files', () => {
    it('should return structuredContent.content as a string containing both paths', async () => {
      const file1 = path.join(testDir, 'test.txt');
      const file2 = path.join(testDir, 'subdir', 'nested.txt');

      const result = await client.callTool({
        name: 'read_multiple_files',
        arguments: { paths: [file1, file2] }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('test.txt');
      expect(sc.content).toContain('nested.txt');
    });
  });

  describe('write_file', () => {
    it('should return structuredContent.content as a string and persist data', async () => {
      const targetPath = path.join(testDir, 'written.txt');

      const result = await client.callTool({
        name: 'write_file',
        arguments: { path: targetPath, content: 'hello world' }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('Successfully wrote');

      // Verify the file was actually written
      const onDisk = await fs.readFile(targetPath, 'utf-8');
      expect(onDisk).toBe('hello world');
    });
  });

  describe('edit_file', () => {
    it('should return structuredContent.content as a string with diff output', async () => {
      const filePath = path.join(testDir, 'editable.txt');
      await fs.writeFile(filePath, 'line one\nline two\nline three\n');

      const result = await client.callTool({
        name: 'edit_file',
        arguments: {
          path: filePath,
          edits: [{ oldText: 'line two', newText: 'LINE TWO REPLACED' }],
          dryRun: false
        }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);

      // Verify actual file was edited
      const onDisk = await fs.readFile(filePath, 'utf-8');
      expect(onDisk).toContain('LINE TWO REPLACED');
    });

    it('should return structuredContent.content as a string in dryRun mode without modifying the file', async () => {
      const filePath = path.join(testDir, 'dryrun.txt');
      await fs.writeFile(filePath, 'alpha\nbeta\ngamma\n');

      const result = await client.callTool({
        name: 'edit_file',
        arguments: {
          path: filePath,
          edits: [{ oldText: 'beta', newText: 'BETA' }],
          dryRun: true
        }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);

      // File should be unchanged after dry run
      const onDisk = await fs.readFile(filePath, 'utf-8');
      expect(onDisk).toContain('beta');
      expect(onDisk).not.toContain('BETA');
    });
  });

  describe('create_directory', () => {
    it('should return structuredContent.content as a string and create the directory', async () => {
      const dirPath = path.join(testDir, 'newdir');

      const result = await client.callTool({
        name: 'create_directory',
        arguments: { path: dirPath }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('Successfully created directory');

      // Verify the directory exists
      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should succeed idempotently when called twice on the same path', async () => {
      const dirPath = path.join(testDir, 'idem');

      await client.callTool({ name: 'create_directory', arguments: { path: dirPath } });
      const result = await client.callTool({ name: 'create_directory', arguments: { path: dirPath } });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
    });
  });

  describe('list_directory', () => {
    it('should return structuredContent.content as a string with [FILE] and [DIR] markers', async () => {
      const result = await client.callTool({
        name: 'list_directory',
        arguments: { path: testDir }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('[FILE]');
      expect(sc.content).toContain('[DIR]');
    });
  });

  describe('list_directory_with_sizes', () => {
    it('should return structuredContent.content as a string, not an array', async () => {
      const result = await client.callTool({
        name: 'list_directory_with_sizes',
        arguments: { path: testDir }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('[FILE]');
    });
  });

  describe('directory_tree', () => {
    it('should return structuredContent.content as a string, not an array', async () => {
      const result = await client.callTool({
        name: 'directory_tree',
        arguments: { path: testDir }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);

      // The content should be valid JSON representing the tree
      const treeData = JSON.parse(sc.content as string);
      expect(Array.isArray(treeData)).toBe(true);
    });
  });

  describe('move_file', () => {
    it('should return structuredContent.content as a string and move the file', async () => {
      const sourcePath = path.join(testDir, 'test.txt');
      const destPath = path.join(testDir, 'moved.txt');

      const result = await client.callTool({
        name: 'move_file',
        arguments: { source: sourcePath, destination: destPath }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('Successfully moved');

      // Verify source is gone and destination exists
      await expect(fs.access(sourcePath)).rejects.toThrow();
      const destContent = await fs.readFile(destPath, 'utf-8');
      expect(destContent).toBe('test content');
    });
  });

  describe('search_files', () => {
    it('should return structuredContent.content as a string with matching paths', async () => {
      const result = await client.callTool({
        name: 'search_files',
        arguments: { path: testDir, pattern: '*.txt' }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('test.txt');
    });
  });

  describe('get_file_info', () => {
    it('should return structuredContent.content as a string with metadata', async () => {
      const result = await client.callTool({
        name: 'get_file_info',
        arguments: { path: path.join(testDir, 'test.txt') }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('size');
    });
  });

  describe('list_allowed_directories', () => {
    it('should return structuredContent.content as a string listing the allowed directories', async () => {
      const result = await client.callTool({
        name: 'list_allowed_directories',
        arguments: {}
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };
      expect(typeof sc.content).toBe('string');
      expect(Array.isArray(sc.content)).toBe(false);
      expect(sc.content).toContain('Allowed directories');
    });
  });

  // ── Tool with outputSchema { content: z.array(...) } ─────────────

  describe('read_media_file', () => {
    it('should return structuredContent.content as an array matching its outputSchema', async () => {
      // Write a minimal valid PNG (1x1 pixel, transparent)
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
        0x44, 0xAE, 0x42, 0x60, 0x82,
      ]);
      const imgPath = path.join(testDir, 'pixel.png');
      await fs.writeFile(imgPath, pngHeader);

      const result = await client.callTool({
        name: 'read_media_file',
        arguments: { path: imgPath }
      });

      expect(result.structuredContent).toBeDefined();
      const sc = result.structuredContent as { content: unknown };

      // read_media_file's outputSchema declares content as an array of
      // { type, data, mimeType } objects — unlike every other tool which
      // declares content as a plain string.
      expect(Array.isArray(sc.content)).toBe(true);

      const items = sc.content as Array<{ type: string; data: string; mimeType: string }>;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].type).toBe('image');
      expect(items[0].mimeType).toBe('image/png');
      expect(typeof items[0].data).toBe('string'); // base64
      // TODO: see WRG case-study F-006 — envelope reconciliation pending in separate PR
      // (https://github.com/yakuphanycl/wrg-skills/blob/main/docs/case-studies/filesystem-mcp-2026-04-26.md#F-006)
    });
  });
});
