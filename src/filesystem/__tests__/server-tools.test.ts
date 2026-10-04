// Characterization suite for every filesystem tool, driven through an SDK
// Client over an in-memory transport (#4854). It pins what the server does
// today on SDK 1.x, quirks included, so the SDK v2 migration (#4856) can prove
// it changed nothing on the wire. A test that pins a known bug says so, with
// the issue number, so the fix has a test to change.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  allowedDirectoriesOf,
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const TOOL_NAMES = [
  "read_file",
  "read_text_file",
  "read_media_file",
  "read_multiple_files",
  "write_file",
  "edit_file",
  "create_directory",
  "list_directory",
  "list_directory_with_sizes",
  "directory_tree",
  "move_file",
  "search_files",
  "get_file_info",
  "list_allowed_directories",
];

interface TreeEntry {
  name: string;
  type: "file" | "directory";
  children?: TreeEntry[];
}

/** Sort a directory_tree result by name at every level; readdir order is the OS's. */
function sortTree(entries: TreeEntry[]): TreeEntry[] {
  return [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) =>
      entry.children ? { ...entry, children: sortTree(entry.children) } : entry,
    );
}

let dir: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  // The server logs its roots decision to stderr on every connect.
  quietStderr();
  dir = await makeTempDir("mcp-fs-tools-");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("server identity and tool list", () => {
  it("reports its name and the package.json version (#360, fixed by #4472)", () => {
    expect(client.getServerVersion()).toEqual({
      name: "secure-filesystem-server",
      version: packageJson.version,
    });
  });

  it("advertises only the tools capability", () => {
    expect(client.getServerCapabilities()).toEqual({
      tools: { listChanged: true },
    });
  });

  it("lists the 14 tools in registration order", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TOOL_NAMES);
  });

  // #3402: the read-only tools carry no idempotentHint or destructiveHint.
  // When that issue is fixed, this table is the test to change.
  it("pins each tool's title and annotations (#3402)", async () => {
    const { tools } = await client.listTools();
    const table = Object.fromEntries(
      tools.map((t) => [t.name, { title: t.title, ...t.annotations }]),
    );
    const readOnly = { readOnlyHint: true, openWorldHint: false };
    expect(table).toEqual({
      read_file: { title: "Read File (Deprecated)", ...readOnly },
      read_text_file: { title: "Read Text File", ...readOnly },
      read_media_file: { title: "Read Media File", ...readOnly },
      read_multiple_files: { title: "Read Multiple Files", ...readOnly },
      write_file: {
        title: "Write File",
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: true,
        openWorldHint: false,
      },
      edit_file: {
        title: "Edit File",
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      create_directory: {
        title: "Create Directory",
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      list_directory: { title: "List Directory", ...readOnly },
      list_directory_with_sizes: {
        title: "List Directory with Sizes",
        ...readOnly,
      },
      directory_tree: { title: "Directory Tree", ...readOnly },
      move_file: {
        title: "Move File",
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      search_files: { title: "Search Files", ...readOnly },
      get_file_info: { title: "Get File Info", ...readOnly },
      list_allowed_directories: {
        title: "List Allowed Directories",
        ...readOnly,
      },
    });
  });

  // KNOWN BUG #4841: pins current (wrong) behavior; the fix changes this assertion.
  // #4841: every schema declares the draft-07 dialect, from the SDK's default
  // zod-to-JSON-Schema target. Strict 2020-12 validators reject it.
  it("declares the draft-07 $schema on every input and output schema (#4841)", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.$schema).toBe(
        "http://json-schema.org/draft-07/schema#",
      );
      expect(tool.outputSchema?.$schema).toBe(
        "http://json-schema.org/draft-07/schema#",
      );
    }
  });

  it("pins the input schemas a client is shown", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const strip = (schema: Record<string, unknown>) => {
      const { $schema: _dialect, ...rest } = schema;
      return rest;
    };
    expect(strip(byName.read_text_file.inputSchema)).toEqual({
      type: "object",
      properties: {
        path: { type: "string" },
        tail: {
          type: "number",
          description: "If provided, returns only the last N lines of the file",
        },
        head: {
          type: "number",
          description:
            "If provided, returns only the first N lines of the file",
        },
      },
      required: ["path"],
    });
    expect(strip(byName.edit_file.inputSchema)).toEqual({
      type: "object",
      properties: {
        path: { type: "string" },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              oldText: {
                type: "string",
                description: "Text to search for - must match exactly",
              },
              newText: {
                type: "string",
                description: "Text to replace with",
              },
            },
            required: ["oldText", "newText"],
          },
        },
        dryRun: {
          type: "boolean",
          default: false,
          description: "Preview changes using git-style diff format",
        },
      },
      required: ["path", "edits"],
    });
    expect(strip(byName.list_allowed_directories.inputSchema)).toEqual({
      type: "object",
      properties: {},
    });
    expect(strip(byName.write_file.outputSchema!)).toEqual({
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
      additionalProperties: false,
    });
  });

  it("advertises read_media_file's union outputSchema with every arm (#4029)", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "read_media_file");
    const schema = JSON.stringify(tool?.outputSchema);
    expect(schema).toMatch(/"image"/);
    expect(schema).toMatch(/"audio"/);
    expect(schema).toMatch(/"resource"/);
  });

  it("returns every non-media tool's structuredContent as { content: string } mirroring the text block (#3110, #3106, #3093)", async () => {
    await fs.writeFile(path.join(dir, "a.txt"), "alpha");
    const calls: Array<[string, Record<string, unknown>]> = [
      ["read_file", { path: path.join(dir, "a.txt") }],
      ["read_text_file", { path: path.join(dir, "a.txt") }],
      ["read_multiple_files", { paths: [path.join(dir, "a.txt")] }],
      ["write_file", { path: path.join(dir, "b.txt"), content: "beta" }],
      [
        "edit_file",
        {
          path: path.join(dir, "b.txt"),
          edits: [{ oldText: "beta", newText: "gamma" }],
        },
      ],
      ["create_directory", { path: path.join(dir, "sub") }],
      ["list_directory", { path: dir }],
      ["list_directory_with_sizes", { path: dir }],
      ["directory_tree", { path: dir }],
      [
        "move_file",
        {
          source: path.join(dir, "b.txt"),
          destination: path.join(dir, "c.txt"),
        },
      ],
      ["search_files", { path: dir, pattern: "*.txt" }],
      ["get_file_info", { path: path.join(dir, "a.txt") }],
      ["list_allowed_directories", {}],
    ];
    for (const [name, args] of calls) {
      const result = await call(client, name, args);
      expect(result.isError, name).toBeFalsy();
      expect(result.structuredContent, name).toEqual({
        content: textOf(result),
      });
    }
  });

  it("reports an unknown tool as a tool error", async () => {
    const result = await call(client, "no_such_tool");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "MCP error -32602: Tool no_such_tool not found",
    );
  });

  it("reports schema-invalid arguments as a tool error", async () => {
    const result = await call(client, "read_text_file", { path: 42 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(
      /^MCP error -32602: Input validation error: Invalid arguments for tool read_text_file/,
    );
  });
});

