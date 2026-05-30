import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncRoots, roots } from '../server/roots.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const sessionA = 'session-a';

const makeMockServer = (overrides: {
  listRoots: () => Promise<unknown>;
  capabilities?: Record<string, unknown>;
}) => {
  const setNotificationHandler = vi.fn();
  const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
  const listRoots = vi.fn(overrides.listRoots);
  const capabilities = overrides.capabilities ?? { roots: {} };

  const mockServer = {
    sendLoggingMessage,
    server: {
      getClientCapabilities: vi.fn(() => capabilities),
      listRoots,
      setNotificationHandler,
    },
  } as unknown as McpServer;

  return { mockServer, listRoots, setNotificationHandler, sendLoggingMessage };
};

describe('syncRoots', () => {
  beforeEach(() => {
    roots.clear();
  });

  it('caches roots and does not re-fetch on subsequent calls', async () => {
    const { mockServer, listRoots, setNotificationHandler } = makeMockServer({
      listRoots: () => Promise.resolve({ roots: [{ uri: 'file:///a', name: 'a' }] }),
    });

    const first = await syncRoots(mockServer, sessionA);
    const second = await syncRoots(mockServer, sessionA);

    expect(first).toEqual([{ uri: 'file:///a', name: 'a' }]);
    expect(second).toEqual([{ uri: 'file:///a', name: 'a' }]);
    expect(listRoots).toHaveBeenCalledTimes(1);
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch on subsequent calls when listRoots throws', async () => {
    const { mockServer, listRoots, setNotificationHandler } = makeMockServer({
      listRoots: () => Promise.reject(new Error('boom')),
    });

    await syncRoots(mockServer, sessionA);
    await syncRoots(mockServer, sessionA);
    await syncRoots(mockServer, sessionA);

    // The doc claims this function is idempotent and fetches once per session.
    // After a failed fetch, subsequent calls must not retry the listRoots
    // request, otherwise every tool call hits the client again.
    expect(listRoots).toHaveBeenCalledTimes(1);
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch on subsequent calls when listRoots returns falsy or unshaped', async () => {
    const { mockServer, listRoots, setNotificationHandler } = makeMockServer({
      listRoots: () => Promise.resolve(undefined),
    });

    await syncRoots(mockServer, sessionA);
    await syncRoots(mockServer, sessionA);

    expect(listRoots).toHaveBeenCalledTimes(1);
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it('returns undefined and does not call listRoots when client lacks roots capability', async () => {
    const { mockServer, listRoots, setNotificationHandler } = makeMockServer({
      listRoots: () => Promise.resolve({ roots: [] }),
      capabilities: {},
    });

    const result = await syncRoots(mockServer, sessionA);

    expect(result).toBeUndefined();
    expect(listRoots).not.toHaveBeenCalled();
    expect(setNotificationHandler).not.toHaveBeenCalled();
  });
});
