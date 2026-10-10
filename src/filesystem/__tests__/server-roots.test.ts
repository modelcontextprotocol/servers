// Roots handling as a client sees it (#4854): how the client's roots replace
// the command-line directories after initialize, how roots/list_changed
// updates them, and what happens when roots are invalid, fail or are not
// offered. Driven by a real Client that answers the server's roots/list
// requests over the in-memory transport. Guards the fixes for #3204 (tool
// calls wait for the initial roots) and #4992 (no directories at all fails
// visibly), and pins #3602's roots-replace-the-command-line behavior as the README documents it.

import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Root } from "@modelcontextprotocol/server";
import {
  allowedDirectoriesOf,
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";
import { NO_ALLOWED_DIRECTORIES_ERROR } from "../server.js";

const ROOTS = { roots: { listChanged: true } };

let cliDir: string;
let rootDir: string;
let stderr: ReturnType<typeof quietStderr>;
const open: Connected[] = [];

async function connectTracked(
  ...args: Parameters<typeof connect>
): Promise<Connected> {
  const conn = await connect(...args);
  open.push(conn);
  return conn;
}

function rootOf(dir: string): Root {
  return { uri: pathToFileURL(dir).href, name: path.basename(dir) };
}

beforeEach(async () => {
  stderr = quietStderr();
  cliDir = await makeTempDir("mcp-fs-cli-");
  rootDir = await makeTempDir("mcp-fs-root-");
});

afterEach(async () => {
  for (const conn of open.splice(0)) await conn.close();
  vi.restoreAllMocks();
  await fs.rm(cliDir, { recursive: true, force: true });
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("initial roots", () => {
  // #3602: the client's roots replace the command-line directories rather
  // than being added to them, as the README documents.
  it("replace the command-line directories with the client's roots (#3602)", async () => {
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => [rootOf(rootDir)],
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );
    expect(stderr).toHaveBeenCalledWith(
      "Updated allowed directories from MCP roots: 1 valid directories",
    );
    const result = await call(client, "list_directory", { path: cliDir });
    expect(textOf(result)).toMatch(/^Access denied/);
  });

  it("accept a pathToFileURL root with spaces and non-ASCII characters", async () => {
    const fancy = path.join(rootDir, "my café dir");
    await fs.mkdir(fancy);
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: () => [{ uri: pathToFileURL(fancy).href }],
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([fancy]),
    );
  });

  it("resolve a symlinked root to its target", async () => {
    const link = path.join(cliDir, "link-to-root");
    await fs.symlink(rootDir, link);
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: () => [rootOf(link)],
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );
  });

  it("drop invalid roots and keep the valid ones", async () => {
    await fs.writeFile(path.join(cliDir, "file.txt"), "");
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => [
        rootOf(path.join(cliDir, "missing")),
        rootOf(path.join(cliDir, "file.txt")),
        rootOf(rootDir),
      ],
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );
    expect(stderr).toHaveBeenCalledWith(
      `Skipping invalid path or inaccessible: ${pathToFileURL(path.join(cliDir, "missing")).href}`,
    );
    expect(stderr).toHaveBeenCalledWith(
      `Skipping non-directory root: ${path.join(cliDir, "file.txt")}`,
    );
  });

  it("keep the command-line directories when no root is valid", async () => {
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => [rootOf(path.join(cliDir, "missing"))],
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        "No valid root directories provided by client",
      ),
    );
    expect(await allowedDirectoriesOf(client)).toEqual([cliDir]);
  });

  it("keep the command-line directories when the client returns an empty list", async () => {
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => [],
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        "No valid root directories provided by client",
      ),
    );
    expect(await allowedDirectoriesOf(client)).toEqual([cliDir]);
  });

  it("keep the command-line directories when roots/list fails", async () => {
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => {
        throw new Error("client has no roots today");
      },
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        "Failed to request initial roots from client:",
        "client has no roots today",
      ),
    );
    expect(await allowedDirectoriesOf(client)).toEqual([cliDir]);
  });

  // #3204: a tool call that arrives while the initial roots/list is still
  // outstanding waits for it, and is checked against the client's roots
  // rather than the command-line directories (here, none).
  it("are awaited before tool calls are served (#3204)", async () => {
    await fs.writeFile(path.join(rootDir, "f.txt"), "from root");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let asked = false;
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: async () => {
        asked = true;
        await gate;
        return [rootOf(rootDir)];
      },
    });

    let settled = false;
    const early = call(client, "read_text_file", {
      path: path.join(rootDir, "f.txt"),
    }).finally(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(asked).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);

    release();
    const result = await early;
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe("from root");
    expect(await allowedDirectoriesOf(client)).toEqual([rootDir]);
  });

  it("are awaited by concurrent tool calls, which then all succeed (#3204)", async () => {
    await fs.writeFile(path.join(rootDir, "a.txt"), "a");
    await fs.writeFile(path.join(rootDir, "b.txt"), "b");
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [rootOf(rootDir)];
      },
    });
    const results = await Promise.all([
      call(client, "read_text_file", { path: path.join(rootDir, "a.txt") }),
      call(client, "read_text_file", { path: path.join(rootDir, "b.txt") }),
      call(client, "list_allowed_directories"),
    ]);
    expect(results.map(textOf)).toEqual([
      "a",
      "b",
      `Allowed directories:\n${rootDir}`,
    ]);
  });

  it("fall back to the command-line directories for waiting calls when roots/list fails (#3204)", async () => {
    await fs.writeFile(path.join(cliDir, "f.txt"), "from cli");
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("no roots");
      },
    });
    const result = await call(client, "read_text_file", {
      path: path.join(cliDir, "f.txt"),
    });
    expect(textOf(result)).toBe("from cli");
  });
});

