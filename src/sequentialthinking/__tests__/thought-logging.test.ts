// The server's other observable output: unless DISABLE_THOUGHT_LOGGING is
// "true" (any case), each accepted thought is drawn as a box on stderr, with
// a header that differs for plain thoughts, revisions and branches, and one
// row per line of the thought, wrapped at MAX_BOX_TEXT_WIDTH and cut off
// once header and thought fill MAX_BOX_ROWS rows. Thoughts
// are driven through the in-process client and stderr is captured by spying
// on console.error, which also keeps the boxes off the test output. chalk's
// colour level depends on the terminal the tests run in, so it is pinned to 0
// (no colour) around each test; the last test turns colour on to check that
// the border width ignores the header's escape codes.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import chalk from "chalk";
import { MAX_BOX_ROWS, MAX_BOX_TEXT_WIDTH } from "../lib.js";
import { connect, thought, type Connected } from "./helpers.js";

describe("sequentialthinking thought logging", () => {
  let errorSpy: MockInstance<typeof console.error>;
  let conn: Connected | undefined;
  let chalkLevel: typeof chalk.level;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    chalkLevel = chalk.level;
    chalk.level = 0;
  });

  afterEach(async () => {
    await conn?.close();
    conn = undefined;
    chalk.level = chalkLevel;
    errorSpy.mockRestore();
  });

  function logged(): string[] {
    return errorSpy.mock.calls.map((args) => String(args[0]));
  }

  /**
   * The box the server draws, for an uncoloured header: one row per line of
   * the thought (given as an array), sized to the longest row.
   */
  function box(header: string, text: string | string[]): string {
    const lines = typeof text === "string" ? [text] : text;
    const width = Math.max(header.length, ...lines.map((l) => l.length));
    const border = "─".repeat(width + 4);
    const rows = lines.map((l) => `│ ${l.padEnd(border.length - 2)} │`);
    return `
┌${border}┐
│ ${header.padEnd(border.length - 2)} │
├${border}┤
${rows.join("\n")}
└${border}┘`;
  }

  describe.each([
    ["unset", undefined],
    ['"false"', "false"],
    ['"1"', "1"],
    ['""', ""],
  ])("with DISABLE_THOUGHT_LOGGING %s", (_label, value) => {
    it("logs each accepted thought", async () => {
      conn = await connect({ disableThoughtLogging: value });
      await conn.think(thought());
      expect(logged()).toHaveLength(1);
    });
  });

  it.each(["true", "TRUE", "True"])(
    "logs nothing with DISABLE_THOUGHT_LOGGING %j",
    async (value) => {
      conn = await connect({ disableThoughtLogging: value });
      await conn.think(thought());
      expect(logged()).toEqual([]);
    },
  );

  describe("with logging on", () => {
    beforeEach(async () => {
      conn = await connect({ disableThoughtLogging: undefined });
    });

    it("draws a plain thought", async () => {
      await conn!.think(thought({ thought: "first", thoughtNumber: 1 }));
      expect(logged()).toEqual([box("💭 Thought 1/3", "first")]);
    });

    it("draws a revision, naming the revised thought", async () => {
      await conn!.think(
        thought({
          thought: "again",
          thoughtNumber: 2,
          isRevision: true,
          revisesThought: 1,
        }),
      );
      expect(logged()).toEqual([
        box("🔄 Revision 2/3 (revising thought 1)", "again"),
      ]);
    });

    // #5000: with no revisesThought, the "revising thought N" suffix is left out.
    it("draws a plain revision header when no revisesThought is given", async () => {
      await conn!.think(thought({ thought: "x", isRevision: true }));
      expect(logged()).toEqual([box("🔄 Revision 1/3", "x")]);
      expect(logged()[0]).not.toContain("undefined");
    });

    it("draws a branch, naming its origin and id", async () => {
      await conn!.think(
        thought({ thought: "fork", branchFromThought: 1, branchId: "alt" }),
      );
      expect(logged()).toEqual([
        box("🌿 Branch 1/3 (from thought 1, ID: alt)", "fork"),
      ]);
    });

    // #5000: with no branchId, the Branch header names the origin and omits the ID.
    it("omits the ID from a branch header when no branchId is given", async () => {
      await conn!.think(thought({ thought: "fork", branchFromThought: 2 }));
      expect(logged()).toEqual([box("🌿 Branch 1/3 (from thought 2)", "fork")]);
      expect(logged()[0]).not.toContain("undefined");
    });

    it("prefers the revision header when a thought is both", async () => {
      await conn!.think(
        thought({
          thought: "both",
          isRevision: true,
          revisesThought: 1,
          branchFromThought: 1,
          branchId: "b",
        }),
      );
      expect(logged()).toEqual([
        box("🔄 Revision 1/3 (revising thought 1)", "both"),
      ]);
    });

    it("draws the adjusted totalThoughts", async () => {
      await conn!.think(
        thought({ thought: "t", thoughtNumber: 4, totalThoughts: 2 }),
      );
      expect(logged()).toEqual([box("💭 Thought 4/4", "t")]);
    });

    it("widens the box to fit a thought longer than the header", async () => {
      const text = "a much longer thought than the header line is";
      await conn!.think(thought({ thought: text }));
      expect(logged()).toEqual([box("💭 Thought 1/3", text)]);
    });

    it("logs nothing for a call rejected by the schema", async () => {
      await conn!.think(thought({ nextThoughtNeeded: "yes" }));
      expect(logged()).toEqual([]);
    });

    // #4813: a branchId that names an Object.prototype key is an ordinary branch.
    it("draws the Branch box for a branchId that names an Object.prototype key", async () => {
      await conn!.think(
        thought({ branchFromThought: 1, branchId: "constructor" }),
      );
      expect(logged()).toEqual([
        box("🌿 Branch 1/3 (from thought 1, ID: constructor)", "a thought"),
      ]);
    });
  });

  // #5108: the header row is padded to the border's width, so every row of
  // the box is the same width, whether the header or the thought is longer.
  it.each([
    ["the header", "t"],
    ["the thought", "a much longer thought than the header line is"],
  ])("draws every row the same width when %s is longer", async (_l, text) => {
    conn = await connect({ disableThoughtLogging: undefined });
    await conn.think(thought({ thought: text }));
    const rows = logged()[0].split("\n").slice(1);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((row) => row.length)).size).toBe(1);
  });

  // #5205: a thought with line breaks is drawn one row per line, the box as
  // wide as its longest line, whichever line ending the client sent.
  describe("a multi-line thought", () => {
    beforeEach(async () => {
      conn = await connect({ disableThoughtLogging: undefined });
    });

    it.each([
      ["\\n", "\n"],
      ["\\r\\n", "\r\n"],
      ["a lone \\r", "\r"],
    ])("draws one row per line split by %s", async (_l, eol) => {
      const lines = [
        "first line",
        "a much longer second line of the thought",
        "3",
      ];
      await conn!.think(thought({ thought: lines.join(eol) }));
      expect(logged()).toEqual([box("💭 Thought 1/3", lines)]);
      expect(logged()[0]).not.toContain("\r");
    });

    it("sizes the box from the longest line, not the whole thought", async () => {
      await conn!.think(thought({ thought: "ab\ncd\nef" }));
      // Shorter than the header, so the header sets the width.
      expect(logged()).toEqual([box("💭 Thought 1/3", ["ab", "cd", "ef"])]);
    });

    it("keeps blank lines as blank rows", async () => {
      await conn!.think(thought({ thought: "top\n\nbottom\n" }));
      expect(logged()).toEqual([
        box("💭 Thought 1/3", ["top", "", "bottom", ""]),
      ]);
    });

    it("draws every row the same width", async () => {
      await conn!.think(
        thought({ thought: "short\na considerably longer line here\nmid" }),
      );
      const rows = logged()[0].split("\n").slice(1);
      expect(rows).toHaveLength(7);
      expect(new Set(rows.map((row) => row.length)).size).toBe(1);
    });

    // #5433: past MAX_BOX_ROWS the box stops drawing and says how many lines
    // it left out; the call itself is unaffected. The header's one row counts
    // toward the cap (#5526), so the thought gets the rest.
    it("draws a thought with very many lines", async () => {
      const lines = Array.from({ length: 200_000 }, (_, i) => `${i % 10}`);
      const result = await conn!.think(thought({ thought: lines.join("\n") }));
      expect(result.isError).toBeFalsy();
      const out = logged()[0].split("\n");
      // A leading blank, the borders and separator, MAX_BOX_ROWS rows of
      // header and thought, and the summary row.
      expect(out).toHaveLength(MAX_BOX_ROWS + 5);
      expect(out.at(-2)).toContain(
        `… ${200_000 - (MAX_BOX_ROWS - 1)} more lines not shown`,
      );
      // The summary is wider than every one-character line and the header,
      // so it sets the box's width; it must not stick out of it.
      expect(new Set(out.slice(1).map((r) => r.length)).size).toBe(1);
    });
  });

  // #5433: the box is never wider than MAX_BOX_TEXT_WIDTH. A longer line, or
  // a longer header, wraps onto rows of that width, so the box grows linearly
  // with the thought instead of as its longest line times its line count.
  describe("a thought wider than the box", () => {
    const W = MAX_BOX_TEXT_WIDTH;
    const border = "─".repeat(W + 4);
    const row = (text: string) => `│ ${text.padEnd(border.length - 2)} │`;

    beforeEach(async () => {
      conn = await connect({ disableThoughtLogging: undefined });
    });

    it("wraps a long line onto rows of the capped width", async () => {
      const text = `${"a".repeat(W)}${"b".repeat(W)}${"c".repeat(5)}`;
      await conn!.think(thought({ thought: `${text}\nshort` }));
      expect(logged()).toEqual([
        `
┌${border}┐
${row("💭 Thought 1/3")}
├${border}┤
${row("a".repeat(W))}
${row("b".repeat(W))}
${row("c".repeat(5))}
${row("short")}
└${border}┘`,
      ]);
    });

    it("stays bounded for one long line and many short ones", async () => {
      // The case from the review of #5430: before the cap, every one of the
      // 19,999 short rows was padded to 20,000 characters, 400 million in all.
      const n = 20_000;
      const text = `${"x".repeat(n)}${"\ny".repeat(n - 1)}`;
      const result = await conn!.think(thought({ thought: text }));
      expect(result.isError).toBeFalsy();
      const out = logged()[0];
      // The header row, 200 wrapped rows for the long line, short lines up to
      // the row cap, then the summary row; each row is W + 6 characters and a
      // newline.
      const shortShown = MAX_BOX_ROWS - 1 - n / W;
      expect(out.split("\n")).toHaveLength(MAX_BOX_ROWS + 5);
      expect(out).toContain(`… ${n - 1 - shortShown} more lines not shown`);
      expect(out.length).toBeLessThan((MAX_BOX_ROWS + 10) * (W + 7));
    });

    it("counts a line the row cap cuts off as not shown", async () => {
      // The header row and these short lines leave one row for the long one.
      const text = `${"s\n".repeat(MAX_BOX_ROWS - 2)}${"L".repeat(2 * W)}`;
      await conn!.think(thought({ thought: text }));
      const rows = logged()[0].split("\n");
      expect(rows).toHaveLength(MAX_BOX_ROWS + 5);
      expect(rows.at(-3)).toBe(row("L".repeat(W)));
      expect(rows.at(-2)).toBe(row("… 1 more line not shown"));
    });

    it("draws a thought that exactly fills the cap with no summary row", async () => {
      // With the header's one row, these lines fill the cap exactly.
      const text = Array.from({ length: MAX_BOX_ROWS - 1 }, () => "s").join(
        "\n",
      );
      await conn!.think(thought({ thought: text }));
      const rows = logged()[0].split("\n");
      expect(rows).toHaveLength(MAX_BOX_ROWS + 4);
      expect(logged()[0]).not.toContain("not shown");
    });

    it("draws every row the same width", async () => {
      await conn!.think(thought({ thought: `${"z".repeat(3 * W + 7)}\nend` }));
      const rows = logged()[0].split("\n").slice(1);
      expect(new Set(rows.map((r) => r.length))).toEqual(new Set([W + 6]));
    });

    it("wraps a header longer than the cap, and keeps the box linear", async () => {
      const branchId = "b".repeat(2 * W);
      const lines = 1_000;
      await conn!.think(
        thought({
          thought: Array.from({ length: lines }, () => "s").join("\n"),
          branchFromThought: 1,
          branchId,
        }),
      );
      const out = logged()[0];
      const rows = out.split("\n").slice(1);
      expect(new Set(rows.map((r) => r.length))).toEqual(new Set([W + 6]));
      const header = `🌿 Branch 1/3 (from thought 1, ID: ${branchId})`;
      const headerRows = rows.slice(1, rows.indexOf(`├${border}┤`));
      expect(headerRows.map((r) => r.slice(2, -2).trimEnd()).join("")).toBe(
        header,
      );
      // Each row is W + 6 characters and a newline. Uncapped, the header would
      // have set every row's width to its own length of more than 2 × W.
      expect(out.length).toBeLessThan((lines + 10) * (W + 7));
    });

    // #5526: a long branchId's header rows count toward MAX_BOX_ROWS, so they
    // cannot add rows past the cap the thought's rows are held to.
    it("counts a wrapped header's rows toward the row cap", async () => {
      const branchId = "b".repeat(2 * W);
      const header = `🌿 Branch 1/3 (from thought 1, ID: ${branchId})`;
      const headerRows = Math.ceil(header.length / W);
      expect(headerRows).toBeGreaterThan(1);
      await conn!.think(
        thought({
          thought: Array.from({ length: MAX_BOX_ROWS }, () => "s").join("\n"),
          branchFromThought: 1,
          branchId,
        }),
      );
      const rows = logged()[0].split("\n");
      expect(rows).toHaveLength(MAX_BOX_ROWS + 5);
      expect(rows.at(-2)).toBe(row(`… ${headerRows} more lines not shown`));
    });

    // #5526: a line ending in a branchId would start a line of output the
    // row cap never counted; the header shows it escaped instead.
    it("escapes line endings in a branchId so the header stays on its rows", async () => {
      const branchId = "x\r\ny\rz\n".repeat(500);
      const escaped = "x\\r\\ny\\rz\\n".repeat(500);
      const header = `🌿 Branch 1/3 (from thought 1, ID: ${escaped})`;
      await conn!.think(
        thought({ thought: "t", branchFromThought: 1, branchId }),
      );
      const out = logged()[0];
      expect(out).not.toContain("\r");
      const rows = out.split("\n");
      const headerRows = Math.ceil(header.length / W);
      // A leading blank, the borders and separator, the header rows and the
      // thought's one row.
      expect(rows).toHaveLength(headerRows + 5);
      expect(
        rows
          .slice(2, 2 + headerRows)
          .map((r) => r.slice(2, 2 + W).trimEnd())
          .join(""),
      ).toBe(header);
    });

    // #5526: a header too long for every row is cut, so a huge branchId logs
    // no more than the cap; its last row says how much was left out.
    it("cuts a header longer than the row cap", async () => {
      const branchId = "b".repeat(MAX_BOX_ROWS * W);
      const header = `🌿 Branch 1/3 (from thought 1, ID: ${branchId})`;
      const result = await conn!.think(
        thought({ thought: "t", branchFromThought: 1, branchId }),
      );
      expect(result.isError).toBeFalsy();
      const out = logged()[0];
      const rows = out.split("\n");
      // A leading blank, the top border, MAX_BOX_ROWS header rows, the
      // separator, the thought's summary row and the bottom border.
      expect(rows).toHaveLength(MAX_BOX_ROWS + 5);
      const shown = (MAX_BOX_ROWS - 1) * W;
      expect(
        rows
          .slice(2, MAX_BOX_ROWS + 1)
          .map((r) => r.slice(2, 2 + W))
          .join(""),
      ).toBe(header.slice(0, shown));
      expect(rows[MAX_BOX_ROWS + 1]).toBe(
        row(`… ${header.length - shown} more characters not shown`),
      );
      expect(rows[MAX_BOX_ROWS + 2]).toBe(`├${border}┤`);
      expect(rows.at(-2)).toBe(row("… 1 more line not shown"));
      expect(new Set(rows.slice(1).map((r) => r.length))).toEqual(
        new Set([W + 6]),
      );
      expect(out.length).toBeLessThan((MAX_BOX_ROWS + 10) * (W + 7));
    });

    it("never splits an emoji across rows", async () => {
      // The emoji's two UTF-16 halves would straddle the cut at W.
      const text = `${"a".repeat(W - 1)}😀tail`;
      await conn!.think(thought({ thought: text }));
      const rows = logged()[0].split("\n").slice(4, -1);
      expect(rows.map((r) => r.slice(2, -2).trimEnd())).toEqual([
        "a".repeat(W - 1),
        "😀tail",
      ]);
    });
  });

  // #5000: when colour is on, the header carries chalk's escape codes, but the
  // border is sized from the visible text, so the box matches the uncoloured one.
  it("sizes the border from the visible header, not its escape codes", async () => {
    chalk.level = 1;
    conn = await connect({ disableThoughtLogging: undefined });
    await conn.think(thought({ thought: "t" }));
    const raw = String(errorSpy.mock.calls[0][0]);
    const visible = "💭 Thought 1/3";
    const coloured = `${chalk.blue("💭 Thought")} 1/3`;
    expect(coloured.length).toBeGreaterThan(visible.length);
    expect(raw).toBe(box(visible, "t").replace(visible, coloured));
  });
});
