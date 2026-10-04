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

  it("does not break a stale lock that was replaced before it could be removed", async () => {
    await fs.writeFile(lockPath, "stale");
    const longAgo = new Date(Date.now() - 120_000);
    await fs.utimes(lockPath, longAgo, longAgo);
    // Another waiter breaks the stale lock and takes it between this waiter's
    // first read and its re-check; that waiter's lock must survive.
    const realReadFile = fs.readFile;
    vi.spyOn(fs, "readFile")
      .mockImplementationOnce(realReadFile)
      .mockImplementationOnce((async () => {
        await fs.writeFile(lockPath, "fresh");
        return "fresh";
      }) as unknown as typeof fs.readFile);

    await expect(
      withFileLock(lockPath, async () => "ran", fast),
    ).rejects.toThrow("Timed out");
    expect(await fs.readFile(lockPath, "utf-8")).toBe("fresh");
  });

  it("acquires the lock at once when the holder releases it mid-check", async () => {
    await fs.writeFile(lockPath, "held");
    vi.spyOn(fs, "readFile").mockImplementationOnce((async () => {
      await fs.unlink(lockPath);
      throw Object.assign(new Error("ENOENT: gone"), { code: "ENOENT" });
    }) as typeof fs.readFile);

    expect(await withFileLock(lockPath, async () => "ran", fast)).toBe("ran");
  });

  it("leaves a lock it no longer owns in place on release", async () => {
    await withFileLock(lockPath, async () => {
      await fs.writeFile(lockPath, "someone else");
    });
    expect(await fs.readFile(lockPath, "utf-8")).toBe("someone else");
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