describe("roots/list_changed", () => {
  it("re-fetches the roots and replaces the allowed directories", async () => {
    let roots = [rootOf(rootDir)];
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => roots,
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );

    roots = [rootOf(cliDir), rootOf(rootDir)];
    await client.sendRootsListChanged();
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([cliDir, rootDir]),
    );
  });

  // #5094: once the client's roots are in force, an update that leaves no
  // valid root revokes access instead of keeping the previous directories.
  it("revokes access when the client withdraws its last root (#5094)", async () => {
    let roots = [rootOf(rootDir)];
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => roots,
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );

    roots = [];
    await client.sendRootsListChanged();
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([]),
    );
    expect(stderr).toHaveBeenCalledWith(
      "No valid root directories provided by client; access revoked until it exposes a root again",
    );
    const result = await call(client, "list_directory", { path: rootDir });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(
      /^Access denied - no allowed directories: the client exposes no valid roots/,
    );
    // The command-line directories do not come back either.
    expect(
      textOf(await call(client, "list_directory", { path: cliDir })),
    ).toMatch(/^Access denied/);
  });

  it("revokes access when every remaining root is invalid (#5094)", async () => {
    let roots = [rootOf(rootDir)];
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: () => roots,
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );

    roots = [rootOf(path.join(rootDir, "gone"))];
    await client.sendRootsListChanged();
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([]),
    );
  });

  it("restores access when the client exposes a root again (#5094)", async () => {
    let roots = [rootOf(rootDir)];
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: () => roots,
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );
    roots = [];
    await client.sendRootsListChanged();
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([]),
    );

    roots = [rootOf(rootDir)];
    await client.sendRootsListChanged();
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );
  });

  it("keeps the command-line directories on an empty update before any root was in force", async () => {
    let roots: Root[] = [];
    const { client } = await connectTracked([cliDir], {
      capabilities: ROOTS,
      listRoots: () => roots,
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        "No valid root directories provided by client",
      ),
    );

    roots = [];
    await client.sendRootsListChanged();
    await vi.waitFor(() =>
      expect(
        stderr.mock.calls.filter(
          (c) => c[0] === "No valid root directories provided by client",
        ),
      ).toHaveLength(2),
    );
    expect(await allowedDirectoriesOf(client)).toEqual([cliDir]);
  });

  it("logs and keeps the current directories when the re-fetch fails", async () => {
    let fail = false;
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: () => {
        if (fail) throw new Error("gone");
        return [rootOf(rootDir)];
      },
    });
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );

    fail = true;
    await client.sendRootsListChanged();
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        "Failed to request roots from client:",
        "gone",
      ),
    );
    expect(await allowedDirectoriesOf(client)).toEqual([rootDir]);
  });
});

describe("a client without the roots capability", () => {
  it("keeps the command-line directories and says so", async () => {
    const { client } = await connectTracked([cliDir]);
    expect(await allowedDirectoriesOf(client)).toEqual([cliDir]);
    expect(stderr).toHaveBeenCalledWith(
      "Client does not support MCP Roots, using allowed directories set from server args:",
      [cliDir],
    );
  });

  // #4992: with no directories from either source nothing could ever be
  // allowed, so the server says why on stderr and closes the connection
  // rather than staying up and refusing every call.
  it("closes the connection with an error when no directories were given (#4992)", async () => {
    const { client } = await connectTracked([]);
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        `Error: ${NO_ALLOWED_DIRECTORIES_ERROR}`,
      ),
    );
    await expect(
      call(client, "list_directory", { path: rootDir }),
    ).rejects.toThrow(/Connection closed|Not connected/);
  });
});
