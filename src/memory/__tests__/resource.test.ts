import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  KnowledgeGraphManager,
  registerKnowledgeGraphResource,
  registerKnowledgeGraphSubscriptions,
} from '../index.js';

describe('knowledge-graph resource', () => {
  it('registers with kebab-case name, correct URI, and JSON mime type', () => {
    const mockServer = { registerResource: vi.fn() } as unknown as McpServer;
    const manager = {} as KnowledgeGraphManager;

    registerKnowledgeGraphResource(mockServer, manager);

    expect(mockServer.registerResource).toHaveBeenCalledWith(
      'knowledge-graph',
      'memory://knowledge-graph',
      expect.objectContaining({
        title: 'Knowledge Graph',
        mimeType: 'application/json',
      }),
      expect.any(Function),
    );
  });

  it('handler returns the graph as JSON in the contents array', async () => {
    const mockServer = { registerResource: vi.fn() } as unknown as McpServer;
    const fakeGraph = {
      entities: [{ name: 'Alice', entityType: 'person', observations: ['engineer'] }],
      relations: [{ from: 'Alice', to: 'Acme', relationType: 'works_at' }],
    };
    const manager = {
      readGraph: vi.fn().mockResolvedValue(fakeGraph),
    } as unknown as KnowledgeGraphManager;

    registerKnowledgeGraphResource(mockServer, manager);

    const handler = (mockServer.registerResource as ReturnType<typeof vi.fn>).mock.calls[0][3];
    const result = await handler(new URL('memory://knowledge-graph'));

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('memory://knowledge-graph');
    expect(result.contents[0].mimeType).toBe('application/json');
    expect(JSON.parse(result.contents[0].text)).toEqual(fakeGraph);
    expect(manager.readGraph).toHaveBeenCalledOnce();
  });
});

describe('knowledge-graph resource subscriptions', () => {
  function makeMockServer() {
    const inner = {
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
      sendResourceUpdated: vi.fn(),
    };
    const mockServer = { server: inner } as unknown as McpServer;
    return { mockServer, inner };
  }

  function handlerFor(inner: ReturnType<typeof makeMockServer>['inner'], schema: unknown) {
    const call = inner.setRequestHandler.mock.calls.find((c) => c[0] === schema);
    if (!call) throw new Error('handler not registered');
    return call[1] as (request: { params: { uri: string } }) => Promise<unknown>;
  }

  it('declares the resources.subscribe capability', () => {
    const { mockServer, inner } = makeMockServer();

    registerKnowledgeGraphSubscriptions(mockServer);

    expect(inner.registerCapabilities).toHaveBeenCalledWith({
      resources: { subscribe: true },
    });
  });

  it('registers subscribe and unsubscribe request handlers', () => {
    const { mockServer, inner } = makeMockServer();

    registerKnowledgeGraphSubscriptions(mockServer);

    const schemas = inner.setRequestHandler.mock.calls.map((c) => c[0]);
    expect(schemas).toContain(SubscribeRequestSchema);
    expect(schemas).toContain(UnsubscribeRequestSchema);
  });

  it('subscribe and unsubscribe handlers acknowledge with an empty result', async () => {
    const { mockServer, inner } = makeMockServer();

    registerKnowledgeGraphSubscriptions(mockServer);

    const req = { params: { uri: 'memory://knowledge-graph' } };
    await expect(handlerFor(inner, SubscribeRequestSchema)(req)).resolves.toEqual({});
    await expect(handlerFor(inner, UnsubscribeRequestSchema)(req)).resolves.toEqual({});
  });
});
