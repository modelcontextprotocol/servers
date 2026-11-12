// Unit tests for withFileLock, the lock file that orders mutations from
// separate server processes sharing one graph file (#4797): mutual exclusion,
// release, breaking an abandoned lock, and giving up on a held one; and the
// exit-time release of the locks this process still holds (#5485).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
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
