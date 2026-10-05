// Unit tests for withFileLock, the lock file that orders mutations from
// separate server processes sharing one graph file (#4797): mutual exclusion,
// release, breaking an abandoned lock, and giving up on a held one.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { KnowledgeGraphManager, withFileLock } from "../index.js";
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
