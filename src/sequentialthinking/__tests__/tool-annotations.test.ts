import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndexPath = path.join(packageRoot, 'dist', 'index.js');

// Regression coverage for #4721: the server holds mutable thoughtHistory/branches
// instance state (see lib.ts), so it must not advertise readOnlyHint/idempotentHint
// as true. Runs against the built server so it checks what the SDK actually emits.
describe.skipIf(!existsSync(distIndexPath))('sequentialthinking tool annotations', () => {
  let client: Client;

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [distIndexPath],
      cwd: packageRoot,
      stderr: 'pipe',
    });
    client = new Client({ name: 'tool-annotations-test', version: '0.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('does not claim to be read-only or idempotent', async () => {
    const { tools } = await client.listTools();
    const tool = tools.find(t => t.name === 'sequentialthinking');
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(false);
    expect(tool!.annotations?.idempotentHint).toBe(false);
  });

  it('actually grows thoughtHistoryLength on repeated identical calls, proving it is not idempotent', async () => {
    const args = { thought: 't', nextThoughtNeeded: false, thoughtNumber: 1, totalThoughts: 1 };

    const first = await client.callTool({ name: 'sequentialthinking', arguments: args });
    const second = await client.callTool({ name: 'sequentialthinking', arguments: args });

    const firstLength = JSON.parse((first.content as Array<{ text: string }>)[0].text).thoughtHistoryLength;
    const secondLength = JSON.parse((second.content as Array<{ text: string }>)[0].text).thoughtHistoryLength;

    expect(secondLength).toBe(firstLength + 1);
  });
});
