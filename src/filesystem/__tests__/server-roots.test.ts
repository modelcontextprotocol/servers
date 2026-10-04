// Roots handling as a client sees it (#4854): how the client's roots replace
// the command-line directories after initialize, how roots/list_changed
// updates them, and what happens when roots are invalid, fail or are not
// offered. Driven by a real Client that answers the server's roots/list
// requests over the in-memory transport. Pins #3204 as a known bug, and
// #3602's roots-replace-the-command-line behavior as the README documents it.

import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Root } from "@modelcontextprotocol/sdk/types.js";
import {
  allowedDirectoriesOf,
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

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
        "MCP error -32603: client has no roots today",
      ),
    );
    expect(await allowedDirectoriesOf(client)).toEqual([cliDir]);
  });

  // KNOWN BUG #3204: pins current (wrong) behavior; the fix changes this assertion.
  // #3204: the server does not wait for the initial roots before serving
  // tool calls. A call that arrives while roots/list is outstanding is
  // checked against the command-line directories (here, none).
  it("are not awaited before tool calls are served (#3204)", async () => {
    await fs.writeFile(path.join(rootDir, "f.txt"), "from root");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client } = await connectTracked([], {
      capabilities: ROOTS,
      listRoots: async () => {
        await gate;
        return [rootOf(rootDir)];
      },
    });

    const early = await call(client, "read_text_file", {
      path: path.join(rootDir, "f.txt"),
    });
    expect(early.isError).toBe(true);
    expect(textOf(early)).toBe(
      `Access denied - path outside allowed directories: ${path.join(rootDir, "f.txt")} not in `,
    );

    release();
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([rootDir]),
    );
    const late = await call(client, "read_text_file", {
      path: path.join(rootDir, "f.txt"),
    });
    expect(textOf(late)).toBe("from root");
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
        "MCP error -32603: gone",
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

  // KNOWN BUG #4992: with no directories and no Roots, the initialization error the README promises is swallowed and the session stays up with nothing allowed; the fix changes this assertion.
  // With no directories from either source, oninitialized throws. The SDK
  // routes a notification handler's rejection to the server's onerror, which
  // the server leaves unset, so the error is invisible to the client: the
  // session stays up and every path is refused.
  it("stays connected with nothing allowed when no directories were given", async () => {
    const { client } = await connectTracked([]);
    expect(await allowedDirectoriesOf(client)).toEqual([]);
    const result = await call(client, "list_directory", { path: rootDir });
    expect(textOf(result)).toMatch(/^Access denied/);
  });
});
