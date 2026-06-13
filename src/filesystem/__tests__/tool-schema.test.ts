import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('tool schemas', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-schema-test-'));

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

  it('describes every required tool parameter', async () => {
    const { tools } = await client.listTools();
    const missingDescriptions: string[] = [];

    for (const tool of tools) {
      const required = tool.inputSchema.required ?? [];
      const properties = tool.inputSchema.properties ?? {};

      for (const propertyName of required) {
        const property = properties[propertyName];
        if (!property || typeof property !== 'object' || !('description' in property)) {
          missingDescriptions.push(`${tool.name}.${propertyName}`);
          continue;
        }

        const description = property.description;
        if (typeof description !== 'string' || description.trim() === '') {
          missingDescriptions.push(`${tool.name}.${propertyName}`);
        }
      }
    }

    expect(missingDescriptions).toEqual([]);
  });
});
