import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

/**
 * Integration tests to verify that tool handlers return structuredContent
 * that matches the declared outputSchema.
 *
 * These tests address issues #3110, #3106, #3093 where tools were returning
 * structuredContent: { content: [contentBlock] } (array) instead of
 * structuredContent: { content: string } as declared in outputSchema.
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

  describe('directory_tree', () => {
    it('should return structuredContent.content as a string, not an array', async () => {
      const result = await client.callTool({
        name: 'directory_tree',
        arguments: { path: testDir }
      });

      // The result should have structuredContent
      expect(result.structuredContent).toBeDefined();

      // structuredContent.content should be a string (matching outputSchema: { content: z.string() })
      const structuredContent = result.structuredContent as { content: unknown };
      expect(typeof structuredContent.content).toBe('string');

      // It should NOT be an array
      expect(Array.isArray(structuredContent.content)).toBe(false);

      // The content should be valid JSON representing the tree
      const treeData = JSON.parse(structuredContent.content as string);
      expect(Array.isArray(treeData)).toBe(true);
    });
  });

  describe('list_directory_with_sizes', () => {
    it('should return structuredContent.content as a string, not an array', async () => {
      const result = await client.callTool({
        name: 'list_directory_with_sizes',
        arguments: { path: testDir }
      });

      // The result should have structuredContent
      expect(result.structuredContent).toBeDefined();

      // structuredContent.content should be a string (matching outputSchema: { content: z.string() })
      const structuredContent = result.structuredContent as { content: unknown };
      expect(typeof structuredContent.content).toBe('string');

      // It should NOT be an array
      expect(Array.isArray(structuredContent.content)).toBe(false);

      // The content should contain directory listing info
      expect(structuredContent.content).toContain('[FILE]');
    });
  });

  describe('move_file', () => {
    it('should return structuredContent.content as a string, not an array', async () => {
      const sourcePath = path.join(testDir, 'test.txt');
      const destPath = path.join(testDir, 'moved.txt');

      const result = await client.callTool({
        name: 'move_file',
        arguments: {
          source: sourcePath,
          destination: destPath
        }
      });

      // The result should have structuredContent
      expect(result.structuredContent).toBeDefined();

      // structuredContent.content should be a string (matching outputSchema: { content: z.string() })
      const structuredContent = result.structuredContent as { content: unknown };
      expect(typeof structuredContent.content).toBe('string');

      // It should NOT be an array
      expect(Array.isArray(structuredContent.content)).toBe(false);

      // The content should contain success message
      expect(structuredContent.content).toContain('Successfully moved');
    });
  });

  describe('list_directory (control - already working)', () => {
    it('should return structuredContent.content as a string', async () => {
      const result = await client.callTool({
        name: 'list_directory',
        arguments: { path: testDir }
      });

      expect(result.structuredContent).toBeDefined();

      const structuredContent = result.structuredContent as { content: unknown };
      expect(typeof structuredContent.content).toBe('string');
      expect(Array.isArray(structuredContent.content)).toBe(false);
    });
  });

  describe('search_files (control - already working)', () => {
    it('should return structuredContent.content as a string', async () => {
      const result = await client.callTool({
        name: 'search_files',
        arguments: {
          path: testDir,
          pattern: '*.txt'
        }
      });

      expect(result.structuredContent).toBeDefined();

      const structuredContent = result.structuredContent as { content: unknown };
      expect(typeof structuredContent.content).toBe('string');
      expect(Array.isArray(structuredContent.content)).toBe(false);
    });
  });
});
