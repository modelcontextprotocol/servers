import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withDirectoryLock } from '../file-lock.js';
import { KnowledgeGraphManager, MemoryRequestError } from '../index.js';
import { DEFAULT_REQUEST_TIMEOUT_MS, parseRequestTimeout } from '../request-lifecycle.js';

let directory: string;
let file: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-lifecycle-'));
  file = path.join(directory, 'memory.jsonl');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

const entity = (name: string) => ({ name, entityType: 'test', observations: [] });

async function names(): Promise<string[]> {
  return (await new KnowledgeGraphManager(file).readGraph()).entities.map(e => e.name);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Holds graph publication (rename onto the memory file) open until released.
function gateGraphRename() {
  const entered = deferred();
  const gate = deferred();
  const rename = fs.rename;
  let calls = 0;
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === file && calls++ === 0) {
      entered.resolve();
      await gate.promise;
    }
    return rename(from, to);
  });
  return { entered: entered.promise, release: gate.resolve };
}

async function holdLease() {
  const acquired = deferred();
  const held = deferred();
  const done = withDirectoryLock(file, async () => { acquired.resolve(); await held.promise; }, { timeoutMs: 5000 });
  await acquired.promise;
  return async () => { held.resolve(); await done; };
}

describe('configuration', () => {
  it('validates the configured request budget', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30000);
    expect(parseRequestTimeout(undefined)).toBe(30000);
    expect(parseRequestTimeout('120000')).toBe(120000);
    for (const value of ['0', '-1', '1.5', 'abc', '', String(2 ** 31)]) {
      expect(() => parseRequestTimeout(value)).toThrow('MEMORY_REQUEST_TIMEOUT_MS');
    }
    expect(() => new KnowledgeGraphManager(file, { maxPendingMutations: 0 })).toThrow('capacity');
  });
});

describe('mixed-outcome mutation stress (single process)', () => {
  it('the file holds every resolved create and no NOT_COMMITTED create', async () => {
    const managers = Array.from({ length: 3 }, () => new KnowledgeGraphManager(file));
    const gate = gateGraphRename();
    const active = managers[0].createEntities([entity('Gate')]);
    await gate.entered; // the lease is held by the gated writer

    const cancelled = new AbortController();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort('gone');
    const shortBudgets = [AbortSignal.timeout(50), AbortSignal.timeout(50)];
    const track = (name: string, outcome: Promise<unknown>) => {
      // Silence Node's unhandled-rejection window: handlers are asserted
      // later through allSettled, after timer-gated barriers.
      outcome.catch(() => {});
      calls.push({ name, outcome });
    };
    const calls: { name: string; outcome: Promise<unknown> }[] = [
      // Same manager: queued behind the gated writer.
    ];
    track('QueuedOk', managers[0].createEntities([entity('QueuedOk')]));
    track('QueuedCancelled', managers[0].createEntities([entity('QueuedCancelled')], cancelled.signal));
    track('QueuedExpired', managers[0].createEntities([entity('QueuedExpired')], shortBudgets[0]));
    track('AlreadyAborted', managers[0].createEntities([entity('AlreadyAborted')], alreadyAborted.signal));
    // Other managers: contending for the lease right now.
    track('LeaseOk', managers[1].createEntities([entity('LeaseOk')]));
    track('LeaseCancelled', managers[1].createEntities([entity('LeaseCancelled')], cancelled.signal));
    track('LeaseExpired', managers[1].createEntities([entity('LeaseExpired')], shortBudgets[1]));
    track('LeaseAborted', managers[2].createEntities([entity('LeaseAborted')], alreadyAborted.signal));
    track('PlainOk', managers[2].createEntities([entity('PlainOk')]));
    // Causal barriers: cancellation delivered and both short budgets fired
    // before the gate opens.
    cancelled.abort('stop');
    await vi.waitFor(() => expect(shortBudgets.every(signal => signal.aborted)).toBe(true));

    // Attach every handler before the gate opens so no rejection is ever
    // momentarily unhandled while awaits pause this test.
    const settledPromise = Promise.allSettled(calls.map(call => call.outcome));
    gate.release();
    await active;
    const settled = await settledPromise;
    const present = new Set(await names());
    let successes = 0;
    let notCommitted = 0;
    let unknown = 0;
    for (const [index, outcome] of settled.entries()) {
      const name = calls[index].name;
      if (outcome.status === 'fulfilled') {
        successes++;
        expect(present.has(name)).toBe(true);
        continue;
      }
      expect(outcome.reason).toBeInstanceOf(MemoryRequestError);
      const state = (outcome.reason as MemoryRequestError).state;
      if (state === 'NOT_COMMITTED') {
        notCommitted++;
        expect(present.has(name)).toBe(false);
      } else {
        unknown++; // COMMIT_UNKNOWN may be persisted or not
      }
    }
    expect(successes).toBeGreaterThan(0);
    expect(notCommitted).toBeGreaterThan(0);
    expect(successes + notCommitted + unknown).toBe(calls.length);

    await managers[0].createEntities([entity('Final')]);
    expect(await names()).toEqual(expect.arrayContaining(['Gate', 'QueuedOk', 'LeaseOk', 'PlainOk', 'Final']));
    expect(await names()).not.toEqual(expect.arrayContaining(['QueuedCancelled', 'AlreadyAborted', 'LeaseAborted']));
  }, 20000);
});

