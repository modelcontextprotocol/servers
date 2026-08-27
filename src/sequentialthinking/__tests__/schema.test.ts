import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { coercedBoolean } from '../lib.js';

describe('coercedBoolean - value coercion', () => {
  it('accepts real booleans unchanged', () => {
    expect(coercedBoolean.parse(true)).toBe(true);
    expect(coercedBoolean.parse(false)).toBe(false);
  });

  it('coerces the strings "true"/"false" (case-insensitive)', () => {
    expect(coercedBoolean.parse('true')).toBe(true);
    expect(coercedBoolean.parse('false')).toBe(false);
    expect(coercedBoolean.parse('TRUE')).toBe(true);
    expect(coercedBoolean.parse('False')).toBe(false);
  });

  it('rejects other values instead of silently passing them through', () => {
    // Regression guard: a naive coercion that returns the raw value would let
    // the truthy string "false" through as `true`; these must all fail.
    expect(coercedBoolean.safeParse('yes').success).toBe(false);
    expect(coercedBoolean.safeParse('').success).toBe(false);
    expect(coercedBoolean.safeParse(1).success).toBe(false);
    expect(coercedBoolean.safeParse(null).success).toBe(false);
  });
});

describe('coercedBoolean - JSON Schema generation (issue #4651)', () => {
  async function toolInputSchema(inputSchema: Record<string, unknown>) {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    server.registerTool(
      'probe',
      { inputSchema: inputSchema as never },
      async () => ({ content: [] }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    await client.close();
    return tools.find((t) => t.name === 'probe')!.inputSchema;
  }

  it('keeps a non-optional coercedBoolean field in `required`', async () => {
    const schema = await toolInputSchema({ flag: coercedBoolean });
    expect(schema.required).toContain('flag');
  });

  it('omits an .optional() coercedBoolean field from `required`', async () => {
    const schema = await toolInputSchema({ flag: coercedBoolean.optional() });
    expect(schema.required ?? []).not.toContain('flag');
  });
});
