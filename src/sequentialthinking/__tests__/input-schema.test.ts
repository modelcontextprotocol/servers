import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndexPath = path.join(packageRoot, 'dist', 'index.js');

// Regression coverage for #4651: nextThoughtNeeded must stay in the advertised
// `required` array, and string coercion must keep accepting "True"/"FALSE"
// while rejecting anything else. Runs against the built server so it checks
// the schema the SDK actually emits, not the zod object.
describe.skipIf(!existsSync(distIndexPath))('sequentialthinking input schema', () => {
  let client: Client;

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [distIndexPath],
      cwd: packageRoot,
      stderr: 'pipe',
    });
    client = new Client({ name: 'input-schema-test', version: '0.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('advertises nextThoughtNeeded as required', async () => {
    const { tools } = await client.listTools();
    const tool = tools.find(t => t.name === 'sequentialthinking');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toEqual(
      expect.arrayContaining(['thought', 'nextThoughtNeeded', 'thoughtNumber', 'totalThoughts'])
    );
  });

  it('rejects a call that omits nextThoughtNeeded', async () => {
    const result = await client.callTool({
      name: 'sequentialthinking',
      arguments: { thought: 't', thoughtNumber: 1, totalThoughts: 1 },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/nextThoughtNeeded/);
  });

  it.each(['True', 'FALSE', 'true', 'false'])('accepts the string %s', async (value) => {
    const result = await client.callTool({
      name: 'sequentialthinking',
      arguments: { thought: 't', nextThoughtNeeded: value, thoughtNumber: 1, totalThoughts: 1 },
    });
    expect(result.isError).toBeFalsy();
  });

  it.each(['yes', '', '1'])('rejects the string %j', async (value) => {
    const result = await client.callTool({
      name: 'sequentialthinking',
      arguments: { thought: 't', nextThoughtNeeded: value, thoughtNumber: 1, totalThoughts: 1 },
    });
    expect(result.isError).toBe(true);
  });
});
