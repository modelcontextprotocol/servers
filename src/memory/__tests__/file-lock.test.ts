import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { withDirectoryLock } from '../file-lock.js';

let directory: string;
let file: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-memory-lease-'));
  file = path.join(directory, 'memory.jsonl');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

// Obtain the fixture through the public lease API so it follows the on-disk
// protocol, then model a holder that disappeared without releasing it. The
// operation itself resolves (it parks the lease); the loss surfaces only at
// release, where a resolved operation is final and the lease stays parked.
async function abandonLease(): Promise<void> {
  const lockPath = `${file}.lock`;
  const parked = `${file}.abandoned`;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  await withDirectoryLock(file, () => fs.rename(lockPath, parked), { timeoutMs: 1000 });
  errors.mockRestore();
  await fs.rename(parked, lockPath);
  const old = new Date(Date.now() - 10000);
  await fs.utimes(lockPath, old, old);
  for (const entry of await fs.readdir(lockPath)) {
    await fs.utimes(path.join(lockPath, entry), old, old);
  }
}

describe('memory directory leases', () => {
  it('does not let a delayed stale remover delete a newly acquired lease', async () => {
    await abandonLease();
    const lockPath = `${file}.lock`;
    const rmdir = fs.rmdir;
    const timing = { staleMs: 500, updateMs: 50, timeoutMs: 2000 };
    let replacement: Promise<void> | undefined;
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    let intercepted = false;
    let active = false;
    let overlapped = false;

    vi.spyOn(fs, 'rmdir').mockImplementation(async (target, options) => {
      if (String(target) === lockPath && !intercepted) {
        intercepted = true;
        // A peer removes the old generation and acquires a replacement before
        // this contender's already-authorized rmdir reaches the filesystem.
        await rmdir(target, options);
        replacement = withDirectoryLock(file, async () => {
          active = true;
          entered();
          await sleep(150);
          active = false;
        }, timing);
        await ready;
      }
      return rmdir(target, options);
    });

    const first = await Promise.allSettled([
      withDirectoryLock(file, async () => { overlapped = active; }, timing),
    ]);
    const second = await Promise.allSettled([replacement]);
    expect(intercepted).toBe(true);
    expect(overlapped).toBe(false);
    expect(first[0].status).toBe('fulfilled');
    expect(second[0].status).toBe('fulfilled');
  });

  it('does not adopt a replacement installed before acquisition finishes', async () => {
    const lockPath = `${file}.lock`;
    const mkdir = fs.mkdir;
    const rename = fs.rename;
    let replaced = false;
    let entered = false;
    const replace = async () => {
      replaced = true;
      await fs.rm(lockPath, { recursive: true });
      await mkdir(lockPath);
    };
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      if (String(to) === lockPath && !replaced) await replace();
    });
    await expect(withDirectoryLock(file, async () => { entered = true; }, { timeoutMs: 1000 }))
      .rejects.toThrow('Memory file lock lost');
    expect(entered).toBe(false);
    expect((await fs.stat(lockPath)).isDirectory()).toBe(true);
  });

  it('times out without entering another holder\'s critical section', async () => {
    const timing = { staleMs: 1000, updateMs: 100, timeoutMs: 1000 };
    await withDirectoryLock(file, async () => {
      await expect(withDirectoryLock(file, () => fs.writeFile(file, 'must not be written'), {
        ...timing,
        timeoutMs: 25,
      })).rejects.toThrow('Timed out waiting');
      await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await fs.stat(`${file}.lock`)).isDirectory()).toBe(true);
    }, timing);
  });

  it('accepts the timestamp precision actually stored by the filesystem', async () => {
    const utimes = fs.utimes;
    let holding = false;
    let updated!: () => void;
    const heartbeat = new Promise<void>(resolve => { updated = resolve; });
    vi.spyOn(fs, 'utimes').mockImplementation(async (target, atime, mtime) => {
      const seconds = mtime instanceof Date ? mtime.getTime() / 1000 : Number(mtime);
      await utimes(target, atime, Math.floor(seconds));
      if (holding) updated();
    });
    await expect(withDirectoryLock(file, async assertOwned => {
      holding = true;
      await heartbeat;
      await assertOwned();
      return 'still owned';
    }, { staleMs: 3000, updateMs: 20, timeoutMs: 100 })).resolves.toBe('still owned');
  });

  it('stops renewing and leaves a replacement lease untouched', async () => {
    let replacementMtime = 0;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(withDirectoryLock(file, async () => {
      await fs.rm(`${file}.lock`, { recursive: true });
      await fs.mkdir(`${file}.lock`);
      const replacementTime = new Date(Date.now() + 10000);
      await fs.utimes(`${file}.lock`, replacementTime, replacementTime);
      replacementMtime = (await fs.stat(`${file}.lock`)).mtimeMs;
      await sleep(80);
    }, { staleMs: 1000, updateMs: 20, timeoutMs: 100 })).resolves.toBeUndefined();
    errors.mockRestore();
    expect((await fs.stat(`${file}.lock`)).mtimeMs).toBe(replacementMtime);
  });

  it('does not mask an operation error when releasing its directory also fails', async () => {
    const failure = new Error('operation failed');
    vi.spyOn(fs, 'rmdir').mockRejectedValueOnce(new Error('release failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(withDirectoryLock(file, async () => { throw failure; }, { timeoutMs: 1000 })).rejects.toBe(failure);
  });

  it('keeps a live holder exclusive for longer than the stale interval', async () => {
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const timing = { staleMs: 100, updateMs: 20, timeoutMs: 1000 };
    let active = false;
    let overlapped = false;
    const first = withDirectoryLock(file, async () => {
      active = true;
      entered();
      await sleep(350);
      active = false;
    }, timing);
    await ready;
    const second = withDirectoryLock(file, async () => { overlapped = active; }, timing);
    await Promise.all([first, second]);
    expect(overlapped).toBe(false);
  });

  it('does not run the operation when publication resolves after the deadline', async () => {
    const lockPath = `${file}.lock`;
    const rename = fs.rename;
    const realNow = performance.now.bind(performance);
    let clock = 0;
    let entered = false;
    vi.spyOn(performance, 'now').mockImplementation(() => clock || realNow());
    // Model a publish that started inside the budget but resolved past it.
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      const result = await rename(from, to);
      if (String(to) === lockPath) clock = realNow() + 60000;
      return result;
    });
    await expect(withDirectoryLock(file, async () => { entered = true; }, { timeoutMs: 30000 }))
      .rejects.toThrow('Timed out waiting');
    expect(entered).toBe(false);
    // The rejected generation released itself; nothing is left behind.
    expect(await fs.readdir(directory)).toEqual([]);
    vi.restoreAllMocks();
    // The next contender is not blocked by the rejected generation.
    await expect(withDirectoryLock(file, async () => 'next', { timeoutMs: 1000 })).resolves.toBe('next');
  });

  it('recovers an abandoned lease without requiring the data file to exist', async () => {
    await abandonLease();

    await expect(withDirectoryLock(file, async () => 'recovered', {
      staleMs: 500,
      updateMs: 50,
      timeoutMs: 100,
    })).resolves.toBe('recovered');
    await expect(fs.stat(`${file}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
