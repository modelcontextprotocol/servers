// The effective allowed-directories summary (#4912): one stderr message naming
// the directories in force and where they came from, printed at startup and
// after every change to them. The message itself is pinned through
// describeAllowedDirectories; the protocol tests drive a real Client over the
// in-memory transport and assert the server prints it at each point an
// operator needs it: startup, after initialize (with and without Roots), after
// a Roots update, after a withdrawal, and when the initial roots/list fails.

import fs from "fs/promises";
import path from "path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Root } from "@modelcontextprotocol/server";
import { describeAllowedDirectories } from "../allowed-directories.js";
import { main } from "../index.js";
import {
  allowedDirectoriesOf,
  connect,
  makeTempDir,
  quietStderr,
  type Connected,
} from "./helpers.js";

const ROOTS = { roots: { listChanged: true } };

let cliDir: string;
let rootDir: string;
let stderr: ReturnType<typeof quietStderr>;
let closers: Array<() => Promise<void>>;

beforeEach(async () => {
  stderr = quietStderr();
  cliDir = await makeTempDir("mcp-fs-summary-cli-");
  rootDir = await makeTempDir("mcp-fs-summary-root-");
  closers = [];
});

afterEach(async () => {
  for (const close of closers.reverse()) await close();
  vi.restoreAllMocks();
  await fs.rm(cliDir, { recursive: true, force: true });
  await fs.rm(rootDir, { recursive: true, force: true });
});

async function connectTracked(
  ...args: Parameters<typeof connect>
): Promise<Connected> {
  const conn = await connect(...args);
  closers.push(conn.close);
  return conn;
}

function rootOf(dir: string): Root {
  return { uri: pathToFileURL(dir).href, name: path.basename(dir) };
}

describe("describeAllowedDirectories", () => {
  it("lists command-line directories one per line", () => {
    expect(
      describeAllowedDirectories(["/a", "/b,c"], { from: "command-line" }),
    ).toBe(
      "Effective allowed directories (from the command line):\n  /a\n  /b,c",
    );
  });

  it("says when the client's Roots replaced the command-line directories", () => {
    expect(
      describeAllowedDirectories(["/r"], {
        from: "roots",
        replacedCommandLine: true,
      }),
    ).toBe(
      "Effective allowed directories (from the client's Roots, which replaced the command-line directories):\n  /r",
    );
    expect(
      describeAllowedDirectories(["/r"], {
        from: "roots",
        replacedCommandLine: false,
      }),
    ).toBe("Effective allowed directories (from the client's Roots):\n  /r");
  });

  it("says why there are none, and that every path is refused", () => {
    expect(describeAllowedDirectories([], { from: "command-line" })).toBe(
      "Effective allowed directories: none. No command-line directories and no valid client Roots, so every path is refused",
    );
    expect(
      describeAllowedDirectories([], {
        from: "roots",
        replacedCommandLine: true,
      }),
    ).toBe(
      "Effective allowed directories: none. The client's Roots name no valid directory, so every path is refused until it exposes one again",
    );
  });
});

describe("the server logs the summary", () => {
  it("at startup, for the command-line directories", async () => {
    const handle = await main([cliDir], new PassThrough(), new PassThrough());
    closers.push(() => handle.close());
    expect(stderr).toHaveBeenCalledWith(
      describeAllowedDirectories([cliDir], { from: "command-line" }),
    );
  });

  it("after initialize, when the client does not support Roots", async () => {
    await connectTracked([cliDir]);
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        describeAllowedDirectories([cliDir], { from: "command-line" }),
      ),
    );
  });

  it("after initialize, when the client's Roots replace the command-line directories", async () => {
    await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => [rootOf(rootDir)],
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        describeAllowedDirectories([rootDir], {
          from: "roots",
          replacedCommandLine: true,
        }),
      ),
    );
  });

  it("after initialize, when Roots supply the only directories", async () => {
    await connectTracked([], {
      capabilities: ROOTS,
      listRoots: () => [rootOf(rootDir)],
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        describeAllowedDirectories([rootDir], {
          from: "roots",
          replacedCommandLine: false,
        }),
      ),
    );
  });

  it("after initialize, keeping the command-line directories when no root is valid", async () => {
    await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => [rootOf(path.join(rootDir, "missing"))],
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        describeAllowedDirectories([cliDir], { from: "command-line" }),
      ),
    );
  });

  it("after initialize, when the initial roots/list fails", async () => {
    await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => {
        throw new Error("client has no roots today");
      },
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        describeAllowedDirectories([cliDir], { from: "command-line" }),
      ),
    );
  });

  it("after a Roots update, and after the client withdraws its last root", async () => {
    const other = await makeTempDir("mcp-fs-summary-other-");
    closers.push(() => fs.rm(other, { recursive: true, force: true }));
    let roots = [rootOf(rootDir)];
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => roots,
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );

    roots = [rootOf(other)];
    await client.sendRootsListChanged();
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        describeAllowedDirectories([other], {
          from: "roots",
          replacedCommandLine: true,
        }),
      ),
    );

    roots = [];
    await client.sendRootsListChanged();
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        describeAllowedDirectories([], {
          from: "roots",
          replacedCommandLine: true,
        }),
      ),
    );
  });
});
