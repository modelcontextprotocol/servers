import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SequentialThinking MCP Server Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeEach(async () => {
    const serverPath = path.resolve(__dirname, '../dist/index.js');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        DISABLE_THOUGHT_LOGGING: 'true',
      },
    });

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
  });

  it('should match server version with package.json', async () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')
    );
    const serverVersion = client.getServerVersion();
    expect(serverVersion?.version).toBe(pkg.version);
    expect(serverVersion?.name).toBe('sequential-thinking-server');
  });

  it('should include nextThoughtNeeded in inputSchema.required', async () => {
    const toolsResult = await client.listTools();
    const tool = toolsResult.tools.find((t) => t.name === 'sequentialthinking');
    expect(tool).toBeDefined();

    const inputSchema = tool?.inputSchema as {
      type: string;
      required?: string[];
      properties?: Record<string, unknown>;
    };

    expect(inputSchema.type).toBe('object');
    expect(inputSchema.required).toBeDefined();
    expect(inputSchema.required).toContain('thought');
    expect(inputSchema.required).toContain('nextThoughtNeeded');
    expect(inputSchema.required).toContain('thoughtNumber');
    expect(inputSchema.required).toContain('totalThoughts');

    // Optional fields should NOT be in required
    expect(inputSchema.required).not.toContain('isRevision');
    expect(inputSchema.required).not.toContain('revisesThought');
    expect(inputSchema.required).not.toContain('branchFromThought');
    expect(inputSchema.required).not.toContain('branchId');
    expect(inputSchema.required).not.toContain('needsMoreThoughts');
  });

  it('should process thought with boolean nextThoughtNeeded (true and false)', async () => {
    const resultTrue = await client.callTool({
      name: 'sequentialthinking',
      arguments: {
        thought: 'First step',
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 2,
      },
    });
    expect(resultTrue.isError).toBeFalsy();
    const dataTrue = JSON.parse((resultTrue.content as Array<{ type: string; text: string }>)[0].text);
    expect(dataTrue.nextThoughtNeeded).toBe(true);

    const resultFalse = await client.callTool({
      name: 'sequentialthinking',
      arguments: {
        thought: 'Second step',
        nextThoughtNeeded: false,
        thoughtNumber: 2,
        totalThoughts: 2,
      },
    });
    expect(resultFalse.isError).toBeFalsy();
    const dataFalse = JSON.parse((resultFalse.content as Array<{ type: string; text: string }>)[0].text);
    expect(dataFalse.nextThoughtNeeded).toBe(false);
  });

  it('should coerce string "true" and "false" for nextThoughtNeeded and optional booleans', async () => {
    const result = await client.callTool({
      name: 'sequentialthinking',
      arguments: {
        thought: 'Checking string booleans',
        nextThoughtNeeded: 'false',
        thoughtNumber: '1',
        totalThoughts: '3',
        isRevision: 'true',
        revisesThought: '1',
        needsMoreThoughts: 'FALSE',
      },
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(data.thoughtNumber).toBe(1);
    expect(data.totalThoughts).toBe(3);
    expect(data.nextThoughtNeeded).toBe(false);
  });

  it('should coerce uppercase and mixed-case strings for boolean fields', async () => {
    const result = await client.callTool({
      name: 'sequentialthinking',
      arguments: {
        thought: 'Checking True and FALSE',
        nextThoughtNeeded: 'True',
        thoughtNumber: 1,
        totalThoughts: 2,
        isRevision: 'FALSE',
      },
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(data.nextThoughtNeeded).toBe(true);
  });

  it('should return error when required field nextThoughtNeeded is omitted', async () => {
    const result = await client.callTool({
      name: 'sequentialthinking',
      arguments: {
        thought: 'Missing nextThoughtNeeded',
        thoughtNumber: 1,
        totalThoughts: 1,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('-32602');
    expect(content[0].text).toContain('nextThoughtNeeded');
  });

  it('should return error when required field thought is omitted', async () => {
    const result = await client.callTool({
      name: 'sequentialthinking',
      arguments: {
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 1,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('-32602');
    expect(content[0].text).toContain('thought');
  });
});
