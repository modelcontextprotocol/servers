import { it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from '../prompts.js';

it('registers read-file prompt with path in message', () => {
  const s = { registerPrompt: vi.fn() } as unknown as McpServer;
  registerPrompts(s);
  const [name,, handler] = (s.registerPrompt as any).mock.calls[0];
  expect(name).toBe('read-file');
  expect(handler({ path: '/a/b.txt' }).messages[0].content.text).toContain('/a/b.txt');
});
