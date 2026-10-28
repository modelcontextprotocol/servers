// The edit_file no-match error (#2034). An edit whose oldText matches nowhere
// used to fail with only "Could not find exact match", leaving a model to
// guess at an invisible whitespace difference. The error now names the edit,
// states what the matcher tolerates, and quotes the closest lines of the file
// with line numbers and the first differing line JSON-quoted. These tests pin
// that report, and that it stays a report: a near match is never applied.

import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeEditMismatch } from "../lib.js";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

describe("edit_file no-match error, over the protocol", () => {
  let dir: string;
  let conn: Connected;
  let file: string;
  const original =
    "function greet() {\n" +
    "  const name = 'world';\n" +
    "  console.log('hello', name);\n" +
    "  return name;\n" +
    "}\n";

  beforeEach(async () => {
    quietStderr();
    dir = await makeTempDir("mcp-fs-edit-mismatch-");
    conn = await connect([dir]);
    file = path.join(dir, "greet.ts");
    await fs.writeFile(file, original);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await conn.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("names the failed edit, quotes the closest lines and writes nothing", async () => {
    const result = await call(conn.client, "edit_file", {
      path: file,
      edits: [
        { oldText: "return name;", newText: "return name.length;" },
        // A tab where the file has a space, inside the line: not tolerated.
        {
          oldText: "  const name = 'world';\n  console.log('hello',\tname);",
          newText: "  console.log('bye');",
        },
      ],
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "Could not find exact match for edit 2 of 2. oldText must match the " +
        "file's text exactly; only line endings, and leading and trailing " +
        "whitespace on whole lines, may differ. No edits were applied.\n\n" +
        "oldText:\n  const name = 'world';\n  console.log('hello',\tname);\n\n" +
        "Closest text in the file (lines 1-5 of 5, after the earlier edits " +
        "in this call):\n" +
        "1: function greet() {\n" +
        "2:   const name = 'world';\n" +
        "3:   console.log('hello', name);\n" +
        "4:   return name.length;\n" +
        "5: }\n\n" +
        "First difference, oldText line 2 against file line 3:\n" +
        "  oldText: \"  console.log('hello',\\tname);\"\n" +
        "  file:    \"  console.log('hello', name);\"\n\n" +
        "Retry with oldText copied exactly from the file, without the " +
        "line-number prefixes.",
    );
    // The first edit matched, but a failed call applies none of them.
    expect(await fs.readFile(file, "utf-8")).toBe(original);
  });

  it("still applies an edit that differs only in indentation", async () => {
    await call(conn.client, "edit_file", {
      path: file,
      edits: [{ oldText: "    return name;\n}", newText: "    return 0;\n}" }],
    });
    const edited = await fs.readFile(file, "utf-8");
    expect(edited).toContain("\n  return 0;\n}");
    expect(edited).not.toContain("    return 0;");
  });

  it("states the matching rules in the tool description", async () => {
    const { tools } = await conn.client.listTools();
    const description = tools.find((t) => t.name === "edit_file")?.description;
    expect(description).toContain("Whitespace inside a line must match.");
    expect(description).toContain("line endings (LF or CRLF) never matter");
    expect(description).toContain("nothing is written");
  });
});

describe("describeEditMismatch", () => {
  const lines = (n: number, prefix = "line") =>
    Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

  it("omits the earlier-edits note for the first edit", () => {
    const message = describeEditMismatch("alpha\nbeta\n", "betta", 0, 1);
    expect(message).toContain("edit 1 of 1");
    expect(message).toContain("(lines 1-2 of 2):\n1: alpha\n2: beta");
    expect(message).toContain('  oldText: "betta"\n  file:    "beta"');
  });

  it("picks the most similar run of lines, the earliest on a tie", () => {
    const content = [...lines(10), "target  x", ...lines(10), "target  x"].join(
      "\n",
    );
    const message = describeEditMismatch(content, "target x", 0, 1);
    expect(message).toContain("(lines 9-13 of 22):");
    expect(message).toContain("11: target  x");
    expect(message).toContain("oldText line 1 against file line 11");
  });

  it("normalizes CRLF in oldText before comparing", () => {
    const message = describeEditMismatch("a\nb\nc\n", "a\r\nB\r\n", 0, 1);
    expect(message).toContain("oldText line 2 against file line 2");
  });

  it("reports oldText that runs past the end of the file", () => {
    const message = describeEditMismatch("a\nb\n", "a\nb\nc", 0, 1);
    expect(message).toContain("(lines 1-2 of 2):");
    expect(message).toContain(
      'oldText line 3 ("c") runs past the end of the file, which ends at line 2.',
    );
  });

  it("says so when no line resembles oldText", () => {
    const message = describeEditMismatch("abc\ndef\n", "xyz", 0, 1);
    expect(message).toContain("No line of the file resembles oldText.");
    expect(message).not.toContain("Closest text");
  });

  it("handles an empty file", () => {
    const message = describeEditMismatch("", "x", 0, 1);
    expect(message).toContain("No line of the file resembles oldText.");
  });

  it("caps the quoted region at 30 lines", () => {
    const content = lines(50).join("\n");
    const oldText = [...lines(39), "line 40 changed"].join("\n");
    const message = describeEditMismatch(content, oldText, 0, 1);
    expect(message).toContain("(lines 1-30 of 50):");
    expect(message).toContain("\n30: line 30\n");
    expect(message).not.toContain("\n31: ");
    expect(message).toContain("oldText line 40 against file line 40");
  });

  it("skips the search on a file too large to compare", () => {
    const content = lines(2000).join("\n");
    const oldText = lines(1000, "other").join("\n");
    const message = describeEditMismatch(content, oldText, 1, 3);
    expect(message).toContain("edit 2 of 3");
    expect(message).toContain(
      "The file has 2000 lines, too many to search for the closest text.",
    );
    expect(message).not.toContain("Closest text");
  });
});
