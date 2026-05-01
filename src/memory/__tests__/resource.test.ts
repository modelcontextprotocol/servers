import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KnowledgeGraphManager, registerKnowledgeGraphResource } from '../index.js';

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
