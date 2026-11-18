// Unit tests for withFileLock, the lock file that orders mutations from
// separate server processes sharing one graph file (#4797): mutual exclusion,
// release, breaking an abandoned lock, and giving up on a held one; and the
// exit-time release of the locks this process still holds (#5485); and the
// guard that orders acquiring, releasing and breaking against each other
// (#5565).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fsSync, { promises as fs } from "fs";
import { syncBuiltinESMExports } from "module";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import {
  KnowledgeGraphManager,
  heldLockPaths,
  installLockCleanup,
  releaseHeldLocks,
  withFileLock,
} from "../index.js";
import { makeTempGraph } from "./helpers.js";

const fast = { staleMs: 60_000, timeoutMs: 100, retryMs: 5 };

describe("withFileLock", () => {
  let dir: string;
  let lockPath: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempGraph());
    lockPath = path.join(dir, "memory.jsonl.lock");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  async function exists(file: string): Promise<boolean> {
    return fs.access(file).then(
      () => true,
      () => false,
    );
  }

  it("holds the lock file while the operation runs and removes it after", async () => {
    const result = await withFileLock(lockPath, async () => {
      const owner = JSON.parse(await fs.readFile(lockPath, "utf-8"));
      expect(owner).toMatchObject({
        pid: process.pid,
        hostname: os.hostname(),
      });
      return 42;
    });
    expect(result).toBe(42);
    expect(await exists(lockPath)).toBe(false);
  });

  it("releases the lock when the operation fails", async () => {
    await expect(
      withFileLock(lockPath, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await exists(lockPath)).toBe(false);
  });

  it("runs overlapping holders one at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const hold = (name: string) =>
      withFileLock(
        lockPath,
        async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          order.push(`${name} start`);
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push(`${name} end`);
          active -= 1;
        },
        { retryMs: 2 },
      );

    await Promise.all([hold("a"), hold("b"), hold("c")]);

    expect(maxActive).toBe(1);
    expect(order).toHaveLength(6);
    for (let i = 0; i < 6; i += 2) {
      expect(order[i + 1]).toBe(order[i].replace("start", "end"));
    }
  });

  it("breaks a lock whose owner on this host has exited", async () => {
    const { pid } = spawnSync(process.execPath, ["-e", ""]);
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid, hostname: os.hostname(), token: "dead" }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
    expect(console.error).toHaveBeenCalledWith(
      `Breaking stale memory file lock ${lockPath}`,
    );
    expect(await exists(lockPath)).toBe(false);
  });

  it("breaks a lock older than staleMs", async () => {
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: 1, hostname: "another-host", token: "old" }),
    );
    const longAgo = new Date(Date.now() - 120_000);
    await fs.utimes(lockPath, longAgo, longAgo);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
    expect(await exists(lockPath)).toBe(false);
  });

  it.each([
    [
      "a live owner on this host",
      JSON.stringify({ pid: process.pid, hostname: os.hostname() }),
    ],
    [
      "an owner on another host",
      JSON.stringify({ pid: 1, hostname: "another-host" }),
    ],
    ["a lock still being written", ""],
    ["a lock with no owner", "null"],
  ])(
    "waits on a fresh lock held by %s and then times out",
    async (_, contents) => {
      await fs.writeFile(lockPath, contents);
      const operation = vi.fn(async () => "ran");

      await expect(withFileLock(lockPath, operation, fast)).rejects.toThrow(
        `Timed out after 100 ms waiting for the memory file lock ${lockPath}`,
      );
      expect(operation).not.toHaveBeenCalled();
      expect(await fs.readFile(lockPath, "utf-8")).toBe(contents);
    },
  );

  async function writeStaleLock(contents = "stale"): Promise<void> {
    await fs.writeFile(lockPath, contents);
    const longAgo = new Date(Date.now() - 120_000);
    await fs.utimes(lockPath, longAgo, longAgo);
  }

  // Run hook once, the first time fs.open is called with these arguments.
  function onceOnOpen(
    file: string,
    flags: string,
    hook: () => Promise<void>,
  ): void {
    const realOpen = fs.open;
    let fired = false;
    vi.spyOn(fs, "open").mockImplementation((async (
      ...args: Parameters<typeof fs.open>
    ) => {
      if (!fired && args[0] === file && args[1] === flags) {
        fired = true;
        await hook();
      }
      return realOpen(...args);
    }) as typeof fs.open);
  }

  it("does not break a lock another waiter replaced while it was judged stale", async () => {
    await writeStaleLock();
    // Another waiter breaks the stale lock and takes it after this waiter
    // judged it stale but before this waiter takes the breaking guard.
    onceOnOpen(`${lockPath}.break`, "wx", async () => {
      await fs.unlink(lockPath);
      await fs.writeFile(lockPath, "fresh");
    });

    await expect(
      withFileLock(lockPath, async () => "ran", fast),
    ).rejects.toThrow("Timed out");
    expect(await fs.readFile(lockPath, "utf-8")).toBe("fresh");
    expect(await fs.readdir(dir)).toEqual(["memory.jsonl.lock"]);
  });

  // Run hook once, just before the breaker moves the lock it judged stale
  // aside: after its staleness re-check, before the removal (#5560).
  function onceBeforeRemoval(hook: () => Promise<void>): void {
    const realRename = fs.rename;
    let fired = false;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (!fired && from === lockPath) {
        fired = true;
        await hook();
      }
      return realRename(from, to);
    });
  }

  it("keeps a successor's lock placed between the staleness re-check and the removal (#5560)", async () => {
    await writeStaleLock();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let successor: { ino: bigint; mtimeMs: bigint } | undefined;
    // The stale lock's holder comes back and releases it, and a successor
    // takes a live lock at the same path, after the breaker's re-check under
    // its guard and before the breaker removes what it judged.
    onceBeforeRemoval(async () => {
      await fs.unlink(lockPath);
      await fs.writeFile(lockPath, "successor");
      successor = await fs.stat(lockPath, { bigint: true });
    });
    const operation = vi.fn(async () => "ran");

    await expect(withFileLock(lockPath, operation, fast)).rejects.toThrow(
      "Timed out",
    );

    // The breaker did not acquire the lock, and broke nothing.
    expect(operation).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    // The successor's lock is the same file, untouched: not a copy, and not
    // refreshed or aged by its trip aside.
    expect(successor).toBeDefined();
    expect(await fs.readFile(lockPath, "utf-8")).toBe("successor");
    const kept = await fs.stat(lockPath, { bigint: true });
    expect(kept.ino).toBe(successor?.ino);
    expect(kept.mtimeMs).toBe(successor?.mtimeMs);
    // Neither the breaking guard nor the aside file is left behind.
    expect(await fs.readdir(dir)).toEqual(["memory.jsonl.lock"]);
  });

  it("acquires the lock at once when its holder releases it between the re-check and the removal", async () => {
    await writeStaleLock();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    onceBeforeRemoval(() => fs.unlink(lockPath));

    expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
    // Nothing was broken: the lock was gone before the breaker could take it.
    expect(error).not.toHaveBeenCalled();
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("removes the stale lock itself, leaving no aside file", async () => {
    await writeStaleLock();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unlink = vi.spyOn(fs, "unlink");

    await withFileLock(
      lockPath,
      async () => {
        // The lock path was never unlinked while the stale lock stood there:
        // the stale file was moved aside and deleted under its own name.
        const removed = unlink.mock.calls.map(([file]) => String(file));
        expect(removed).not.toContain(lockPath);
        expect(
          removed.filter((file) => /\.lock\.[0-9a-f]{16}\.stale$/.test(file)),
        ).toHaveLength(1);
        expect(await fs.readdir(dir)).toEqual(["memory.jsonl.lock"]);
      },
      fast,
    );
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("leaves a stale lock to the waiter already breaking it", async () => {
    await writeStaleLock();
    await fs.writeFile(`${lockPath}.break`, "");

    await expect(
      withFileLock(lockPath, async () => "ran", fast),
    ).rejects.toThrow("Timed out");
    expect(await fs.readFile(lockPath, "utf-8")).toBe("stale");
  });

  it("clears a breaking guard left by a crash, then breaks the stale lock", async () => {
    await writeStaleLock();
    const breakerPath = `${lockPath}.break`;
    await fs.writeFile(breakerPath, "");
    const longAgo = new Date(Date.now() - 120_000);
    await fs.utimes(breakerPath, longAgo, longAgo);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("fails when the breaking guard cannot be created", async () => {
    await writeStaleLock();
    const realOpen = fs.open;
    vi.spyOn(fs, "open").mockImplementation((async (
      ...args: Parameters<typeof fs.open>
    ) => {
      if (args[0] === `${lockPath}.break`) {
        throw Object.assign(new Error("EACCES: simulated"), {
          code: "EACCES",
        });
      }
      return realOpen(...args);
    }) as typeof fs.open);

    await expect(
      withFileLock(lockPath, async () => "ran", fast),
    ).rejects.toThrow("EACCES: simulated");
  });

  it("acquires the lock at once when the holder releases it mid-check", async () => {
    await fs.writeFile(lockPath, "held");
    onceOnOpen(lockPath, "r", () => fs.unlink(lockPath));

    expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
  });

  it("keeps a lock held longer than staleMs fresh, so it is not broken", async () => {
    const opts = { staleMs: 100, timeoutMs: 5_000, retryMs: 5 };
    const order: string[] = [];
    const long = withFileLock(
      lockPath,
      async () => {
        order.push("long start");
        await new Promise((resolve) => setTimeout(resolve, 400));
        order.push("long end");
      },
      opts,
    );
    // Let the long holder take the lock before the waiter starts.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const waiter = withFileLock(
      lockPath,
      async () => {
        order.push("waiter");
      },
      opts,
    );

    await Promise.all([long, waiter]);
    expect(order).toEqual(["long start", "long end", "waiter"]);
  });

  it("stops refreshing a lock that was broken and re-taken while it ran (#5418)", async () => {
    // Heartbeat every 100 ms, wide enough that the replacement below finishes
    // before the next beat; the operation outlives several beats.
    const opts = { staleMs: 200, timeoutMs: 5_000, retryMs: 5 };
    const old = new Date(Date.now() - 60_000);
    const realUtimes = fs.utimes;
    let replaced!: () => void;
    const replacement = new Promise<void>((resolve) => (replaced = resolve));
    // Our first heartbeat refreshes our own lock; right after it, another
    // process breaks the lock as stale and re-takes it with its own token.
    const utimes = vi
      .spyOn(fs, "utimes")
      .mockImplementationOnce(async (...args) => {
        await realUtimes(...args);
        await fs.writeFile(lockPath, "someone else");
        await realUtimes(lockPath, old, old);
        replaced();
      });
    const readFile = vi.spyOn(fs, "readFile");
    const lockReads = () =>
      readFile.mock.calls.filter(([file]) => file === lockPath).length;

    await withFileLock(
      lockPath,
      async () => {
        await replacement;
        readFile.mockClear();
        // Several heartbeats later, only the first one, on our own lock, has
        // touched the file: the next one read the new owner's token and stopped
        // the interval, so the beats after it do not even read the file.
        await new Promise((resolve) => setTimeout(resolve, 250));
        expect(utimes).toHaveBeenCalledTimes(1);
        const reads = lockReads();
        expect(reads).toBeGreaterThan(0);
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(lockReads()).toBe(reads);
      },
      opts,
    );

    expect(utimes).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(lockPath, "utf-8")).toBe("someone else");
    const { mtimeMs } = await fs.stat(lockPath);
    expect(mtimeMs).toBeLessThan(Date.now() - 30_000);
  });

  it("removes the lock it created when writing it fails", async () => {
    const realOpen = fs.open;
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
      const handle = await realOpen(...args);
      handle.writeFile = async () => {
        throw new Error("EIO: simulated write failure");
      };
      // The cleanup's own close failing must not mask the write failure.
      const realClose = handle.close.bind(handle);
      handle.close = async () => {
        await realClose();
        throw new Error("EIO: simulated close failure");
      };
      return handle;
    });

    await expect(withFileLock(lockPath, async () => "ran")).rejects.toThrow(
      "EIO: simulated write failure",
    );
    expect(await exists(lockPath)).toBe(false);
  });

  it("leaves a lock it no longer owns in place on release", async () => {
    await withFileLock(lockPath, async () => {
      await fs.writeFile(lockPath, "someone else");
    });
    expect(await fs.readFile(lockPath, "utf-8")).toBe("someone else");
  });

  it("releases quietly when its lock is already gone", async () => {
    expect(
      await withFileLock(lockPath, async () => {
        await fs.unlink(lockPath);
        return "ran";
      }),
    ).toBe("ran");
    expect(await exists(lockPath)).toBe(false);
  });

  it("fails when the lock file cannot be created", async () => {
    const missing = path.join(dir, "no-such-dir", "memory.jsonl.lock");
    await expect(withFileLock(missing, async () => "ran")).rejects.toThrow(
      "ENOENT",
    );
  });

  it("fails when the existing lock cannot be read", async () => {
    await fs.mkdir(lockPath);
    await expect(
      withFileLock(lockPath, async () => "ran", fast),
    ).rejects.toThrow("EISDIR");
  });

  it("waits, on Windows, for a lock file another process is still deleting", async () => {
    // Windows fails an open of a file pending deletion with EPERM, not EEXIST.
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const pendingDelete = Object.assign(new Error("EPERM"), { code: "EPERM" });
    const realOpen = fs.open.bind(fs);
    let calls = 0;
    vi.spyOn(fs, "open").mockImplementation(((
      ...args: Parameters<typeof fs.open>
    ) => {
      calls += 1;
      // The create, then the stale check's read, both see the pending delete.
      return calls <= 2 ? Promise.reject(pendingDelete) : realOpen(...args);
    }) as typeof fs.open);

    await expect(
      withFileLock(lockPath, async () => "done", fast),
    ).resolves.toBe("done");
    expect(calls).toBeGreaterThan(2);
    expect(await exists(lockPath)).toBe(false);
  });

  it("does not treat EPERM as a held lock off Windows", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const denied = Object.assign(new Error("EPERM"), { code: "EPERM" });
    vi.spyOn(fs, "open").mockRejectedValue(denied);

    await expect(withFileLock(lockPath, async () => "done", fast)).rejects.toBe(
      denied,
    );
  });

  it("orders two managers' mutations on one graph file", async () => {
    const filePath = path.join(dir, "memory.jsonl");
    const managers = [
      new KnowledgeGraphManager(filePath, { retryMs: 1 }),
      new KnowledgeGraphManager(filePath, { retryMs: 1 }),
    ];
    const names = Array.from({ length: 20 }, (_, i) => `entity-${i}`);

    await Promise.all(
      names.map((name, i) =>
        managers[i % 2].createEntities([
          { name, entityType: "thing", observations: [] },
        ]),
      ),
    );

    const graph = await managers[0].readGraph();
    expect(graph.entities.map((e) => e.name).sort()).toEqual([...names].sort());
    expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
  });

  // The hand-off windows of #5565. Each interleaving is injected at an exact
  // file-system call, so none depends on timing. A lock that replaces the one
  // a breaker judged, while that breaker holds the guard, can only come from
  // a writer that does not take part in the guard (a server older than this
  // fix), so those tests plant it, or hide the guard from the writer.
  describe("hand-off windows (#5565)", () => {
    const guardPath = () => `${lockPath}.break`;

    // Run hook once, while the lock the breaker took is aside: after the
    // rename that took it, before it is deleted or put back.
    function onceLockAside(hook: () => Promise<void>): void {
      const realStat = fs.stat;
      let fired = false;
      vi.spyOn(fs, "stat").mockImplementation((async (
        ...args: Parameters<typeof fs.stat>
      ) => {
        if (!fired && String(args[0]).endsWith(".stale")) {
          fired = true;
          await hook();
        }
        return realStat(...args);
      }) as typeof fs.stat);
    }

    // Watch fs.open. `opened(file, flags)` resolves once the next such open
    // has settled; `hideOnce(file, flags)` makes the next such open report
    // no file.
    function watchOpens(): {
      opened: (file: string, flags: string) => Promise<void>;
      hideOnce: (file: string, flags: string) => void;
    } {
      const realOpen = fs.open;
      const waiters: { key: string; resolve: () => void }[] = [];
      const hidden: string[] = [];
      vi.spyOn(fs, "open").mockImplementation((async (
        ...args: Parameters<typeof fs.open>
      ) => {
        const key = `${String(args[0])} ${String(args[1])}`;
        const hide = hidden.indexOf(key);
        if (hide !== -1) {
          hidden.splice(hide, 1);
          throw Object.assign(new Error("ENOENT: hidden"), { code: "ENOENT" });
        }
        try {
          return await realOpen(...args);
        } finally {
          for (const waiter of waiters.splice(0)) {
            if (waiter.key === key) {
              waiter.resolve();
            } else {
              waiters.push(waiter);
            }
          }
        }
      }) as typeof fs.open);
      return {
        opened: (file, flags) =>
          new Promise<void>((resolve) =>
            waiters.push({ key: `${file} ${flags}`, resolve }),
          ),
        hideOnce: (file, flags) => {
          hidden.push(`${file} ${flags}`);
        },
      };
    }

    it("does not let a writer that created the lock while a live one was aside run beside its holder", async () => {
      await writeStaleLock();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const opens = watchOpens();
      let successor: { ino: bigint } | undefined;
      // A successor's live lock replaces the stale one after the breaker
      // judged it, so the breaker takes the live lock aside by mistake.
      onceBeforeRemoval(async () => {
        await fs.unlink(lockPath);
        await fs.writeFile(lockPath, "successor");
        successor = await fs.stat(lockPath, { bigint: true });
      });
      // While it is aside the lock path is free, and a third writer creates
      // its own lock there.
      let thirdRan!: () => void;
      const thirdStarted = new Promise<void>((resolve) => (thirdRan = resolve));
      const third = vi.fn(async () => {
        thirdRan();
        return "third ran";
      });
      let thirdOutcome: Promise<unknown> | undefined;
      onceLockAside(async () => {
        const sawBreak = opens.opened(guardPath(), "r");
        thirdOutcome = withFileLock(lockPath, third, fast).catch(
          (error: unknown) => error,
        );
        // Go on once the third writer has either run (the defect) or found
        // the break in progress and is waiting it out.
        await Promise.race([thirdStarted, sawBreak]);
      });

      await expect(
        withFileLock(lockPath, async () => "breaker ran", fast),
      ).rejects.toThrow("Timed out");
      const outcome = await thirdOutcome;

      // The third writer never ran beside the successor: its lock was
      // overwritten by the restored one, it noticed, and it went on waiting.
      expect(third).not.toHaveBeenCalled();
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toContain("Timed out");
      expect(await fs.readFile(lockPath, "utf-8")).toBe("successor");
      expect((await fs.stat(lockPath, { bigint: true })).ino).toBe(
        successor?.ino,
      );
      expect(heldLockPaths()).toEqual([]);
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl.lock"]);
    });

    it("does not restore a lock its holder released while it was aside", async () => {
      await writeStaleLock();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const opens = watchOpens();
      let finish!: () => void;
      const mayFinish = new Promise<void>((resolve) => (finish = resolve));
      let successor: Promise<string> | undefined;
      // A successor takes a live lock after the breaker judged the stale one.
      // It does not wait out the break, as a server older than this fix would
      // not: the guard is hidden from it.
      onceBeforeRemoval(async () => {
        await fs.unlink(lockPath);
        opens.hideOnce(guardPath(), "r");
        let holding!: () => void;
        const held = new Promise<void>((resolve) => (holding = resolve));
        successor = withFileLock(lockPath, async () => {
          holding();
          await mayFinish;
          return "successor ran";
        });
        await held;
      });
      // The successor finishes while its lock is aside.
      onceLockAside(async () => {
        const releaseWaits = opens.opened(guardPath(), "wx");
        finish();
        // Go on once its release has either finished without finding its
        // lock (the defect) or is waiting for the break to end.
        await Promise.race([successor, releaseWaits]);
      });

      // The breaker put the successor's lock back, the successor's release
      // then removed it, and the waiter acquired at once: no lock nobody
      // holds is left for it to wait out.
      expect(await withFileLock(lockPath, async () => "waiter ran", fast)).toBe(
        "waiter ran",
      );
      expect(await successor).toBe("successor ran");
      expect(heldLockPaths()).toEqual([]);
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("does not let a release remove a lock broken and re-taken after its comparison", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const realUnlink = fs.unlink;
      let letNextFinish!: () => void;
      const nextMayFinish = new Promise<void>(
        (resolve) => (letNextFinish = resolve),
      );
      let nextRan!: () => void;
      const nextStarted = new Promise<void>((resolve) => (nextRan = resolve));
      let lockWhileNextRan: boolean | undefined;
      const next = vi.fn(async () => {
        nextRan();
        await nextMayFinish;
        lockWhileNextRan = await exists(lockPath);
        return "next ran";
      });
      let nextOutcome: Promise<unknown> | undefined;
      let fired = false;

      await withFileLock(lockPath, async () => {
        // The holder's release has compared its token and is about to remove
        // the lock. Its lock has gone unrefreshed past another writer's stale
        // timeout, and that writer tries to break and re-take it right now.
        vi.spyOn(fs, "unlink").mockImplementation(async (file) => {
          if (!fired && file === lockPath) {
            fired = true;
            const old = new Date(Date.now() - 600_000);
            await fs.utimes(lockPath, old, old);
            nextOutcome = withFileLock(lockPath, next, {
              staleMs: 30_000,
              timeoutMs: 100,
              retryMs: 5,
            }).catch((error: unknown) => error);
            // Go on once the other writer has either taken the lock (the
            // defect) or given up waiting for the release to end.
            await Promise.race([nextStarted, nextOutcome]);
          }
          return realUnlink(file);
        });
      });
      letNextFinish();
      const outcome = await nextOutcome;

      // The other writer could not break the lock mid-release, so the release
      // removed its own lock and nothing else.
      expect(next).not.toHaveBeenCalled();
      expect(lockWhileNextRan).toBeUndefined();
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toContain("Timed out");
      expect(heldLockPaths()).toEqual([]);
      expect(await fs.readdir(dir)).toEqual([]);
    });

    // The same interleaving at exit, where the release is synchronous, so
    // only another process can act inside it: a child running the built
    // server's withFileLock tries to break the lock and take it, and then
    // exits without releasing. Like the SIGTERM test below, it runs the last
    // build of dist/.
    it("does not let the release at exit remove a lock broken and re-taken after its comparison", async () => {
      const distIndex = pathToFileURL(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
          "dist",
          "index.js",
        ),
      ).href;
      const script = `
        const { withFileLock } = await import(${JSON.stringify(distIndex)});
        try {
          await withFileLock(
            ${JSON.stringify(lockPath)},
            async () => process.exit(0),
            { staleMs: 30000, timeoutMs: 200, retryMs: 5 },
          );
        } catch (error) {
          console.log(error.message);
          process.exit(3);
        }
      `;
      const realUnlinkSync = fsSync.unlinkSync;
      let other: ReturnType<typeof spawnSync> | undefined;
      vi.spyOn(fsSync, "unlinkSync").mockImplementation((file) => {
        if (!other && file === lockPath) {
          // The exiting holder has compared its token and is about to remove
          // the lock, which has gone unrefreshed past the other process's
          // stale timeout.
          const old = new Date(Date.now() - 600_000);
          fsSync.utimesSync(lockPath, old, old);
          other = spawnSync(
            process.execPath,
            ["--input-type=module", "-e", script],
            { encoding: "utf-8" },
          );
        }
        return realUnlinkSync(file);
      });
      syncBuiltinESMExports();

      try {
        await withFileLock(lockPath, async () => {
          releaseHeldLocks();
        });
      } finally {
        vi.restoreAllMocks();
        syncBuiltinESMExports();
      }

      // The other process could not break the lock mid-release: it gave up
      // (status 3) rather than taking the lock (status 0) and having it
      // removed from under it.
      expect(other?.stdout).toContain("Timed out");
      expect(other?.status).toBe(3);
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("leaves its lock in place at exit while another process holds the guard", async () => {
      await withFileLock(lockPath, async () => {
        // Another process is breaking this lock, or crashed doing so.
        await fs.writeFile(guardPath(), "");

        releaseHeldLocks();

        expect(heldLockPaths()).toEqual([]);
        expect((await fs.readdir(dir)).sort()).toEqual([
          "memory.jsonl.lock",
          "memory.jsonl.lock.break",
        ]);
        await fs.unlink(guardPath());
      });
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it.each([
      ["and the guard it took for it", false],
      ["when that guard was cleared from under it", true],
    ])(
      "removes, at exit, a lock whose release the exit interrupted, %s",
      async (_, guardCleared) => {
        const realReadFile = fs.readFile;
        let duringRelease: string[] | undefined;
        let afterExit: string[] | undefined;
        await withFileLock(lockPath, async () => {
          // The release reads the lock next, with the guard already taken.
          vi.spyOn(fs, "readFile").mockImplementationOnce((async (
            ...args: Parameters<typeof fs.readFile>
          ) => {
            duringRelease = (await fs.readdir(dir)).sort();
            if (guardCleared) {
              await fs.unlink(guardPath());
            }
            releaseHeldLocks();
            afterExit = await fs.readdir(dir);
            return realReadFile(...args);
          }) as typeof fs.readFile);
        });

        expect(duringRelease).toEqual([
          "memory.jsonl.lock",
          "memory.jsonl.lock.break",
        ]);
        expect(afterExit).toEqual([]);
        expect(heldLockPaths()).toEqual([]);
      },
    );

    it("waits for the guard before releasing", async () => {
      const opens = watchOpens();
      let contended: Promise<void> | undefined;
      const held = withFileLock(
        lockPath,
        async () => {
          // A breaker is at work when the holder finishes.
          await fs.writeFile(guardPath(), "");
          contended = opens.opened(guardPath(), "wx");
          return "ran";
        },
        fast,
      );
      // The release found the guard taken and is waiting. Nothing is removed
      // until the breaker is done.
      while (!contended) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      await contended;
      expect(await exists(lockPath)).toBe(true);
      await fs.unlink(guardPath());

      expect(await held).toBe("ran");
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("still releases its lock when the guard cannot be created", async () => {
      const realOpen = fs.open;
      const result = await withFileLock(lockPath, async () => {
        vi.spyOn(fs, "open").mockImplementation((async (
          ...args: Parameters<typeof fs.open>
        ) => {
          if (args[0] === guardPath()) {
            throw Object.assign(new Error("EACCES: simulated"), {
              code: "EACCES",
            });
          }
          return realOpen(...args);
        }) as typeof fs.open);
        return "ran";
      });

      expect(result).toBe("ran");
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("waits out a break in progress before running under a lock it has just created", async () => {
      await fs.writeFile(guardPath(), "");
      const opens = watchOpens();
      const sawBreak = opens.opened(guardPath(), "r");
      const operation = vi.fn(async () => "ran");
      const held = withFileLock(lockPath, operation, fast);

      await sawBreak;
      // The lock is created, but the writer has not started.
      expect(await exists(lockPath)).toBe(true);
      expect(operation).not.toHaveBeenCalled();
      await fs.unlink(guardPath());

      expect(await held).toBe("ran");
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("clears a guard left by a crash rather than waiting on it", async () => {
      await fs.writeFile(guardPath(), "");
      const longAgo = new Date(Date.now() - 120_000);
      await fs.utimes(guardPath(), longAgo, longAgo);

      expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("waits, on Windows, for a guard another process is still deleting", async () => {
      vi.spyOn(process, "platform", "get").mockReturnValue("win32");
      const pendingDelete = Object.assign(new Error("EPERM"), {
        code: "EPERM",
      });
      const realOpen = fs.open;
      let guardChecks = 0;
      vi.spyOn(fs, "open").mockImplementation((async (
        ...args: Parameters<typeof fs.open>
      ) => {
        if (args[0] === guardPath() && args[1] === "r") {
          guardChecks += 1;
          if (guardChecks === 1) {
            throw pendingDelete;
          }
        }
        return realOpen(...args);
      }) as typeof fs.open);

      expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
      expect(guardChecks).toBe(2);
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("fails, removing the lock it created, when the guard cannot be checked", async () => {
      const realOpen = fs.open;
      vi.spyOn(fs, "open").mockImplementation((async (
        ...args: Parameters<typeof fs.open>
      ) => {
        if (args[0] === guardPath() && args[1] === "r") {
          throw Object.assign(new Error("EACCES: simulated"), {
            code: "EACCES",
          });
        }
        return realOpen(...args);
      }) as typeof fs.open);

      await expect(
        withFileLock(lockPath, async () => "ran", fast),
      ).rejects.toThrow("EACCES: simulated");
      expect(heldLockPaths()).toEqual([]);
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("fails, removing the lock it created, when that lock cannot be read back", async () => {
      vi.spyOn(fs, "readFile").mockRejectedValueOnce(
        Object.assign(new Error("EIO: simulated"), { code: "EIO" }),
      );

      await expect(
        withFileLock(lockPath, async () => "ran", fast),
      ).rejects.toThrow("EIO: simulated");
      expect(heldLockPaths()).toEqual([]);
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("takes the lock again when the one it created was removed before it could run", async () => {
      const realReadFile = fs.readFile;
      // A breaker older than #5560 deletes the new lock by path, between
      // its creation and the creator's check.
      vi.spyOn(fs, "readFile").mockImplementationOnce((async (
        ...args: Parameters<typeof fs.readFile>
      ) => {
        await fs.unlink(lockPath);
        return realReadFile(...args);
      }) as typeof fs.readFile);

      expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
      expect(heldLockPaths()).toEqual([]);
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("keeps tracking a lock this process took at the path of one it lost", async () => {
      const realReadFile = fs.readFile;
      let finish!: () => void;
      const mayFinish = new Promise<void>((resolve) => (finish = resolve));
      let other: Promise<string> | undefined;
      let trackedAfterLoss: string[] | undefined;
      // The first writer's new lock is displaced before its check, and a
      // second writer in this process takes the lock at the same path.
      vi.spyOn(fs, "readFile").mockImplementationOnce((async (
        ...args: Parameters<typeof fs.readFile>
      ) => {
        await fs.unlink(lockPath);
        let holding!: () => void;
        const held = new Promise<void>((resolve) => (holding = resolve));
        other = withFileLock(lockPath, async () => {
          holding();
          await mayFinish;
          return "second ran";
        });
        await held;
        // Let the first writer find the loss, then look at what is tracked.
        setImmediate(() => {
          setTimeout(() => {
            trackedAfterLoss = heldLockPaths();
            finish();
          }, 20);
        });
        return realReadFile(...args);
      }) as typeof fs.readFile);

      expect(
        await withFileLock(lockPath, async () => "first ran", {
          ...fast,
          timeoutMs: 5_000,
        }),
      ).toBe("first ran");
      expect(await other).toBe("second ran");
      // The first writer's loss did not untrack the second writer's lock.
      expect(trackedAfterLoss).toEqual([lockPath]);
      expect(heldLockPaths()).toEqual([]);
      expect(await fs.readdir(dir)).toEqual([]);
    });
  });
});

describe("releasing held locks on exit (#5485)", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempGraph());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  async function exists(file: string): Promise<boolean> {
    return fs.access(file).then(
      () => true,
      () => false,
    );
  }

  it("tracks a lock only while it is held", async () => {
    const lockPath = path.join(dir, "memory.jsonl.lock");
    await withFileLock(lockPath, async () => {
      expect(heldLockPaths()).toEqual([lockPath]);
    });
    expect(heldLockPaths()).toEqual([]);
  });

  it("removes each lock still held, and only those still ours", async () => {
    const ours = path.join(dir, "ours.lock");
    const taken = path.join(dir, "taken.lock");
    const gone = path.join(dir, "gone.lock");
    await withFileLock(ours, () =>
      withFileLock(taken, () =>
        withFileLock(gone, async () => {
          // Another process broke and re-took one lock, and another vanished.
          await fs.writeFile(taken, "someone else");
          await fs.unlink(gone);

          releaseHeldLocks();

          expect(heldLockPaths()).toEqual([]);
          expect(await exists(ours)).toBe(false);
          expect(await fs.readFile(taken, "utf-8")).toBe("someone else");
        }),
      ),
    );
    expect(await fs.readFile(taken, "utf-8")).toBe("someone else");
  });

  it("removes a lock whose token was still being written at exit", async () => {
    const lockPath = path.join(dir, "memory.jsonl.lock");
    const realOpen = fs.open;
    let finishWrite!: () => void;
    let writing!: () => void;
    const writeStarted = new Promise<void>((resolve) => (writing = resolve));
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
      const handle = await realOpen(...args);
      const realWrite = handle.writeFile.bind(handle);
      // Hold the token write open, with nothing written yet.
      handle.writeFile = async (data) => {
        writing();
        await new Promise<void>((resolve) => (finishWrite = resolve));
        return realWrite(data);
      };
      return handle;
    });

    const held = withFileLock(lockPath, async () => "ran");
    await writeStarted;
    expect(await fs.readFile(lockPath, "utf-8")).toBe("");

    releaseHeldLocks();

    expect(await exists(lockPath)).toBe(false);
    finishWrite();
    expect(await held).toBe("ran");
  });

  it("leaves another writer's empty replacement of a written lock in place", async () => {
    const lockPath = path.join(dir, "memory.jsonl.lock");
    await withFileLock(lockPath, async () => {
      // Our lock was broken as stale, and a new writer has created its own
      // but not yet written its token.
      await fs.writeFile(lockPath, "");

      releaseHeldLocks();

      expect(await exists(lockPath)).toBe(true);
    });
  });

  it("still tracks a lock while its release is in progress", async () => {
    const lockPath = path.join(dir, "memory.jsonl.lock");
    const realUnlink = fs.unlink;
    let trackedDuringRelease: string[] = [];
    await withFileLock(lockPath, async () => {
      // The release's removal of the lock is the next unlink.
      vi.spyOn(fs, "unlink").mockImplementationOnce(async (file) => {
        trackedDuringRelease = heldLockPaths();
        return realUnlink(file);
      });
    });
    expect(trackedDuringRelease).toEqual([lockPath]);
    expect(heldLockPaths()).toEqual([]);
    expect(await exists(lockPath)).toBe(false);
  });

  it("keeps tracking a lock the same process re-took after breaking it", async () => {
    const lockPath = path.join(dir, "memory.jsonl.lock");
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((resolve) => (releaseFirst = resolve));
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => (firstStarted = resolve));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const first = withFileLock(
      lockPath,
      async () => {
        firstStarted();
        await firstHolds;
      },
      { staleMs: 60_000 },
    );
    await started;
    // Age the first holder's lock past a short staleMs, so a second holder in
    // this process breaks it and takes it over.
    const old = new Date(Date.now() - 10_000);
    await fs.utimes(lockPath, old, old);
    await withFileLock(
      lockPath,
      async () => {
        releaseFirst();
        await first;
        // The first holder's release left the second's lock, and its entry.
        expect(heldLockPaths()).toEqual([lockPath]);
        expect(await exists(lockPath)).toBe(true);
      },
      { staleMs: 1_000, timeoutMs: 1_000, retryMs: 5 },
    );
    expect(heldLockPaths()).toEqual([]);
  });

  it("installs an exit hook and SIGINT and SIGTERM handlers, once", () => {
    const handlers = new Map<string | symbol, () => void>();
    const on = vi.spyOn(process, "on").mockImplementation((event, listener) => {
      handlers.set(event, listener as () => void);
      return process;
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as typeof process.exit);

    installLockCleanup();
    installLockCleanup();

    expect(on).toHaveBeenCalledTimes(3);
    expect(handlers.get("exit")).toBe(releaseHeldLocks);
    handlers.get("SIGINT")?.();
    expect(exit).toHaveBeenLastCalledWith(130);
    handlers.get("SIGTERM")?.();
    expect(exit).toHaveBeenLastCalledWith(143);
  });

  // A real signal, sent to a real process holding a lock mid-operation.
  // Windows has no SIGTERM to deliver: process.kill() there ends the process
  // outright, so no handler can run.
  it.skipIf(process.platform === "win32")(
    "removes the lock when SIGTERM stops a process mid-mutation",
    async () => {
      const lockPath = path.join(dir, "memory.jsonl.lock");
      const distIndex = pathToFileURL(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
          "dist",
          "index.js",
        ),
      ).href;
      const script = `
        const { installLockCleanup, withFileLock } = await import(${JSON.stringify(distIndex)});
        installLockCleanup();
        await withFileLock(${JSON.stringify(lockPath)}, () => {
          console.log("held");
          return new Promise(() => setInterval(() => {}, 1000));
        });
      `;
      const child = spawn(
        process.execPath,
        ["--input-type=module", "-e", script],
        { stdio: ["ignore", "pipe", "inherit"] },
      );
      const exited = new Promise<number | null>((resolve) =>
        child.on("exit", (code) => resolve(code)),
      );
      await new Promise<void>((resolve, reject) => {
        child.stdout.on("data", (data: Buffer) => {
          if (data.toString().includes("held")) resolve();
        });
        child.on("exit", () => reject(new Error("exited before holding")));
      });
      expect(await exists(lockPath)).toBe(true);

      child.kill("SIGTERM");

      expect(await exited).toBe(143);
      expect(await exists(lockPath)).toBe(false);
    },
  );
});
