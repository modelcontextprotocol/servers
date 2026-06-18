import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('unknown tool handling', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-unknown-tool-'));

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

  it('returns a JSON-RPC error for unknown tools', async () => {
    const unknownToolName = '__mcp_test_unknown_tool_read_file__';
    let error: unknown;

    try {
      await client.callTool({
        name: unknownToolName,
        arguments: {}
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toMatchObject({
      code: ErrorCode.InvalidParams
    });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(`Unknown tool: ${unknownToolName}`);
  });

  it('keeps validation failures for known tools as tool errors', async () => {
    const result = await client.callTool({
      name: 'read_text_file',
      arguments: {}
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text'
    });
    expect((result.content[0] as { text: string }).text).toContain('Input validation error');
  });
});
