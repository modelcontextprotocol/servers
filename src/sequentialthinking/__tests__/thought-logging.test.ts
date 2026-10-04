// The server's other observable output: unless DISABLE_THOUGHT_LOGGING is
// "true" (any case), each accepted thought is drawn as a box on stderr, with
// a header that differs for plain thoughts, revisions and branches. Thoughts
// are driven through the in-process client and stderr is captured by spying
// on console.error, which also keeps the boxes off the test output. chalk's
// colour level depends on the terminal the tests run in, so it is pinned to 0
// (no colour) around each test; the last test turns colour on to pin how the
// border width is computed from the coloured header.

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

    // KNOWN BUG #5000: the header reads "revising thought undefined" when revisesThought is unset; the fix changes this assertion.
    it("prints 'undefined' for a revision with no revisesThought", async () => {
      await conn!.think(thought({ thought: "x", isRevision: true }));
      expect(logged()).toEqual([
        box("🔄 Revision 1/3 (revising thought undefined)", "x"),
      ]);
    });

    it("draws a branch, naming its origin and id", async () => {
      await conn!.think(
        thought({ thought: "fork", branchFromThought: 1, branchId: "alt" }),
      );
      expect(logged()).toEqual([
        box("🌿 Branch 1/3 (from thought 1, ID: alt)", "fork"),
      ]);
    });

    // KNOWN BUG #5000: a branchFromThought with no branchId draws a Branch header reading "ID: undefined"; the fix changes this assertion.
    it("draws a branch header even when no branch is recorded (no branchId)", async () => {
      await conn!.think(thought({ thought: "fork", branchFromThought: 2 }));
      expect(logged()).toEqual([
        box("🌿 Branch 1/3 (from thought 2, ID: undefined)", "fork"),
      ]);
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

    // KNOWN BUG #4813: pins current (wrong) behavior; the fix changes this assertion.
    // #4813: the push throws before the box is drawn.
    it("logs nothing for a #4813 branch-id collision", async () => {
      await conn!.think(
        thought({ branchFromThought: 1, branchId: "constructor" }),
      );
      expect(logged()).toEqual([]);
    });
  });

  // KNOWN BUG #5000: the border counts the header's colour escape codes, so the box is drawn wider than its text; the fix changes this assertion.
  // The border is sized from header.length, and the header carries chalk's
  // escape codes, so when colour is on the box is wider than its visible text.
  it("sizes the border from the coloured header, escape codes included", async () => {
    chalk.level = 1;
    conn = await connect({ disableThoughtLogging: undefined });
    await conn.think(thought({ thought: "t" }));
    const raw = String(errorSpy.mock.calls[0][0]);
    const coloured = `${chalk.blue("💭 Thought")} 1/3`;
    expect(coloured.length).toBeGreaterThan("💭 Thought 1/3".length);
    expect(raw).toContain(coloured);
    expect(raw).toContain(`┌${"─".repeat(coloured.length + 4)}┐`);
  });
});