describe("read_text_file and read_file", () => {
  let file: string;

  beforeEach(async () => {
    file = path.join(dir, "lines.txt");
    await fs.writeFile(file, "one\ntwo\nthree\nfour\n");
  });

  it("returns the whole file", async () => {
    const result = await call(client, "read_text_file", { path: file });
    expect(result).toEqual({
      content: [{ type: "text", text: "one\ntwo\nthree\nfour\n" }],
      structuredContent: { content: "one\ntwo\nthree\nfour\n" },
    });
  });

  it("read_file is a deprecated alias with the same result", async () => {
    const legacy = await call(client, "read_file", { path: file, head: 1 });
    const current = await call(client, "read_text_file", {
      path: file,
      head: 1,
    });
    expect(legacy).toEqual(current);
  });

  it("returns the first N lines with head", async () => {
    const result = await call(client, "read_text_file", {
      path: file,
      head: 2,
    });
    expect(textOf(result)).toBe("one\ntwo");
  });

  it("returns the last N lines with tail, counting the trailing newline as a line", async () => {
    const result = await call(client, "read_text_file", {
      path: file,
      tail: 2,
    });
    expect(textOf(result)).toBe("four\n");
  });

  it("treats head: 0 as absent and returns the whole file", async () => {
    const result = await call(client, "read_text_file", {
      path: file,
      head: 0,
    });
    expect(textOf(result)).toBe("one\ntwo\nthree\nfour\n");
  });

  it("rejects head and tail together", async () => {
    const result = await call(client, "read_text_file", {
      path: file,
      head: 1,
      tail: 1,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "Cannot specify both head and tail parameters simultaneously",
    );
  });

  it("reports a missing file as a tool error naming ENOENT", async () => {
    const result = await call(client, "read_text_file", {
      path: path.join(dir, "missing.txt"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^ENOENT: no such file or directory/);
  });

  it("reads an empty file with tail as empty text", async () => {
    const empty = path.join(dir, "empty.txt");
    await fs.writeFile(empty, "");
    const result = await call(client, "read_text_file", {
      path: empty,
      tail: 3,
    });
    expect(textOf(result)).toBe("");
  });
});

describe("read_media_file", () => {
  const cases: Array<[string, string, "image" | "audio"]> = [
    ["a.png", "image/png", "image"],
    ["a.jpg", "image/jpeg", "image"],
    ["a.JPEG", "image/jpeg", "image"],
    ["a.gif", "image/gif", "image"],
    ["a.webp", "image/webp", "image"],
    ["a.bmp", "image/bmp", "image"],
    ["a.svg", "image/svg+xml", "image"],
    ["a.mp3", "audio/mpeg", "audio"],
    ["a.wav", "audio/wav", "audio"],
    ["a.ogg", "audio/ogg", "audio"],
    ["a.flac", "audio/flac", "audio"],
  ];

  it.each(cases)(
    "returns %s as a %s %s block, round-tripping the bytes",
    async (name, mimeType, type) => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
      await fs.writeFile(path.join(dir, name), bytes);
      const result = await call(client, "read_media_file", {
        path: path.join(dir, name),
      });
      const block = { type, data: bytes.toString("base64"), mimeType };
      expect(result).toEqual({
        content: [block],
        structuredContent: { content: [block] },
      });
    },
  );

  it("returns any other file as an embedded resource with a pathToFileURL uri, never a blob block (#4029)", async () => {
    const bytes = Buffer.from([0x00, 0x01, 0xfe, 0xff]);
    const file = path.join(dir, "my café.bin");
    await fs.writeFile(file, bytes);
    const result = await call(client, "read_media_file", { path: file });
    const [block] = result.content;
    expect(block.type).toBe("resource");
    if (block.type !== "resource") return;
    expect(block.resource.mimeType).toBe("application/octet-stream");
    expect(block.resource.uri).toMatch(/^file:\/\/.*%20.*(%C3%A9|%CC%81)/);
    expect(fileURLToPath(block.resource.uri)).toBe(file);
    expect("blob" in block.resource && block.resource.blob).toBe(
      bytes.toString("base64"),
    );
    expect(result.structuredContent).toEqual({ content: result.content });
  });

  it("reports a read failure (a directory) as a tool error", async () => {
    await fs.mkdir(path.join(dir, "folder.png"));
    const result = await call(client, "read_media_file", {
      path: path.join(dir, "folder.png"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^EISDIR/);
  });
});

describe("read_multiple_files", () => {
  it("joins each file's content with its path, and reports per-file failures inline", async () => {
    const a = path.join(dir, "a.txt");
    const b = path.join(dir, "b.txt");
    const missing = path.join(dir, "missing.txt");
    await fs.writeFile(a, "alpha");
    await fs.writeFile(b, "beta");
    const result = await call(client, "read_multiple_files", {
      paths: [a, missing, b, "/etc/hostname"],
    });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    const parts = text.split("\n---\n");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe(`${a}:\nalpha\n`);
    expect(parts[1]).toMatch(
      new RegExp(
        `^${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: Error - ENOENT`,
      ),
    );
    expect(parts[2]).toBe(`${b}:\nbeta\n`);
    expect(parts[3]).toBe(
      `/etc/hostname: Error - Access denied - path outside allowed directories: /etc/hostname not in ${dir}`,
    );
  });

  it("reports a non-Error read failure by its string form", async () => {
    const a = path.join(dir, "a.txt");
    await fs.writeFile(a, "alpha");
    vi.spyOn(fs, "readFile").mockRejectedValueOnce("disk on fire");
    const result = await call(client, "read_multiple_files", { paths: [a] });
    expect(textOf(result)).toBe(`${a}: Error - disk on fire`);
  });

  it("rejects an empty paths array at input validation", async () => {
    const result = await call(client, "read_multiple_files", { paths: [] });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Input validation error/);
  });
});

describe("write_file", () => {
  it("creates a new file", async () => {
    const file = path.join(dir, "new.txt");
    const result = await call(client, "write_file", {
      path: file,
      content: "hello",
    });
    expect(result).toEqual({
      content: [{ type: "text", text: `Successfully wrote to ${file}` }],
      structuredContent: { content: `Successfully wrote to ${file}` },
    });
    expect(await fs.readFile(file, "utf-8")).toBe("hello");
  });

  it("echoes the requested path, not the resolved one, in its message", async () => {
    const result = await call(client, "write_file", {
      path: "relative.txt",
      content: "x",
    });
    expect(textOf(result)).toBe("Successfully wrote to relative.txt");
    expect(await fs.readFile(path.join(dir, "relative.txt"), "utf-8")).toBe(
      "x",
    );
  });

  // #4512: an overwrite writes through the existing file rather than renaming
  // a temp file over it, so the file keeps its inode, its creation time and
  // its permission bits.
  it("keeps the inode, birthtime and permission bits on overwrite (#4512)", async () => {
    const file = path.join(dir, "existing.txt");
    await fs.writeFile(file, "old");
    await fs.chmod(file, 0o640);
    const before = await fs.stat(file);
    await call(client, "write_file", { path: file, content: "new" });
    const after = await fs.stat(file);
    expect(await fs.readFile(file, "utf-8")).toBe("new");
    expect(after.ino).toBe(before.ino);
    expect(after.birthtimeMs).toBe(before.birthtimeMs);
    expect(after.mode & 0o777).toBe(0o640);
  });

  it("keeps a hard link on overwrite (#4512)", async () => {
    const file = path.join(dir, "linked.txt");
    const hardLink = path.join(dir, "hardlink.txt");
    await fs.writeFile(file, "shared");
    await fs.link(file, hardLink);
    await call(client, "write_file", { path: file, content: "changed" });
    expect(await fs.readFile(hardLink, "utf-8")).toBe("changed");
  });

  it("truncates the old content when the new content is shorter", async () => {
    const file = path.join(dir, "existing.txt");
    await fs.writeFile(file, "a much longer original");
    await call(client, "write_file", { path: file, content: "short" });
    expect(await fs.readFile(file, "utf-8")).toBe("short");
  });

  it("writes through a symlink inside the allowed directory to its target", async () => {
    const target = path.join(dir, "target.txt");
    const link = path.join(dir, "link.txt");
    await fs.writeFile(target, "before");
    await fs.symlink(target, link);
    await call(client, "write_file", { path: link, content: "after" });
    expect(await fs.readFile(target, "utf-8")).toBe("after");
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
  });

  // #3199: on Windows a rename over a file another process holds open fails
  // with EPERM. An overwrite never renames, so such a rename failing does not
  // matter, and no temp file is left behind. The rename is mocked, so this runs
  // on every platform.
  it("overwrites without a rename, so a rename failing with EPERM does not matter (#3199)", async () => {
    const file = path.join(dir, "locked.txt");
    await fs.writeFile(file, "original");
    const rename = vi.spyOn(fs, "rename").mockRejectedValue(
      Object.assign(new Error("EPERM: operation not permitted, rename"), {
        code: "EPERM",
      }),
    );
    const result = await call(client, "write_file", {
      path: file,
      content: "replacement",
    });
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe("replacement");
    expect(await fs.readdir(dir)).toEqual(["locked.txt"]);
    expect(rename).not.toHaveBeenCalled();
  });

  // The TOCTOU window: validation resolved the path to a regular file, then
  // something swapped what is at the path before the write opened it. The swap
  // is staged inside the server's own lstat call, so it lands in that window.
  describe("a path swapped after validation", () => {
    const swapAfterLstat = (swap: () => Promise<void>) => {
      const realLstat = fs.lstat.bind(fs);
      vi.spyOn(fs, "lstat").mockImplementationOnce(async (p, opts) => {
        const stats = await realLstat(p, opts);
        await swap();
        return stats;
      });
    };

    it.skipIf(process.platform === "win32")(
      "refuses to write through a symlink swapped in",
      async () => {
        const file = path.join(dir, "victim.txt");
        const outside = await makeTempDir("mcp-fs-outside-");
        const secret = path.join(outside, "secret.txt");
        await fs.writeFile(file, "original");
        await fs.writeFile(secret, "SECRET");
        try {
          swapAfterLstat(async () => {
            await fs.unlink(file);
            await fs.symlink(secret, file);
          });
          const result = await call(client, "write_file", {
            path: file,
            content: "pwned",
          });
          expect(result.isError).toBe(true);
          expect(textOf(result)).toMatch(/^ELOOP/);
          expect(await fs.readFile(secret, "utf-8")).toBe("SECRET");
        } finally {
          await fs.rm(outside, { recursive: true, force: true });
        }
      },
    );

    it("refuses to write to a different file swapped in", async () => {
      const file = path.join(dir, "victim.txt");
      const other = path.join(dir, "other.txt");
      await fs.writeFile(file, "original");
      await fs.writeFile(other, "other");
      swapAfterLstat(() => fs.rename(other, file));
      const result = await call(client, "write_file", {
        path: file,
        content: "replacement",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        `Refusing to write: ${file} was replaced while it was being opened`,
      );
      expect(await fs.readFile(file, "utf-8")).toBe("other");
    });
  });

  it("refuses to overwrite a directory", async () => {
    const sub = path.join(dir, "sub");
    await fs.mkdir(sub);
    const result = await call(client, "write_file", {
      path: sub,
      content: "x",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Refusing to write: not a regular file: ${sub}`,
    );
  });

  it("reports a create failure other than EEXIST as is", async () => {
    vi.spyOn(fs, "writeFile").mockRejectedValueOnce(
      Object.assign(new Error("EIO: i/o error"), { code: "EIO" }),
    );
    const result = await call(client, "write_file", {
      path: path.join(dir, "new.txt"),
      content: "x",
    });
    expect(textOf(result)).toBe("EIO: i/o error");
  });

  it("reports a missing parent directory as ENOENT", async () => {
    const result = await call(client, "write_file", {
      path: path.join(dir, "no", "such", "file.txt"),
      content: "x",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^ENOENT: no such file or directory/);
  });
});

describe("edit_file", () => {
  let file: string;

  beforeEach(async () => {
    file = path.join(dir, "code.ts");
    await fs.writeFile(
      file,
      "function greet() {\n  console.log('hi');\n  return 1;\n}\n",
    );
  });

  it("applies an exact edit and returns a fenced unified diff", async () => {
    const result = await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "return 1;", newText: "return 2;" }],
    });
    expect(textOf(result)).toBe(
      "```diff\n" +
        `Index: ${file}\n` +
        "===================================================================\n" +
        `--- ${file}\toriginal\n` +
        `+++ ${file}\tmodified\n` +
        "@@ -1,4 +1,4 @@\n" +
        " function greet() {\n" +
        "   console.log('hi');\n" +
        "-  return 1;\n" +
        "+  return 2;\n" +
        " }\n" +
        "```\n\n",
    );
    expect(await fs.readFile(file, "utf-8")).toContain("return 2;");
  });

  it("leaves the file alone on a dry run", async () => {
    const result = await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "return 1;", newText: "return 2;" }],
      dryRun: true,
    });
    expect(textOf(result)).toContain("+  return 2;");
    expect(await fs.readFile(file, "utf-8")).toContain("return 1;");
  });

  it("applies several edits in order, each against the previous result", async () => {
    await call(client, "edit_file", {
      path: file,
      edits: [
        { oldText: "return 1;", newText: "return 2;" },
        { oldText: "return 2;", newText: "return 3;" },
      ],
    });
    expect(await fs.readFile(file, "utf-8")).toContain("return 3;");
  });

  it("replaces only the first occurrence of an exact match", async () => {
    await fs.writeFile(file, "x\nx\n");
    await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "x", newText: "y" }],
    });
    expect(await fs.readFile(file, "utf-8")).toBe("y\nx\n");
  });

  it("inserts $ patterns in newText literally", async () => {
    await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "return 1;", newText: "return '$&$1$$';" }],
    });
    expect(await fs.readFile(file, "utf-8")).toContain("return '$&$1$$';");
  });

  it("reports an edit with no match, quoting its oldText", async () => {
    const result = await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "return 9;", newText: "x" }],
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "Could not find exact match for edit:\nreturn 9;",
    );
  });

  it("widens the diff fence when the diff itself contains backticks", async () => {
    await fs.writeFile(file, "a\n");
    const result = await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "a", newText: "````" }],
    });
    const text = textOf(result);
    expect(text.startsWith("`````diff\n")).toBe(true);
    expect(text.endsWith("`````\n\n")).toBe(true);
  });

  // KNOWN BUG #4991: any edit silently converts a CRLF file's line endings to LF; the fix changes this assertion.
  // The CRLF in the file is normalized away by any edit, dry run aside.
  it("rewrites a CRLF file with LF line endings", async () => {
    await fs.writeFile(file, "a\r\nb\r\n");
    await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "a\r\n", newText: "c\r\n" }],
    });
    expect(await fs.readFile(file, "utf-8")).toBe("c\nb\n");
  });

  // #2034: when there is no exact substring, the matcher compares line by line
  // with leading and trailing whitespace trimmed, and reindents the
  // replacement. These pin its current reindentation rules.
  describe("whitespace-tolerant matcher (#2034)", () => {
    // KNOWN BUG #4990: lines after the first lose the file's indentation when oldText's line has none; the fix changes this assertion.
    it("matches lines whose indentation differs from oldText", async () => {
      await call(client, "edit_file", {
        path: file,
        edits: [
          {
            oldText: "console.log('hi');\nreturn 1;",
            newText: "console.log('bye');\nreturn 0;",
          },
        ],
      });
      // First line takes the file's indentation; later lines without
      // indentation of their own are inserted as given.
      expect(await fs.readFile(file, "utf-8")).toBe(
        "function greet() {\n  console.log('bye');\nreturn 0;\n}\n",
      );
    });

    // KNOWN BUG #4990: a replacement line whose oldText line has no indent ignores the file's indentation; the fix changes this assertion.
    it("keeps relative indentation when both old and new lines are indented", async () => {
      await fs.writeFile(file, "    if (a) {\n        b();\n    }\n");
      await call(client, "edit_file", {
        path: file,
        edits: [
          {
            oldText: "if (a) {\n  b();\n}",
            newText: "if (a) {\n      c();\n  }",
          },
        ],
      });
      // Line 2: new indent 6 - old indent 2 = 4 extra spaces on top of the
      // first line's 4. Line 3: old line "}" has no indent, so the new
      // line is inserted as given.
      expect(await fs.readFile(file, "utf-8")).toBe(
        "    if (a) {\n        c();\n  }\n",
      );
    });

    it("clamps a negative relative indent to the first line's indentation", async () => {
      await fs.writeFile(file, "  x\n      y\n");
      await call(client, "edit_file", {
        path: file,
        edits: [{ oldText: "x\n    y", newText: "x\n z" }],
      });
      expect(await fs.readFile(file, "utf-8")).toBe("  x\n  z\n");
    });

    it("inserts extra replacement lines beyond oldText's length as given", async () => {
      await fs.writeFile(file, "a\nb\n");
      await call(client, "edit_file", {
        path: file,
        edits: [{ oldText: " a ", newText: "a\n  added" }],
      });
      expect(await fs.readFile(file, "utf-8")).toBe("a\n  added\nb\n");
    });

    it("reports no match when a line differs beyond whitespace", async () => {
      const result = await call(client, "edit_file", {
        path: file,
        edits: [{ oldText: "console.log('hi');\nreturn 2;", newText: "x" }],
      });
      expect(result.isError).toBe(true);
    });
  });

  it("keeps the inode, birthtime and permission bits on edit (#4512)", async () => {
    await fs.chmod(file, 0o600);
    const before = await fs.stat(file);
    await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "return 1;", newText: "return 2;" }],
    });
    const after = await fs.stat(file);
    expect(await fs.readFile(file, "utf-8")).toContain("return 2;");
    expect(after.ino).toBe(before.ino);
    expect(after.birthtimeMs).toBe(before.birthtimeMs);
    expect(after.mode & 0o777).toBe(0o600);
  });

  it("keeps a hard link on edit (#4512)", async () => {
    const hardLink = path.join(dir, "hardlink.ts");
    await fs.link(file, hardLink);
    await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "return 1;", newText: "return 2;" }],
    });
    expect(await fs.readFile(hardLink, "utf-8")).toContain("return 2;");
  });

  it("edits without a rename, so a rename failing with EPERM does not matter (#3199)", async () => {
    const rename = vi
      .spyOn(fs, "rename")
      .mockRejectedValue(new Error("EPERM rename"));
    const result = await call(client, "edit_file", {
      path: file,
      edits: [{ oldText: "return 1;", newText: "return 2;" }],
    });
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toContain("return 2;");
    expect(await fs.readdir(dir)).toEqual(["code.ts"]);
    expect(rename).not.toHaveBeenCalled();
  });
});

