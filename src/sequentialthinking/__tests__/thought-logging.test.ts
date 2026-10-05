// The server's other observable output: unless DISABLE_THOUGHT_LOGGING is
// "true" (any case), each accepted thought is drawn as a box on stderr, with
// a header that differs for plain thoughts, revisions and branches. Thoughts
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

  /** The box the server draws, for an uncoloured header. */
  function box(header: string, text: string): string {
    const border = "─".repeat(Math.max(header.length, text.length) + 4);
    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${text.padEnd(border.length - 2)} │
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
