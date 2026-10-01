import { randomBytes, randomInt } from 'node:crypto';
import { promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

interface LeaseTiming {
  staleMs: number;
  updateMs: number;
}

// Acquisition has no clock of its own: callers supply their request lifetime
// as a signal, a timeout, or both. Neither affects a lease once it is held.
export interface LockOptions extends Partial<LeaseTiming> {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMING: LeaseTiming = { staleMs: 60000, updateMs: 10000 };
const OWNER_NAME = /^owner-[a-f0-9]{32}$/;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function sameFile(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function sameLease(a: Stats, b: Stats): boolean {
  return sameFile(a, b) && a.mtime.getTime() === b.mtime.getTime();
}

async function removeEmptyDirectory(directory: string): Promise<void> {
  try {
    await fs.rmdir(directory);
  } catch (error) {
    // A successor may already have atomically installed a NONEMPTY generation.
    if (!hasCode(error, 'ENOENT') && !hasCode(error, 'ENOTEMPTY') && !hasCode(error, 'EEXIST')) throw error;
  }
}

async function acquireGeneration(
  lockPath: string,
  timing: LeaseTiming,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<{ ownerPath: string; snapshot: Stats }> {
  const generation = randomBytes(16).toString('hex');
  const owner = `owner-${generation}`;
  const candidate = `${lockPath}.${generation}.tmp`;
  const candidateOwner = path.join(candidate, owner);
  let published = false;
  let backoff = 10;

  // Prepare identity BEFORE publication. mkdir(lockPath) followed by an owner
  // write leaves an empty initialization window that a stale remover can erase.
  signal?.throwIfAborted();
  await fs.mkdir(candidate);
  try {
    await fs.writeFile(candidateOwner, '', { flag: 'wx' });
    while (true) {
      signal?.throwIfAborted();
      if (performance.now() >= deadline) {
        throw new Error(`Timed out waiting for memory file lock: ${lockPath}`);
      }
      const now = new Date();
      await fs.utimes(candidateOwner, now, now);
      const snapshot = await fs.stat(candidateOwner);
      // A generation published after cancellation is released by the caller
      // before any protected operation starts.
      signal?.throwIfAborted();
      try {
        // Renaming a prepared directory cannot replace another nonempty one.
        // Empty directories are released generations, never initializing owners.
        await fs.rename(candidate, lockPath);
        published = true;
        return { ownerPath: path.join(lockPath, owner), snapshot };
      } catch (error) {
        const exists = hasCode(error, 'EEXIST') || hasCode(error, 'ENOTEMPTY');
        // Windows may report access errors when the destination directory exists.
        if (!exists && !hasCode(error, 'EACCES') && !hasCode(error, 'EPERM')) throw error;
        let entries: string[];
        try {
          entries = await fs.readdir(lockPath);
        } catch (inspectionError) {
          if (hasCode(inspectionError, 'ENOENT') && exists) continue;
          throw exists ? inspectionError : error;
        }
        if (entries.length === 0) {
          await removeEmptyDirectory(lockPath);
          continue;
        }
        if (entries.length !== 1 || !OWNER_NAME.test(entries[0])) {
          throw new Error(`Unrecognized memory lock directory: ${lockPath}`);
        }
        // The unique filename is the deletion authority. Even if another
        // reclaimer wins first, this path cannot name a successor's marker.
        const observedOwner = path.join(lockPath, entries[0]);
        try {
          const observed = await fs.stat(observedOwner);
          if (observed.mtimeMs < Date.now() - timing.staleMs) {
            const current = await fs.stat(observedOwner);
            if (sameLease(observed, current)) {
              await fs.unlink(observedOwner);
              await removeEmptyDirectory(lockPath);
              continue; // Reclaiming a generation does not acquire its successor.
            }
          }
        } catch (inspectionError) {
          if (hasCode(inspectionError, 'ENOENT')) continue;
          throw inspectionError;
        }
      }
      const remaining = deadline - performance.now();
      if (remaining > 0) {
        try {
          await sleep(Math.min(remaining, randomInt(1, backoff + 1)), undefined, { signal });
        } catch (error) {
          signal?.throwIfAborted();
          throw error;
        }
      }
      backoff = Math.min(backoff * 2, 250);
    }
  } finally {
    if (!published) {
      await fs.unlink(candidateOwner).catch(error => {
        if (!hasCode(error, 'ENOENT')) console.error('Failed to clean memory lock candidate:', error);
      });
      await removeEmptyDirectory(candidate).catch(error => {
        console.error('Failed to clean memory lock candidate:', error);
      });
    }
  }
}

// A cooperative generation/mtime lease, not storage-enforced fencing. Every
// writer must use this protocol and timing policy; see the README for network
// filesystem assumptions. The data file need not exist before its first write.
export async function withDirectoryLock<T>(
  file: string,
  operation: (assertOwned: () => Promise<void>) => Promise<T>,
  options: LockOptions,
): Promise<T> {
  const { signal, timeoutMs = Infinity, ...lease } = options;
  const timing: LeaseTiming = { ...DEFAULT_TIMING, ...lease };
  if (Object.values(timing).some(value => !Number.isFinite(value) || value <= 0)
    || timing.updateMs * 2 > timing.staleMs || Number.isNaN(timeoutMs) || timeoutMs <= 0
    || (!signal && timeoutMs === Infinity)) {
    throw new Error('Invalid memory file lock timing');
  }
  const lockPath = `${path.resolve(file)}.lock`;
  const acquired = await acquireGeneration(lockPath, timing, performance.now() + timeoutMs, signal);
  const ownerPath = acquired.ownerPath;
  let snapshot = acquired.snapshot;
  let lost: Error | undefined;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let lastUpdate = performance.now();
  let maintenance = Promise.resolve();

  function compromise(cause: unknown): Error {
    lost ??= new Error(`Memory file lock lost: ${lockPath}`, { cause });
    return lost;
  }

  // Serialize heartbeat I/O and pre-commit checks so our own heartbeat cannot
  // appear to be another owner's update. Release drains this queue as well.
  function serialize(action: () => Promise<void>): Promise<void> {
    const result = maintenance.then(action);
    maintenance = result.then(() => {}, () => {});
    return result;
  }

  async function inspect(): Promise<void> {
    if (lost) throw lost;
    const current = await fs.stat(ownerPath);
    if (!sameLease(snapshot, current)) throw compromise('Lock generation was changed or replaced');
  }

  function schedule(delay: number): void {
    if (stopped || lost) return;
    timer = setTimeout(() => {
      if (stopped || lost) return;
      void serialize(async () => {
        await inspect();
        const now = new Date();
        await fs.utimes(ownerPath, now, now);
        const updated = await fs.stat(ownerPath);
        if (!sameFile(snapshot, updated)) throw compromise('Lock generation was replaced');
        // Read back the filesystem's actual timestamp precision rather than
        // assuming that it preserved every millisecond supplied to utimes.
        snapshot = updated;
        lastUpdate = performance.now();
      }).then(
        () => schedule(timing.updateMs),
        error => {
          if (lost || hasCode(error, 'ENOENT') || performance.now() - lastUpdate >= timing.staleMs) {
            compromise(error);
          } else {
            schedule(Math.min(1000, timing.updateMs));
          }
        },
      );
    }, delay);
    timer.unref();
  }

  const assertOwned = (): Promise<void> => serialize(async () => {
    if (stopped) throw new Error(`Memory file lock already released: ${lockPath}`);
    try {
      await inspect();
    } catch (error) {
      throw compromise(error);
    }
  });

  // Once held, renewal follows the operation's actual execution, never the
  // caller's signal: issued I/O must drain before the lease can be released.
  schedule(timing.updateMs);
  let result: T;
  try {
    await assertOwned();
    signal?.throwIfAborted();
    result = await operation(assertOwned);
  } finally {
    stopped = true;
    clearTimeout(timer);
    await maintenance;
    if (!lost) {
      try {
        await inspect();
        await fs.unlink(ownerPath);
        await removeEmptyDirectory(lockPath);
      } catch (error) {
        if (hasCode(error, 'ENOENT')) compromise(error);
        // Preserve the operation's own error when cleanup alone fails.
        // Never recursively remove a lock.
        if (!lost) console.error('Failed to release memory file lock:', error);
      }
    }
  }
  // Reached only when the operation resolved; a failed operation's own error
  // has already propagated, so a loss found at release never relabels it.
  // A resolved operation is final: a loss discovered now is only logged.
  if (lost) console.error('Memory file lock lost after a resolved operation:', lost);
  return result;
}