describe('mutation transaction lifetime', () => {
  it('spends queue time from the same budget: an expired queued caller never writes (A3)', async () => {
    const manager = new KnowledgeGraphManager(file);
    const gate = gateGraphRename();
    const first = manager.createEntities([entity('First')]);
    await gate.entered;
    const budget = AbortSignal.timeout(150);
    const expired = manager.createEntities([entity('Late')], budget);
    // Causal barrier: the budget fires while the caller is queued.
    await vi.waitFor(() => expect(budget.aborted).toBe(true));
    gate.release();
    await first;
    await expect(expired).rejects.toThrow('NOT_COMMITTED');
    await manager.createEntities([entity('Marker')]);
    expect(await names()).toEqual(['First', 'Marker']);
  });

  it('a cancelled queued caller never writes and rejects NOT_COMMITTED once its turn comes (A4)', async () => {
    const manager = new KnowledgeGraphManager(file);
    const gate = gateGraphRename();
    const first = manager.createEntities([entity('First')]);
    await gate.entered;
    const controller = new AbortController();
    const cancelled = manager.createEntities([entity('Cancelled')], controller.signal);
    controller.abort();
    gate.release();
    await first;
    await expect(cancelled).rejects.toThrow('NOT_COMMITTED');
    await manager.createEntities([entity('Marker')]);
    expect(await names()).toEqual(['First', 'Marker']);
  });

  it('keeps the graph unchanged when cancelled during preparation (A7)', async () => {
    const manager = new KnowledgeGraphManager(file);
    await manager.createEntities([entity('Alice')]);
    const controller = new AbortController();
    const writeFile = fs.writeFile;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      controller.abort();
      return writeFile(...args);
    });
    await expect(manager.createEntities([entity('Bob')], controller.signal))
      .rejects.toBeInstanceOf(MemoryRequestError);
    vi.restoreAllMocks();
    // A following job runs only after the cancelled one drained its temp file.
    await manager.createEntities([entity('Marker')]);
    expect(await fs.readdir(directory)).toEqual(['memory.jsonl']);
    expect(await names()).toEqual(['Alice', 'Marker']);
  });

  it('rechecks the deadline after a delayed ownership check (A8)', async () => {
    const manager = new KnowledgeGraphManager(file);
    let prepared = false;
    const writeFile = fs.writeFile;
    const stat = fs.stat;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      await writeFile(...args);
      if (String(args[0]).endsWith('.tmp')) prepared = true;
    });
    vi.spyOn(fs, 'stat').mockImplementation(async (...args: Parameters<typeof stat>) => {
      const result = await stat(...args);
      if (prepared && String(args[0]).includes('owner-')) {
        prepared = false;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      return result;
    });
    const rename = vi.spyOn(fs, 'rename');
    await expect(manager.createEntities([entity('Late')], AbortSignal.timeout(150)))
      .rejects.toThrow('NOT_COMMITTED');
    await manager.createEntities([entity('Marker')]);
    expect(rename.mock.calls.filter(([, to]) => to === file)).toHaveLength(1);
    expect(await names()).toEqual(['Marker']);
  });

  it('an abort during a gated rename still returns the real success; the next writer waits for the drain (A9, A10)', async () => {
    const manager = new KnowledgeGraphManager(file);
    const gate = gateGraphRename();
    const controller = new AbortController();
    const inflight = manager.createEntities([entity('InFlight')], controller.signal);
    await gate.entered;
    controller.abort(); // The rename is already dispatched and stays issued.

    let nextDone = false;
    const next = manager.createEntities([entity('Next')]).then(() => { nextDone = true; });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(nextDone).toBe(false);
    await expect(fs.stat(`${file}.lock`)).resolves.toBeDefined();

    gate.release();
    // The aborted caller still receives the real success: the abort never
    // happened before the rename's checks, so nothing settled early.
    await expect(inflight).resolves.toEqual([entity('InFlight')]);
    await next;
    expect(await names()).toEqual(['InFlight', 'Next']);
  }, 10000);

  it('keeps a confirmed commit when lease cleanup fails afterwards (A11, A14)', async () => {
    const manager = new KnowledgeGraphManager(file);
    const rename = fs.rename;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      if (String(to) === file) await fs.rm(`${file}.lock`, { recursive: true });
    });
    await expect(manager.createEntities([entity('Kept')]))
      .resolves.toEqual([entity('Kept')]);
    vi.restoreAllMocks();
    await manager.createEntities([entity('Marker')]);
    expect(await names()).toEqual(['Kept', 'Marker']);
  });

  it('bounds pending jobs until they drain (A12)', async () => {
    // Cap 3: the gated active job, a cancelled queued job and one live queued
    // job all charge the counter until they drain, so a fourth is rejected.
    const manager = new KnowledgeGraphManager(file, { maxPendingMutations: 3 });
    const gate = gateGraphRename();
    const active = manager.createEntities([entity('Active')]);
    await gate.entered;
    const controller = new AbortController();
    const cancelled = manager.createEntities([entity('Cancelled')], controller.signal);
    const queued = manager.createEntities([entity('Queued')]);
    controller.abort();
    await expect(manager.createEntities([entity('Rejected')])).rejects.toThrow('queue is full');

    gate.release();
    await expect(cancelled).rejects.toThrow('NOT_COMMITTED');
    await Promise.all([active, queued]);
    await manager.createEntities([entity('Recovered')]);
    expect(await names()).toEqual(['Active', 'Queued', 'Recovered']);
  });

  it('serves reads without waiting for a blocked writer and discards cancelled reads (A13)', async () => {
    const manager = new KnowledgeGraphManager(file);
    await manager.createEntities([entity('Alice')]);
    const gate = gateGraphRename();
    const writer = manager.createEntities([entity('Bob')]);
    await gate.entered;
    expect((await manager.searchNodes('alice')).entities).toHaveLength(1);
    expect((await manager.openNodes(['Alice'])).entities).toHaveLength(1);
    const controller = new AbortController();
    controller.abort();
    await expect(manager.readGraph(controller.signal)).rejects.toThrow();
    gate.release();
    await writer;
  });

  it('keeps later jobs running after a domain validation failure (A14)', async () => {
    const manager = new KnowledgeGraphManager(file);
    await expect(manager.createRelations([{ from: 'A', to: 'B', relationType: 'r' }]))
      .rejects.toThrow('Entity with name A not found');
    await manager.createEntities([entity('Marker')]);
    expect(await names()).toEqual(['Marker']);
  });

  it('reports a lock acquisition timeout as NOT_COMMITTED', async () => {
    const manager = new KnowledgeGraphManager(file, { requestTimeoutMs: 250 });
    const release = await holdLease();
    await expect(manager.createEntities([entity('Denied')])).rejects.toMatchObject({
      name: 'MemoryRequestError',
      state: 'NOT_COMMITTED',
    });
    await release();
    await manager.createEntities([entity('Marker')]);
    expect(await names()).toEqual(['Marker']);
  });

  it('surfaces allowlisted errnos but keeps unsupported codes generic', async () => {
    const manager = new KnowledgeGraphManager(file);
    await manager.createEntities([entity('Alice')]);
    const fail = () => manager.createEntities([entity('Bob')]).then(
      () => { throw new Error('unexpected success'); },
      (error: unknown) => error as MemoryRequestError,
    );

    const readFile = fs.readFile;
    vi.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
      if (args[0] === file) throw Object.assign(new Error(`EACCES: permission denied, open '${file}'`), { code: 'EACCES' });
      return readFile(...args);
    });
    let error = await fail();
    expect(error).toMatchObject({ name: 'MemoryRequestError', state: 'NOT_COMMITTED' });
    expect(error.message).toBe('NOT_COMMITTED: graph was not changed (EACCES)');
    expect((error.cause as { code?: string }).code).toBe('EACCES');
    vi.restoreAllMocks();

    const rename = fs.rename;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (to === file) throw Object.assign(new Error(`EIO: simulated rename failure for '${file}'`), { code: 'EIO' });
      return rename(from, to);
    });
    error = await fail();
    expect(error.state).toBe('COMMIT_UNKNOWN');
    expect(error.message).toBe('COMMIT_UNKNOWN: graph publication failed; read the graph before retrying (EIO)');
    vi.restoreAllMocks();

    // Unsupported codes and messages carrying paths stay out of the message;
    // the path-bearing cause is still reachable for local logs.
    vi.spyOn(fs, 'writeFile').mockImplementation(async () => {
      throw Object.assign(new Error(`EXDEV: cross-device link '${file}'`), { code: 'EXDEV' });
    });
    error = await fail();
    expect(error.message).toBe('NOT_COMMITTED: graph was not changed');
    expect((error.cause as Error).message).toContain(file);
    vi.restoreAllMocks();

    // Missing and non-string codes leave the generic message unchanged.
    expect(new MemoryRequestError('NOT_COMMITTED', 'x', { cause: new Error('boom') }).message).toBe('NOT_COMMITTED: x');
    expect(new MemoryRequestError('NOT_COMMITTED', 'x', { cause: Object.assign(new Error('b'), { code: 23 }) }).message).toBe('NOT_COMMITTED: x');
  });

  it('reports a rejected rename as COMMIT_UNKNOWN', async () => {
    const manager = new KnowledgeGraphManager(file);
    await manager.createEntities([entity('Alice')]);
    const rename = fs.rename;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (to === file) throw new Error('EXDEV: simulated rename failure');
      return rename(from, to);
    });
    await expect(manager.createEntities([entity('Bob')])).rejects.toMatchObject({
      name: 'MemoryRequestError',
      state: 'COMMIT_UNKNOWN',
    });
    vi.restoreAllMocks();
    // The temp file was cleaned up and the queue still works.
    expect(await fs.readdir(directory)).toEqual([file.substring(directory.length + 1)]);
    await manager.createEntities([entity('Carol')]);
    expect(await names()).toEqual(['Alice', 'Carol']);
  });

  it('keeps COMMIT_UNKNOWN when the lease is also lost while the rename fails', async () => {
    const manager = new KnowledgeGraphManager(file);
    const rename = fs.rename;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (to !== file) return rename(from, to);
      // A takeover while the publication is in flight, then the rename fails.
      await fs.rm(`${file}.lock`, { recursive: true });
      await fs.mkdir(`${file}.lock`);
      throw Object.assign(new Error('EIO: simulated rename failure'), { code: 'EIO' });
    });
    await expect(manager.createEntities([entity('Bob')])).rejects.toMatchObject({
      name: 'MemoryRequestError',
      state: 'COMMIT_UNKNOWN',
    });
  });
});

