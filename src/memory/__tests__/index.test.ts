import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs/promises';

const mocks = vi.hoisted(() => ({
  registeredTools: [] as Array<{
    name: string;
    config: { annotations?: Record<string, unknown>; inputSchema?: Record<string, unknown> };
    handler: (args: any) => Promise<any>;
  }>,
  registeredResources: [] as Array<{
    name: string;
    uri: string;
    config: Record<string, unknown>;
    readCallback: (uri: URL) => Promise<any>;
  }>,
  requestHandlers: new Map<unknown, (request: any) => Promise<any>>(),
  serverInstance: { current: null as any },
  fsPromisesMock: {} as Record<string, any>,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class FakeMcpServer {
    server = {
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn((schema: unknown, handler: (request: any) => Promise<any>) => {
        mocks.requestHandlers.set(schema, handler);
      }),
      sendResourceUpdated: vi.fn(),
    };

    constructor(_info: { name: string; version: string }) {
      mocks.serverInstance.current = this;
    }

    registerTool(
      name: string,
      config: any,
      handler: (args: any) => Promise<any>
    ) {
      mocks.registeredTools.push({ name, config, handler });
    }

    registerResource(
      name: string,
      uri: string,
      config: Record<string, unknown>,
      readCallback: (uri: URL) => Promise<any>
    ) {
      mocks.registeredResources.push({ name, uri, config, readCallback });
    }

    async connect() {}
  }
  return { McpServer: FakeMcpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));

// Consumers use both default and namespace import shapes for fs promises
vi.mock('fs/promises', () => ({
  default: mocks.fsPromisesMock,
  ...mocks.fsPromisesMock,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: mocks.fsPromisesMock,
  };
});

const mockFs = fs as any;

function ensureFsMocks() {
  for (const method of ['access', 'realpath', 'stat', 'readFile', 'writeFile', 'mkdir', 'rename', 'unlink']) {
    mocks.fsPromisesMock[method] ??= vi.fn();
  }
}

function enoent() {
  return Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
}

// ensureMemoryFilePath probes for a legacy memory.json at import; make it miss
ensureFsMocks();
mocks.fsPromisesMock.access.mockRejectedValue(enoent());

await import('../index.js');

const RESOURCE_URI = 'memory://knowledge-graph';

function getTool(name: string) {
  const tool = mocks.registeredTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function jsonl(...items: Array<{ type: string } & Record<string, unknown>>): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}

function entity(name: string, entityType = 'person', observations: string[] = []) {
  return { type: 'entity', name, entityType, observations };
}

function relation(from: string, to: string, relationType: string) {
  return { type: 'relation', from, to, relationType };
}

function parsePersistedGraph(): Array<any> {
  const raw = String(mockFs.writeFile.mock.calls[0][1]);
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureFsMocks();
  // Default: no legacy file, no existing memory file
  mocks.fsPromisesMock.access.mockRejectedValue(enoent());
  mocks.fsPromisesMock.readFile.mockRejectedValue(enoent());
  mocks.fsPromisesMock.writeFile.mockResolvedValue(undefined);
});

describe('Memory Server Registration', () => {
  it('registers all nine knowledge graph tools once each', () => {
    const names = mocks.registeredTools.map((t) => t.name);
    for (const expected of [
      'create_entities',
      'create_relations',
      'add_observations',
      'delete_entities',
      'delete_observations',
      'delete_relations',
      'read_graph',
      'search_nodes',
      'open_nodes'
    ]) {
      expect(names.filter((n) => n === expected)).toHaveLength(1);
    }
  });

  it('registers the knowledge-graph resource with subscription support', async () => {
    const resource = mocks.registeredResources.find((r) => r.name === 'knowledge-graph');
    expect(resource?.uri).toBe(RESOURCE_URI);
    expect(resource?.config).toMatchObject({ mimeType: 'application/json' });

    const SubscribeRequestSchema = (await import('@modelcontextprotocol/sdk/types.js')).SubscribeRequestSchema;
    const UnsubscribeRequestSchema = (await import('@modelcontextprotocol/sdk/types.js')).UnsubscribeRequestSchema;
    expect(mocks.requestHandlers.has(SubscribeRequestSchema)).toBe(true);
    expect(mocks.requestHandlers.has(UnsubscribeRequestSchema)).toBe(true);
  });
});

describe('Memory Tool Handlers', () => {
  it('create_entities persists entities and returns the created ones', async () => {
    const result = await getTool('create_entities').handler({
      entities: [
        { name: 'Alice', entityType: 'person', observations: ['engineer'] },
        { name: 'Bob', entityType: 'person', observations: [] }
      ]
    });
    expect(result.structuredContent).toEqual({ entities: [
      { name: 'Alice', entityType: 'person', observations: ['engineer'] },
      { name: 'Bob', entityType: 'person', observations: [] }
    ] });
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    const persisted = parsePersistedGraph();
    expect(persisted.some((i) => i.type === 'entity' && i.name === 'Alice')).toBe(true);
  });

  it('create_relations deduplicates against the stored graph and returns only new ones', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(
      entity('Alice', 'person', []),
      entity('Bob', 'person', []),
      relation('Alice', 'Bob', 'works_with')
    ));
    const result = await getTool('create_relations').handler({
      relations: [
        { from: 'Alice', to: 'Bob', relationType: 'works_with' },
        { from: 'Bob', to: 'Alice', relationType: 'mentors' }
      ]
    });
    expect(result.structuredContent).toEqual({ relations: [
      { from: 'Bob', to: 'Alice', relationType: 'mentors' }
    ] });
  });

  it('add_observations appends unseen contents per entity', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(entity('Alice', 'person', ['engineer'])));
    const result = await getTool('add_observations').handler({
      observations: [{ entityName: 'Alice', contents: ['engineer', 'rustacean'] }]
    });
    expect(result.structuredContent).toEqual({
      results: [{ entityName: 'Alice', addedObservations: ['rustacean'] }]
    });
    const persisted = parsePersistedGraph();
    expect(persisted[0].observations).toEqual(['engineer', 'rustacean']);
  });

  it('add_observations rejects when the entity does not exist', async () => {
    await expect(
      getTool('add_observations').handler({ observations: [{ entityName: 'Ghost', contents: ['x'] }] })
    ).rejects.toThrow('Entity with name Ghost not found');
  });

  it('delete_entities removes matching entities and their relations', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(
      entity('Alice'),
      entity('Bob'),
      entity('Carol'),
      relation('Alice', 'Bob', 'works_with'),
      relation('Carol', 'Dave', 'knows')
    ));
    await getTool('delete_entities').handler({ entityNames: ['Alice'] });
    const persisted = parsePersistedGraph();
    expect(persisted.some((i) => i.type === 'entity' && i.name === 'Alice')).toBe(false);
    expect(persisted.some((i) => i.type === 'relation' && i.from === 'Alice')).toBe(false);
    expect(persisted.some((i) => i.type === 'relation' && i.from === 'Carol')).toBe(true);
  });

  it('delete_observations strips only the requested contents', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(entity('Alice', 'person', ['a', 'b', 'c'])));
    await getTool('delete_observations').handler({
      deletions: [{ entityName: 'Alice', observations: ['b'] }]
    });
    const persisted = parsePersistedGraph();
    expect(persisted[0].observations).toEqual(['a', 'c']);
  });

  it('delete_relations removes only exact matches', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(
      relation('Alice', 'Bob', 'works_with'),
      relation('Alice', 'Bob', 'mentors')
    ));
    await getTool('delete_relations').handler({
      relations: [{ from: 'Alice', to: 'Bob', relationType: 'works_with' }]
    });
    const persisted = parsePersistedGraph();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].relationType).toBe('mentors');
  });

  it('read_graph returns the full stored graph', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(entity('Alice'), relation('Alice', 'Bob', 'knows')));
    const result = await getTool('read_graph').handler({});
    expect(result.structuredContent.entities).toHaveLength(1);
    expect(result.structuredContent.relations).toHaveLength(1);
  });

  it('read_graph returns an empty graph when no memory file exists yet', async () => {
    const result = await getTool('read_graph').handler({});
    expect(result.structuredContent).toEqual({ entities: [], relations: [] });
  });

  it('propagates non-ENOENT read failures instead of treating them as empty graphs', async () => {
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('EIO: disk failure'), { code: 'EIO' }));
    await expect(getTool('read_graph').handler({})).rejects.toThrow('EIO: disk failure');
  });

  it('search_nodes matches entities by name, type, or observation and keeps touching relations', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(
      entity('Alice', 'engineer', ['likes rust']),
      entity('Bob', 'designer', []),
      entity('Rusty', 'person', []),
      relation('Alice', 'Bob', 'works_with')
    ));
    const result = await getTool('search_nodes').handler({ query: 'rust' });
    const names = result.structuredContent.entities.map((e: any) => e.name).sort();
    expect(names).toEqual(['Alice', 'Rusty']);
    expect(result.structuredContent.relations).toHaveLength(1);
  });

  it('open_nodes returns requested entities plus relations that touch them', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(
      entity('Alice'),
      entity('Bob'),
      entity('Carol'),
      relation('Alice', 'Bob', 'works_with'),
      relation('Carol', 'Dave', 'knows')
    ));
    const result = await getTool('open_nodes').handler({ names: ['Bob'] });
    expect(result.structuredContent.entities.map((e: any) => e.name)).toEqual(['Bob']);
    expect(result.structuredContent.relations.map((r: any) => r.from)).toEqual(['Alice']);
  });

  it('serializes tool output as pretty-printed JSON text content', async () => {
    const result = await getTool('read_graph').handler({});
    expect(result.content[0].type).toBe('text');
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});

