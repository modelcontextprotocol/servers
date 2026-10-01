import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { withDirectoryLock } from '../file-lock.js';

const require = createRequire(import.meta.url);
const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const clients: Client[] = [];
const workers: ChildProcess[] = [];
let directory: string | undefined;

beforeAll(async () => {
  // Child processes must execute the current source, not stale dist output.
  await promisify(execFile)(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    '--project', path.join(packageDirectory, 'tsconfig.json'),
  ]);
}, 30000);

afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()));
  await Promise.all(workers.splice(0).map(async child => {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  }));
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

async function connect(memoryFilePath: string, env: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: 'memory-concurrency-test', version: '1.0.0' });
  clients.push(client);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(packageDirectory, 'dist/index.js')],
    env: { ...process.env, ...env, MEMORY_FILE_PATH: memoryFilePath },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', () => {});
  await client.connect(transport);
  return client;
}

describe('memory shared by independent server processes', () => {
  it.each([false, true])('preserves every successful concurrent creation (abandoned lease: %s)', async recover => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-processes-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    if (recover) {
      // Obtain a real generation through the lease API, abandon it, and age its
      // metadata. Both independent servers then start against the expired lease.
      const lockPath = `${memoryFilePath}.lock`;
      const parked = `${memoryFilePath}.abandoned`;
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      await withDirectoryLock(memoryFilePath, () => fs.rename(lockPath, parked), { timeoutMs: 1000 });
      errors.mockRestore();
      await fs.rename(parked, lockPath);
      const old = new Date(Date.now() - 120000);
      for (const target of [lockPath, ...(await fs.readdir(lockPath)).map(name => path.join(lockPath, name))]) {
        await fs.utimes(target, old, old);
      }
    }
    const servers = await Promise.all([connect(memoryFilePath), connect(memoryFilePath)]);
    const entities = Array.from({ length: 40 }, (_, i) => ({
      name: `entity-${i}`,
      entityType: 'test',
      observations: [`observation-${i}`],
    }));

    const results = await Promise.all(entities.map((entity, i) =>
      servers[i % servers.length].callTool({
        name: 'create_entities',
        arguments: { entities: [entity] },
      }),
    ));
    for (const result of results) expect(result.isError).not.toBe(true);

    const graph = await servers[0].callTool({ name: 'read_graph', arguments: {} });
    expect(graph.isError).not.toBe(true);
    expect(graph.structuredContent).toEqual({
      entities: expect.arrayContaining(entities),
      relations: [],
    });
    const persisted = (await fs.readFile(memoryFilePath, 'utf8'))
      .trim().split('\n').map(line => JSON.parse(line));
    expect(persisted).toHaveLength(entities.length);
  }, 30000);

  // Opt-in (about 90s): MEMORY_DEFAULT_SCALE=1 npm test
  it.runIf(process.env.MEMORY_DEFAULT_SCALE === '1')('returns NOT_COMMITTED fast and recovers a killed holder by retry, at the client default timeout', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-default-scale-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    const moduleUrl = new URL('../dist/file-lock.js', import.meta.url).href;
    const holder = spawn(process.execPath, ['--input-type=module', '-e', `
      import { withDirectoryLock } from ${JSON.stringify(moduleUrl)};
      await withDirectoryLock(${JSON.stringify(memoryFilePath)}, async () => {
        process.send('acquired');
        await new Promise(() => {});
      }, { timeoutMs: 5000 });
    `], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    workers.push(holder);
    await once(holder, 'message');
    const exited = once(holder, 'exit');
    holder.kill('SIGKILL');
    await exited;

    const client = await connect(memoryFilePath);
    const started = performance.now();
    // The server's 30s default budget is below the SDK's 60s client default,
    // so this call needs no timeout override and settles with NOT_COMMITTED.
    const first = await client.callTool({
      name: 'create_entities',
      arguments: { entities: [{ name: 'Recovered', entityType: 'test', observations: [] }] },
    });
    const firstElapsed = Math.round(performance.now() - started);
    console.log(`default-scale first call elapsedMs=${firstElapsed}`);
    expect(first.isError).toBe(true);
    expect(JSON.stringify(first.content)).toContain('NOT_COMMITTED');
    expect(firstElapsed).toBeLessThan(45000);

    // The killed holder's lease goes stale after about 60s; retries then
    // succeed well within about 90s in total.
    let result;
    for (;;) {
      result = await client.callTool({
        name: 'create_entities',
        arguments: { entities: [{ name: 'Recovered', entityType: 'test', observations: [] }] },
      });
      if (!result.isError) break;
      const total = performance.now() - started;
      expect(total).toBeLessThan(90000);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const totalMs = Math.round(performance.now() - started);
    console.log(`default-scale total elapsedMs=${totalMs}`);
    expect(result.isError).not.toBe(true);
    expect(await persistedNames(memoryFilePath)).toEqual(['Recovered']);
    expect(totalMs).toBeLessThan(90000);
  }, 130000);

  it('recovers and writes from another process after the holder is killed', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-crash-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    const moduleUrl = new URL('../dist/file-lock.js', import.meta.url).href;
    const entity = { type: 'entity', name: 'Recovered', entityType: 'test', observations: [] };

    const startWorker = (hold: boolean) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', `
        import { promises as fs } from 'node:fs';
        import { withDirectoryLock } from ${JSON.stringify(moduleUrl)};
        process.on('message', () => {});
        await withDirectoryLock(${JSON.stringify(memoryFilePath)}, async () => {
          process.send('acquired');
          if (${hold}) await new Promise(() => {});
          else await fs.writeFile(${JSON.stringify(memoryFilePath)}, ${JSON.stringify(JSON.stringify(entity) + '\n')});
        }, { staleMs: 1000, updateMs: 100, timeoutMs: 3000 });
        process.disconnect();
      `], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      workers.push(child);
      let stderr = '';
      child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
      const exited = once(child, 'exit');
      const ready = Promise.race([
        once(child, 'message'),
        exited.then(() => { throw new Error(`Lock worker exited before acquiring its lease: ${stderr}`); }),
      ]);
      return { child, ready, exited };
    };

    const holder = startWorker(true);
    await holder.ready;
    holder.child.kill('SIGKILL');
    await holder.exited;
    expect((await fs.stat(`${memoryFilePath}.lock`)).isDirectory()).toBe(true);

    const successor = startWorker(false);
    await successor.ready;
    expect((await successor.exited)[0]).toBe(0);
    expect(JSON.parse(await fs.readFile(memoryFilePath, 'utf8'))).toEqual(entity);
    await expect(fs.stat(`${memoryFilePath}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 10000);
});