describe("create_directory", () => {
  it("creates nested directories in one call (#4629)", async () => {
    const target = path.join(dir, "a", "b", "c");
    const result = await call(client, "create_directory", { path: target });
    expect(textOf(result)).toBe(`Successfully created directory ${target}`);
    expect((await fs.stat(target)).isDirectory()).toBe(true);
  });

  it("succeeds on an existing directory", async () => {
    const result = await call(client, "create_directory", { path: dir });
    expect(result.isError).toBeFalsy();
  });

  it("reports an existing file in the way", async () => {
    await fs.writeFile(path.join(dir, "file"), "");
    const result = await call(client, "create_directory", {
      path: path.join(dir, "file"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^EEXIST/);
  });
});

describe("list_directory", () => {
  it("lists entries with [DIR] and [FILE] prefixes", async () => {
    await fs.mkdir(path.join(dir, "sub"));
    await fs.writeFile(path.join(dir, "f.txt"), "");
    const result = await call(client, "list_directory", { path: dir });
    expect(textOf(result).split("\n").sort()).toEqual([
      "[DIR] sub",
      "[FILE] f.txt",
    ]);
  });

  it("returns empty text for an empty directory", async () => {
    const result = await call(client, "list_directory", { path: dir });
    expect(textOf(result)).toBe("");
  });

  it("reports a file path as ENOTDIR", async () => {
    await fs.writeFile(path.join(dir, "f.txt"), "");
    const result = await call(client, "list_directory", {
      path: path.join(dir, "f.txt"),
    });
    expect(textOf(result)).toMatch(/^ENOTDIR/);
  });
});

describe("list_directory_with_sizes", () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(dir, "b.txt"), "x".repeat(2048));
    await fs.writeFile(path.join(dir, "a.txt"), "xy");
    await fs.mkdir(path.join(dir, "c"));
  });

  it("sorts by name by default and appends a summary", async () => {
    const result = await call(client, "list_directory_with_sizes", {
      path: dir,
    });
    expect(textOf(result)).toBe(
      [
        `[FILE] ${"a.txt".padEnd(30)} ${"2 B".padStart(10)}`,
        `[FILE] ${"b.txt".padEnd(30)} ${"2.00 KB".padStart(10)}`,
        `[DIR] ${"c".padEnd(30)} `,
        "",
        "Total: 2 files, 1 directories",
        "Combined size: 2.00 KB",
      ].join("\n"),
    );
  });

  it("sorts by size, largest first, when asked", async () => {
    const result = await call(client, "list_directory_with_sizes", {
      path: dir,
      sortBy: "size",
    });
    // Directories sort by their own stat size, which the listing does not
    // show and which varies by file system, so only the files are compared.
    const files = textOf(result)
      .split("\n")
      .filter((line) => line.startsWith("[FILE]"))
      .map((line) => line.split(/\s+/)[1]);
    expect(files).toEqual(["b.txt", "a.txt"]);
  });

  it("lists an entry it cannot stat (a dangling symlink) as size 0", async () => {
    await fs.symlink(path.join(dir, "gone"), path.join(dir, "dangling"));
    const result = await call(client, "list_directory_with_sizes", {
      path: dir,
    });
    expect(textOf(result)).toContain(
      `[FILE] ${"dangling".padEnd(30)} ${"0 B".padStart(10)}`,
    );
    expect(textOf(result)).toContain("Total: 3 files, 1 directories");
  });

  it("summarizes an empty directory", async () => {
    const empty = path.join(dir, "c");
    const result = await call(client, "list_directory_with_sizes", {
      path: empty,
    });
    expect(textOf(result)).toBe(
      "\nTotal: 0 files, 0 directories\nCombined size: 0 B",
    );
  });
});

