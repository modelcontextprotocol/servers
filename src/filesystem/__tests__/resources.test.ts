import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mkdtempSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setAllowedDirectories } from '../lib.js';
import { registerResources } from '../resources.js';

let dir: string;
beforeEach(() => { dir = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-fs-'))); setAllowedDirectories([dir]); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); setAllowedDirectories([]); });

it('registers allowed-directories and file resources', () => {
  const s = { registerResource: vi.fn() } as unknown as McpServer;
  registerResources(s);
  const calls = (s.registerResource as any).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls.map((c: any) => c[0])).toEqual(expect.arrayContaining(['allowed-directories', 'file']));
  expect(calls.find((c: any) => c[0] === 'file')[1]).toBeInstanceOf(ResourceTemplate);
});
