/**
 * Characterizes how the static document resources and the server
 * instructions handle the docs directory's contents (#4854): the MIME type
 * chosen by extension, skipped directories and vanished entries, a file that
 * cannot be read, and a missing docs directory. The shipped docs/ holds only
 * Markdown, so these cases stand in synthetic entries through a mocked `fs`;
 * everything else is the real server, driven over the protocol.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type FsModule = typeof import("fs");

/** Load the harness against an `fs` whose docs/ is altered by `overrides`. */
async function harnessWithFs(overrides: (real: FsModule) => Partial<FsModule>) {
  vi.resetModules();
  vi.doMock("fs", async (importOriginal) => {
    const real = await importOriginal<FsModule>();
    return { ...real, ...overrides(real) };
  });
  return import("./harness.js");
}

afterEach(() => {
  vi.doUnmock("fs");
  vi.resetModules();
});

const isDocs = (p: unknown) => String(p).replace(/\\/g, "/").includes("/docs");

describe("static document resources", () => {
  const EXTRA: Record<string, string> = {
    "notes.txt": "plain notes",
    "data.json": '{"a":1}',
    "LONG.MARKDOWN": "# upper case",
    "raw.bin": "bytes",
  };

  it("types files by extension, skips directories and vanished entries, and reports unreadable files in the text", async () => {
    const harness = await harnessWithFs((real) => ({
      readdirSync: ((p: string) =>
        isDocs(p)
          ? [
              ...(real.readdirSync(p) as string[]),
              ...Object.keys(EXTRA),
              "subdir",
              "vanished.md",
              "unreadable.md",
            ]
          : real.readdirSync(p)) as FsModule["readdirSync"],
      statSync: ((p: string) => {
        const name = String(p).split(/[\\/]/).pop()!;
        if (name === "vanished.md") throw new Error("ENOENT");
        if (name === "subdir") return { isFile: () => false };
        if (name in EXTRA || name === "unreadable.md")
          return { isFile: () => true };
        return real.statSync(p);
      }) as FsModule["statSync"],
      readFileSync: ((p: string, enc: BufferEncoding) => {
        const name = String(p).split(/[\\/]/).pop()!;
        if (name === "unreadable.md") throw new Error("EACCES");
        if (name in EXTRA) return EXTRA[name];
        return real.readFileSync(p, enc);
      }) as FsModule["readFileSync"],
    }));
    const session = await harness.connect();
    try {
      const { resources } = await session.client.listResources();
      const byName = Object.fromEntries(resources.map((r) => [r.name, r]));
      expect(byName["notes.txt"].mimeType).toBe("text/plain");
      expect(byName["data.json"].mimeType).toBe("application/json");
      expect(byName["LONG.MARKDOWN"].mimeType).toBe("text/markdown");
      expect(byName["raw.bin"].mimeType).toBe("text/plain");
      expect(byName["subdir"]).toBeUndefined();
      expect(byName["vanished.md"]).toBeUndefined();

      const { contents } = await session.client.readResource({
        uri: byName["data.json"].uri,
      });
      expect(contents).toEqual([
        {
          uri: byName["data.json"].uri,
          mimeType: "application/json",
          text: '{"a":1}',
        },
      ]);

      const unreadable = await session.client.readResource({
        uri: byName["unreadable.md"].uri,
      });
      expect(unreadable.contents[0]).toMatchObject({
        mimeType: "text/markdown",
        text: expect.stringMatching(
          /^Error reading file: .*unreadable\.md\. Error: EACCES$/,
        ),
      });
    } finally {
      await session.close();
    }
  });

  it("registers none, and says the instructions did not load, without a docs directory", async () => {
    const harness = await harnessWithFs((real) => ({
      readdirSync: ((p: string) => {
        if (isDocs(p)) throw new Error("ENOENT: no docs");
        return real.readdirSync(p);
      }) as FsModule["readdirSync"],
      readFileSync: ((p: string, enc: BufferEncoding) => {
        if (isDocs(p)) throw new Error("ENOENT: no docs");
        return real.readFileSync(p, enc);
      }) as FsModule["readFileSync"],
    }));
    const session = await harness.connect();
    try {
      const { resources } = await session.client.listResources();
      expect(resources).toEqual([]);
      expect(session.client.getInstructions()).toBe(
        "Server instructions not loaded: Error: ENOENT: no docs",
      );
    } finally {
      await session.close();
    }
  });
});
