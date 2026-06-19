import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface JsonSchemaProperty {
  description?: string;
}

interface JsonSchema {
  properties?: Record<string, JsonSchemaProperty>;
}

describe('tool schema metadata', () => {
  let client: Client;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-schema-test-'));

    const serverPath = path.resolve(__dirname, '../dist/index.js');
    const transport = new StdioClientTransport({
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

  it('describes every exposed input parameter', async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      const schema = tool.inputSchema as JsonSchema;

      for (const [parameterName, property] of Object.entries(schema.properties ?? {})) {
        expect(
          property.description,
          `${tool.name}.${parameterName} should have a parameter description`
        ).toBeTypeOf('string');
        expect(property.description?.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