describe('lease acquisition lifetime', () => {
  it('stops backoff on cancellation without touching the holder (A5)', async () => {
    const release = await holdLease();
    const [owner] = await fs.readdir(`${file}.lock`);
    const controller = new AbortController();
    const entered = vi.fn();
    const waiting = withDirectoryLock(file, entered, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error('cancelled')), 50);
    await expect(waiting).rejects.toThrow('cancelled');
    expect(await fs.readdir(`${file}.lock`)).toEqual([owner]);
    expect(entered).not.toHaveBeenCalled();
    await release();
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it('releases a generation published after cancellation without running the operation (A6)', async () => {
    const controller = new AbortController();
    const rename = fs.rename;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      if (String(to) === `${file}.lock`) controller.abort(new Error('cancelled'));
    });
    const entered = vi.fn();
    await expect(withDirectoryLock(file, entered, { signal: controller.signal })).rejects.toThrow('cancelled');
    expect(entered).not.toHaveBeenCalled();
    await expect(fs.stat(`${file}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(withDirectoryLock(file, async () => 'successor', { timeoutMs: 1000 })).resolves.toBe('successor');
  });

  it('requires an explicit acquisition lifetime', async () => {
    await expect(withDirectoryLock(file, async () => {}, {})).rejects.toThrow('Invalid memory file lock timing');
  });

  it('keeps a resolved operation\'s result when the lease is lost at release', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(withDirectoryLock(file, async () => {
      // Simulate a lease takeover after the operation's own checks passed.
      await fs.rm(`${file}.lock`, { recursive: true });
      await fs.mkdir(`${file}.lock`);
      return 'resolved';
    }, { timeoutMs: 1000 })).resolves.toBe('resolved');
  });
});
