// edit_file's whitespace-tolerant match with an oldText that ends with a
// newline (#5431). The fallback splits oldText into lines, and a trailing
// newline used to become an empty last "line" that had to equal the file's
// next line, so whole lines copied with their final newline failed to match
// whenever only indentation differed. A trailing newline now ends oldText's
// last line, as it does in exact matching: the match keeps the file's
// indentation, it must be followed by a newline in the file, and newText's
// trailing newline decides whether that newline survives. These tests drive
// edit_file over the protocol and read back what was written.

import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

describe("edit_file whitespace-tolerant match with a trailing newline", () => {
  let dir: string;
  let conn: Connected;
  let file: string;
  // The issue's fixture: tab indentation, two trailing spaces on line 3.
  const tabbed = "def f():\n\tif x:\n\t\treturn 1  \n\treturn 2\n";

  beforeEach(async () => {
    quietStderr();
    dir = await makeTempDir("mcp-fs-edit-trailing-newline-");
    conn = await connect([dir]);
    file = path.join(dir, "code.py");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await conn.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function edit(oldText: string, newText: string, dryRun = false) {
    return call(conn.client, "edit_file", {
      path: file,
      edits: [{ oldText, newText }],
      dryRun,
    });
  }

  it("matches the issue's repro and keeps the file's indentation", async () => {
    await fs.writeFile(file, tabbed);
    const result = await edit("if x:\n    return 1\n", "if x:\n    return 9\n");
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe(
      "def f():\n\tif x:\n\t\treturn 9\n\treturn 2\n",
    );
  });

  it("previews the same edit as a dry run without writing", async () => {
    await fs.writeFile(file, tabbed);
    const result = await edit(
      "if x:\n    return 1\n",
      "if x:\n    return 9\n",
      true,
    );
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("-\t\treturn 1  \n+\t\treturn 9\n");
    expect(await fs.readFile(file, "utf-8")).toBe(tabbed);
  });

  it("gives the same result as the oldText without its final newline", async () => {
    await fs.writeFile(file, tabbed);
    await edit("if x:\n    return 1", "if x:\n    return 9");
    const withoutNewline = await fs.readFile(file, "utf-8");
    await fs.writeFile(file, tabbed);
    await edit("if x:\n    return 1\n", "if x:\n    return 9\n");
    expect(await fs.readFile(file, "utf-8")).toBe(withoutNewline);
  });

  it("removes whole lines when newText is empty", async () => {
    await fs.writeFile(file, tabbed);
    const result = await edit("    return 1\n", "");
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe(
      "def f():\n\tif x:\n\treturn 2\n",
    );
  });

  it("joins newText's last line to the next line when only oldText ends with a newline", async () => {
    // What an exact replacement does: the newline belonged to oldText, and
    // newText does not put it back.
    await fs.writeFile(file, tabbed);
    const result = await edit("return 1\n", "return 9; ");
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe(
      "def f():\n\tif x:\n\t\treturn 9; \treturn 2\n",
    );
  });

  it("matches the file's last line when the file ends with a newline", async () => {
    await fs.writeFile(file, tabbed);
    const result = await edit("  return 2\n", "  return 3\n");
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe(
      "def f():\n\tif x:\n\t\treturn 1  \n\treturn 3\n",
    );
  });

  it("does not match a last line the file does not end with a newline", async () => {
    const unterminated = "def f():\n\treturn 2";
    await fs.writeFile(file, unterminated);
    const result = await edit("  return 2\n", "  return 3\n");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      'oldText line 2 ("") runs past the end of the file, which ends at line 2.',
    );
    expect(await fs.readFile(file, "utf-8")).toBe(unterminated);
  });

  it("keeps CRLF line endings", async () => {
    await fs.writeFile(file, tabbed.replace(/\n/g, "\r\n"));
    const result = await edit(
      "if x:\r\n    return 1\r\n",
      "if x:\r\n    return 9\r\n",
    );
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe(
      "def f():\r\n\tif x:\r\n\t\treturn 9\r\n\treturn 2\r\n",
    );
  });

  it("leaves exact matching with a trailing newline unchanged", async () => {
    await fs.writeFile(file, tabbed);
    const result = await edit("\tif x:\n", "\tif y:\n");
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe(
      "def f():\n\tif y:\n\t\treturn 1  \n\treturn 2\n",
    );
  });
});