async function persistedNames(memoryFilePath: string): Promise<string[]> {
  const data = await fs.readFile(memoryFilePath, 'utf8').catch(() => '');
  return data.split('\n').filter(Boolean).map(line => JSON.parse(line).name);
}

// Holds the shared lease in this test process until release() is called.
async function holdLease(memoryFilePath: string) {
  let release!: () => void;
  let acquired!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { acquired = resolve; });
  const done = withDirectoryLock(memoryFilePath, async () => { acquired(); await held; }, { timeoutMs: 5000 });
  await ready;
  return async () => { release(); await done; };
}

const entity = (name: string) => ({ name, entityType: 'test', observations: [] });
const create = (client: Client, name: string, timeout?: number) => client.callTool(
  { name: 'create_entities', arguments: { entities: [entity(name)] } },
  undefined,
  timeout === undefined ? undefined : { timeout },
);

describe('memory request lifetime over stdio', () => {
  it('the file holds every successful concurrent create and no NOT_COMMITTED one (stress)', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-stress-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    const release = await holdLease(memoryFilePath);
    const servers = await Promise.all([
      connect(memoryFilePath, { MEMORY_REQUEST_TIMEOUT_MS: '500' }),
      connect(memoryFilePath, { MEMORY_REQUEST_TIMEOUT_MS: '500' }),
    ]);

    // While the test holds the lease: every server-budget call must come back
    // NOT_COMMITTED (client timeout well above the 500ms server budget), and
    // every client-budget call times out client-side and counts as unknown.
    const rejectedNames = ['Rejected0', 'Rejected1', 'Rejected2', 'Rejected3'];
    const unknownNames = ['Unknown0', 'Unknown1'];
    const rejected = await Promise.all(rejectedNames.map((name, i) =>
      create(servers[i % 2], name, 8000)));
    for (const result of rejected) {
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('NOT_COMMITTED');
    }
    await Promise.allSettled(unknownNames.map((name, i) => create(servers[i], name, 300)));

    release();
    // Causal barrier: this success runs only after the lease was released, so
    // at least one success and one NOT_COMMITTED are deterministic.
    const successNames = ['Success0', 'Success1'];
    const succeeded = await Promise.all(successNames.map((name, i) =>
      create(servers[i], name)));
    for (const result of succeeded) expect(result.isError).not.toBe(true);

    const persisted = new Set(await persistedNames(memoryFilePath));
    expect([...persisted].sort()).toEqual(successNames);
  }, 30000);

  it('delivers exactly one resource-updated notification for a successful mutation', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-subscription-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    const client = await connect(memoryFilePath);

    const updates: string[] = [];
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, notification => {
      updates.push(notification.params.uri);
    });
    await client.subscribeResource({ uri: 'memory://knowledge-graph' });

    const result = await create(client, 'Notified');
    expect(result.isError).not.toBe(true);

    // A failed mutation notifies nothing.
    const failed = await client.callTool({
      name: 'create_relations',
      arguments: { relations: [{ from: 'Missing', to: 'AlsoMissing', relationType: 'r' }] },
    });
    expect(failed.isError).toBe(true);

    await vi.waitFor(() => expect(updates).toEqual(['memory://knowledge-graph']));
    expect(await persistedNames(memoryFilePath)).toEqual(['Notified']);
  }, 15000);

  it('never publishes a mutation cancelled while acquiring the lease', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-cancel-acquire-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    const release = await holdLease(memoryFilePath);
    const client = await connect(memoryFilePath);

    await expect(create(client, 'Cancelled', 200)).rejects.toThrow('Request timed out');
    // Causal barrier: the client's cancellation notification precedes this
    // ping on the ordered stdio stream, so the server has observed it.
    await client.ping();
    await release();

    expect((await create(client, 'Marker')).isError).not.toBe(true);
    expect(await persistedNames(memoryFilePath)).toEqual(['Marker']);
  }, 15000);

  it('never starts a mutation cancelled while queued behind another request', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-cancel-queue-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    const release = await holdLease(memoryFilePath);
    const client = await connect(memoryFilePath);

    const live = create(client, 'Live');
    await expect(create(client, 'Cancelled', 200)).rejects.toThrow('Request timed out');
    await client.ping();
    await release();

    expect((await live).isError).not.toBe(true);
    expect((await create(client, 'Marker')).isError).not.toBe(true);
    expect(await persistedNames(memoryFilePath)).toEqual(['Live', 'Marker']);
  }, 15000);

  it('ends a mutation at the server request budget without publishing it later', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-budget-'));
    const memoryFilePath = path.join(directory, 'memory.jsonl');
    const release = await holdLease(memoryFilePath);
    const client = await connect(memoryFilePath, { MEMORY_REQUEST_TIMEOUT_MS: '300' });

    const updates: string[] = [];
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, notification => {
      updates.push(notification.params.uri);
    });
    await client.subscribeResource({ uri: 'memory://knowledge-graph' });

    const started = performance.now();
    const expired = await create(client, 'Expired', 5000);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(expired.isError).toBe(true);
    expect(JSON.stringify(expired.content)).toContain('NOT_COMMITTED');
    // A pre-await notification would have been written to this same ordered
    // stdio stream at least 300 ms before the response above.
    expect(updates).toEqual([]);
    await release();

    expect((await create(client, 'Marker')).isError).not.toBe(true);
    await vi.waitFor(() => expect(updates).toEqual(['memory://knowledge-graph']));
    expect(await persistedNames(memoryFilePath)).toEqual(['Marker']);
  }, 15000);

  it('rejects an invalid request budget at startup', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-budget-invalid-'));
    await expect(connect(path.join(directory, 'memory.jsonl'), { MEMORY_REQUEST_TIMEOUT_MS: '0' }))
      .rejects.toThrow();
  }, 15000);
});
