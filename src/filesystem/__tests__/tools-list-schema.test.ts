import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('tools/list input schemas', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-tools-list-'));
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath, testDir],
    });

    client = new Client(
      { name: 'tools-list-schema-regression-test', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('advertises object input schemas for every filesystem tool', async () => {
    const result = await client.listTools();

    expect(result.tools.length).toBeGreaterThan(0);
    for (const tool of result.tools) {
      expect(tool.inputSchema, `${tool.name} input schema`).toMatchObject({
        type: 'object',
      });
    }
  });
});
