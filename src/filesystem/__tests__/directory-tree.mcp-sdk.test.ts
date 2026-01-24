import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('directory_tree MCP SDK regression', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-tree-'));
    testDir = await fs.realpath(tmp);

    await fs.writeFile(path.join(testDir, 'root.txt'), 'root');
    await fs.mkdir(path.join(testDir, 'nested'));
    await fs.writeFile(path.join(testDir, 'nested', 'child.txt'), 'child');

    const serverPath = path.resolve(__dirname, '../dist/index.js');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath, testDir],
    });

    client = new Client(
      { name: 'directory-tree-regression-test', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('returns structuredContent.content as a string (not an array) when called via MCP SDK', async () => {
    const result = await client.callTool({
      name: 'directory_tree',
      arguments: { path: testDir },
    });

    // Regression test for issues where structuredContent was returned as an array,
    // which causes MCP SDK validation to throw -32602 (invalid structured content).
    const structured = result.structuredContent as { content: unknown };
    expect(structured).toBeDefined();
    expect(typeof structured.content).toBe('string');
    expect(Array.isArray(structured.content)).toBe(false);

    const parsed = JSON.parse(structured.content as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });
});
