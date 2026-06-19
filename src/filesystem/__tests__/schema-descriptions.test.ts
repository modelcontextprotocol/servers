import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type JsonSchemaProperty = {
  description?: string;
};

type ToolInputSchema = {
  properties?: Record<string, JsonSchemaProperty>;
};

const expectedDescribedProperties: Record<string, string[]> = {
  read_file: ['path'],
  read_text_file: ['path'],
  read_media_file: ['path'],
  write_file: ['path', 'content'],
  edit_file: ['path', 'edits'],
  create_directory: ['path'],
  list_directory: ['path'],
  list_directory_with_sizes: ['path'],
  directory_tree: ['path', 'excludePatterns'],
  move_file: ['source', 'destination'],
  search_files: ['path', 'pattern', 'excludePatterns'],
  get_file_info: ['path'],
};

describe('tool schema descriptions', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-schema-descriptions-'));

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

  it('includes descriptions for filesystem tool input properties', async () => {
    const { tools } = await client.listTools();
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const [toolName, properties] of Object.entries(expectedDescribedProperties)) {
      const tool = toolsByName.get(toolName);
      expect(tool, `expected ${toolName} to be registered`).toBeDefined();

      const inputSchema = tool?.inputSchema as ToolInputSchema | undefined;
      for (const propertyName of properties) {
        const description = inputSchema?.properties?.[propertyName]?.description;
        expect(description, `${toolName}.${propertyName} description`).toEqual(expect.any(String));
        expect(description?.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