describe("directory_tree", () => {
  beforeEach(async () => {
    await fs.mkdir(path.join(dir, "src"));
    await fs.mkdir(path.join(dir, "node_modules"));
    await fs.mkdir(path.join(dir, ".git"));
    await fs.mkdir(path.join(dir, "nested", "node_modules"), {
      recursive: true,
    });
    await fs.writeFile(path.join(dir, ".env"), "");
    await fs.writeFile(path.join(dir, ".env.local"), "");
    await fs.writeFile(path.join(dir, "src", "index.js"), "");
    await fs.writeFile(path.join(dir, "package.json"), "{}");
    await fs.writeFile(path.join(dir, "node_modules", "m.js"), "");
    await fs.writeFile(path.join(dir, "nested", "node_modules", "d.js"), "");
  });

  async function tree(
    excludePatterns?: string[],
    root: string = dir,
  ): Promise<TreeEntry[]> {
    const result = await call(client, "directory_tree", {
      path: root,
      ...(excludePatterns ? { excludePatterns } : {}),
    });
    return sortTree(JSON.parse(textOf(result)) as TreeEntry[]);
  }

  it("returns the whole tree as 2-space-indented JSON; directories always carry children", async () => {
    const result = await call(client, "directory_tree", {
      path: path.join(dir, "src"),
    });
    expect(textOf(result)).toBe(
      '[\n  {\n    "name": "index.js",\n    "type": "file"\n  }\n]',
    );
    expect(await tree()).toEqual([
      { name: ".env", type: "file" },
      { name: ".env.local", type: "file" },
      { name: ".git", type: "directory", children: [] },
      {
        name: "nested",
        type: "directory",
        children: [
          {
            name: "node_modules",
            type: "directory",
            children: [{ name: "d.js", type: "file" }],
          },
        ],
      },
      {
        name: "node_modules",
        type: "directory",
        children: [{ name: "m.js", type: "file" }],
      },
      { name: "package.json", type: "file" },
      {
        name: "src",
        type: "directory",
        children: [{ name: "index.js", type: "file" }],
      },
    ]);
  });

  it("excludes a bare name at any depth, and not its prefix matches", async () => {
    const names = (await tree(["node_modules", ".env"])).map((e) => e.name);
    expect(names).toEqual([
      ".env.local",
      ".git",
      "nested",
      "package.json",
      "src",
    ]);
    const nested = (await tree(["node_modules"])).find(
      (e) => e.name === "nested",
    );
    expect(nested?.children).toEqual([]);
  });

  it("matches a glob pattern against the relative path only", async () => {
    const names = (await tree(["*.env"])).map((e) => e.name);
    expect(names).not.toContain(".env");
    expect(names).toContain(".env.local");
    const deep = await tree(["*.js"]);
    // "*.js" does not cross a separator, so nested files stay.
    expect(deep.find((e) => e.name === "src")?.children).toEqual([
      { name: "index.js", type: "file" },
    ]);
  });

  it("lists a symlinked directory as a file and does not descend into it", async () => {
    await fs.symlink(path.join(dir, "src"), path.join(dir, "srclink"));
    const entry = (await tree()).find((e) => e.name === "srclink");
    expect(entry).toEqual({ name: "srclink", type: "file" });
  });

  it("refuses a root outside the allowed directories", async () => {
    const result = await call(client, "directory_tree", { path: "/" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Access denied/);
  });
});

describe("move_file", () => {
  it("moves a file and reports the requested paths", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(dir, "b.txt");
    await fs.writeFile(source, "a");
    const result = await call(client, "move_file", { source, destination });
    expect(textOf(result)).toBe(
      `Successfully moved ${source} to ${destination}`,
    );
    expect(await fs.readFile(destination, "utf-8")).toBe("a");
    await expect(fs.stat(source)).rejects.toThrow();
  });

  it("moves a directory", async () => {
    await fs.mkdir(path.join(dir, "d1"));
    await fs.writeFile(path.join(dir, "d1", "f"), "x");
    await call(client, "move_file", {
      source: path.join(dir, "d1"),
      destination: path.join(dir, "d2"),
    });
    expect(await fs.readFile(path.join(dir, "d2", "f"), "utf-8")).toBe("x");
  });

  it("refuses to overwrite an existing destination", async () => {
    await fs.writeFile(path.join(dir, "a.txt"), "a");
    await fs.writeFile(path.join(dir, "b.txt"), "b");
    const result = await call(client, "move_file", {
      source: path.join(dir, "a.txt"),
      destination: path.join(dir, "b.txt"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Destination already exists: ${path.join(dir, "b.txt")}`,
    );
    expect(await fs.readFile(path.join(dir, "b.txt"), "utf-8")).toBe("b");
  });

  it("refuses a destination outside the allowed directories", async () => {
    await fs.writeFile(path.join(dir, "a.txt"), "a");
    const result = await call(client, "move_file", {
      source: path.join(dir, "a.txt"),
      destination: "/tmp-outside-allowed/a.txt",
    });
    expect(textOf(result)).toMatch(/^Access denied/);
  });

  it("reports a missing source as ENOENT", async () => {
    const result = await call(client, "move_file", {
      source: path.join(dir, "missing"),
      destination: path.join(dir, "b"),
    });
    expect(textOf(result)).toMatch(/^ENOENT/);
  });

  it("reports a destination lstat failure other than ENOENT as is", async () => {
    await fs.writeFile(path.join(dir, "a.txt"), "a");
    vi.spyOn(fs, "lstat").mockRejectedValueOnce(new Error("EACCES lstat"));
    const result = await call(client, "move_file", {
      source: path.join(dir, "a.txt"),
      destination: path.join(dir, "b.txt"),
    });
    expect(textOf(result)).toBe("EACCES lstat");
  });
});

describe("search_files", () => {
  beforeEach(async () => {
    await fs.mkdir(path.join(dir, "sub", "deeper"), { recursive: true });
    await fs.writeFile(path.join(dir, "top.txt"), "");
    await fs.writeFile(path.join(dir, "top.log"), "");
    await fs.writeFile(path.join(dir, "sub", "mid.txt"), "");
    await fs.writeFile(path.join(dir, "sub", "deeper", "low.txt"), "");
  });

  async function search(args: Record<string, unknown>): Promise<string[]> {
    const text = textOf(
      await call(client, "search_files", { path: dir, ...args }),
    );
    return text.split("\n").sort();
  }

  it("matches a bare glob against top-level entries only", async () => {
    expect(await search({ pattern: "*.txt" })).toEqual([
      path.join(dir, "top.txt"),
    ]);
  });

  it("recurses into subdirectories for a ** glob", async () => {
    expect(await search({ pattern: "**/*.txt" })).toEqual([
      path.join(dir, "sub", "deeper", "low.txt"),
      path.join(dir, "sub", "mid.txt"),
      path.join(dir, "top.txt"),
    ]);
  });

  it("matches directories as well as files", async () => {
    expect(await search({ pattern: "**/deeper" })).toEqual([
      path.join(dir, "sub", "deeper"),
    ]);
  });

  it("skips excluded paths and does not descend into them", async () => {
    expect(
      await search({ pattern: "**/*.txt", excludePatterns: ["sub"] }),
    ).toEqual([path.join(dir, "top.txt")]);
  });

  it('says "No matches found" when nothing matches', async () => {
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "*.none",
    });
    expect(textOf(result)).toBe("No matches found");
  });

  it("silently skips a symlink that leaves the allowed directories", async () => {
    const outside = await makeTempDir("mcp-fs-outside-");
    try {
      await fs.writeFile(path.join(outside, "secret.txt"), "");
      await fs.symlink(outside, path.join(dir, "escape"));
      expect(await search({ pattern: "**/*" })).not.toContain(
        path.join(dir, "escape"),
      );
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});

describe("get_file_info", () => {
  it("reports a file's metadata as key: value lines", async () => {
    const file = path.join(dir, "f.txt");
    await fs.writeFile(file, "12345");
    await fs.chmod(file, 0o640);
    const lines = textOf(
      await call(client, "get_file_info", { path: file }),
    ).split("\n");
    expect(lines.map((l) => l.split(":")[0])).toEqual([
      "size",
      "created",
      "modified",
      "accessed",
      "isDirectory",
      "isFile",
      "permissions",
    ]);
    expect(lines[0]).toBe("size: 5");
    expect(lines[4]).toBe("isDirectory: false");
    expect(lines[5]).toBe("isFile: true");
    expect(lines[6]).toBe("permissions: 640");
    // Dates are rendered with Date#toString, in the server's local time zone.
    expect(lines[2]).toMatch(/^modified: \w{3} \w{3} \d{2} \d{4} /);
  });

  it("reports a directory", async () => {
    const text = textOf(await call(client, "get_file_info", { path: dir }));
    expect(text).toContain("isDirectory: true");
    expect(text).toContain("isFile: false");
  });
});

describe("list_allowed_directories", () => {
  it("lists the directories the server was built with", async () => {
    const result = await call(client, "list_allowed_directories");
    expect(textOf(result)).toBe(`Allowed directories:\n${dir}`);
  });
});

describe("two servers in one process", () => {
  it("keep separate allow-lists (#4854)", async () => {
    const other = await makeTempDir("mcp-fs-other-");
    const second = await connect([other]);
    try {
      await fs.writeFile(path.join(dir, "mine.txt"), "mine");
      await fs.writeFile(path.join(other, "theirs.txt"), "theirs");
      expect(await allowedDirectoriesOf(second.client)).toEqual([other]);
      expect(await allowedDirectoriesOf(client)).toEqual([dir]);
      const crossed = await call(second.client, "read_text_file", {
        path: path.join(dir, "mine.txt"),
      });
      expect(textOf(crossed)).toMatch(/^Access denied/);
      const own = await call(second.client, "read_text_file", {
        path: path.join(other, "theirs.txt"),
      });
      expect(textOf(own)).toBe("theirs");
    } finally {
      await second.close();
      await fs.rm(other, { recursive: true, force: true });
    }
  });
});