describe('Memory Knowledge Graph Resource', () => {
  it('serves the full graph as application/json content', async () => {
    mockFs.readFile.mockResolvedValue(jsonl(entity('Alice')));
    const resource = mocks.registeredResources.find((r) => r.name === 'knowledge-graph')!;
    const result = await resource.readCallback(new URL(RESOURCE_URI));
    expect(result.contents[0].mimeType).toBe('application/json');
    expect(result.contents[0].uri).toBe(RESOURCE_URI);
    const graph = JSON.parse(result.contents[0].text);
    expect(graph.entities.map((e: any) => e.name)).toEqual(['Alice']);
  });
});

describe('Memory Subscription Notifications', () => {
  it('notifies subscribed clients after mutations and stops after unsubscribe', async () => {
    const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');
    const subscribe = mocks.requestHandlers.get(sdkTypes.SubscribeRequestSchema)!;
    const unsubscribe = mocks.requestHandlers.get(sdkTypes.UnsubscribeRequestSchema)!;
    const serverStub = mocks.serverInstance.current.server;

    await subscribe({ params: { uri: RESOURCE_URI } });
    await getTool('create_entities').handler({ entities: [] });
    expect(serverStub.sendResourceUpdated).toHaveBeenCalledWith({ uri: RESOURCE_URI });

    await unsubscribe({ params: { uri: RESOURCE_URI } });
    await getTool('create_entities').handler({ entities: [] });
    expect(serverStub.sendResourceUpdated).toHaveBeenCalledTimes(1);
  });

  it('does not notify for other resource URIs', async () => {
    const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');
    const subscribe = mocks.requestHandlers.get(sdkTypes.SubscribeRequestSchema)!;
    await subscribe({ params: { uri: 'memory://something-else' } });

    await getTool('create_entities').handler({ entities: [] });
    expect(mocks.serverInstance.current.server.sendResourceUpdated).not.toHaveBeenCalled();
  });
});

describe('Memory Server Startup', () => {
  it('reports a fatal error and exits when the transport cannot connect', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const proto = (McpServer as unknown as { prototype: { connect: () => Promise<void> } }).prototype;
    const originalConnect = proto.connect;
    proto.connect = async () => {
      throw new Error('stdio unavailable');
    };

    try {
      vi.resetModules();
      await import('../index.js');
      await new Promise((resolve) => setImmediate(resolve));
      expect(errSpy).toHaveBeenCalledWith('Fatal error in main():', expect.any(Error));
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      proto.connect = originalConnect;
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
