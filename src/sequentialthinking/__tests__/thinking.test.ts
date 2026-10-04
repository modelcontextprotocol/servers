// The tool's stateful logic as a client observes it: the thought history
// count, the branch list, revisions, totalThoughts auto-adjustment and the
// state kept per server instance. Every case drives the tool through the
// in-process client and reads only the result's text and structuredContent.
// Includes the #4813 characterization (a branchId that names an
// Object.prototype key); PR #4814 is the fix, so that test changes with it.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  connect,
  parseOk,
  textOf,
  thought,
  type Connected,
} from "./helpers.js";

describe("sequentialthinking thought processing", () => {
  let conn: Connected;

  beforeEach(async () => {
    conn = await connect();
  });

  afterEach(async () => {
    await conn.close();
  });

  describe("results", () => {
    it("returns the result as pretty-printed JSON text and as structuredContent", async () => {
      const result = await conn.think(thought());
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                thoughtNumber: 1,
                totalThoughts: 3,
                nextThoughtNeeded: true,
                branches: [],
                thoughtHistoryLength: 1,
              },
              null,
              2,
            ),
          },
        ],
        structuredContent: {
          thoughtNumber: 1,
          totalThoughts: 3,
          nextThoughtNeeded: true,
          branches: [],
          thoughtHistoryLength: 1,
        },
      });
    });

    it("echoes nextThoughtNeeded false", async () => {
      expect(
        parseOk(
          await conn.think(
            thought({
              thoughtNumber: 1,
              totalThoughts: 1,
              nextThoughtNeeded: false,
            }),
          ),
        ),
      ).toEqual({
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        branches: [],
        thoughtHistoryLength: 1,
      });
    });

    it("accepts a very long thought", async () => {
      expect(
        parseOk(await conn.think(thought({ thought: "a".repeat(10000) })))
          .thoughtHistoryLength,
      ).toBe(1);
    });
  });

  describe("history", () => {
    it("counts every accepted thought", async () => {
      for (let n = 1; n <= 3; n++) {
        const result = parseOk(await conn.think(thought({ thoughtNumber: n })));
        expect(result.thoughtHistoryLength).toBe(n);
      }
    });

    it("does not deduplicate or order thoughts: repeats and gaps all count", async () => {
      await conn.think(thought({ thoughtNumber: 2 }));
      await conn.think(thought({ thoughtNumber: 2 }));
      const result = parseOk(await conn.think(thought({ thoughtNumber: 1 })));
      expect(result).toMatchObject({
        thoughtNumber: 1,
        thoughtHistoryLength: 3,
      });
    });

    it("keeps separate history per server instance", async () => {
      await conn.think(thought());
      await conn.think(thought({ thoughtNumber: 2 }));
      const other = await connect();
      try {
        expect(parseOk(await other.think(thought())).thoughtHistoryLength).toBe(
          1,
        );
      } finally {
        await other.close();
      }
    });
  });

  describe("totalThoughts adjustment", () => {
    it("raises totalThoughts to thoughtNumber when it is exceeded", async () => {
      expect(
        parseOk(
          await conn.think(thought({ thoughtNumber: 5, totalThoughts: 3 })),
        ),
      ).toMatchObject({ thoughtNumber: 5, totalThoughts: 5 });
    });

    it("leaves totalThoughts alone when it is equal or larger", async () => {
      expect(
        parseOk(
          await conn.think(thought({ thoughtNumber: 3, totalThoughts: 3 })),
        ),
      ).toMatchObject({ totalThoughts: 3 });
      expect(
        parseOk(
          await conn.think(thought({ thoughtNumber: 1, totalThoughts: 9 })),
        ),
      ).toMatchObject({ totalThoughts: 9 });
    });

    it("lets a later call lower totalThoughts again (no memory of the estimate)", async () => {
      await conn.think(thought({ thoughtNumber: 8, totalThoughts: 2 }));
      expect(
        parseOk(
          await conn.think(thought({ thoughtNumber: 2, totalThoughts: 2 })),
        ),
      ).toMatchObject({ totalThoughts: 2 });
    });
  });

  describe("revisions", () => {
    it("records a revision as an ordinary history entry", async () => {
      await conn.think(thought());
      const result = parseOk(
        await conn.think(
          thought({ thoughtNumber: 2, isRevision: true, revisesThought: 1 }),
        ),
      );
      expect(result).toEqual({
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branches: [],
        thoughtHistoryLength: 2,
      });
    });

    it("does not check that the revised thought exists", async () => {
      expect(
        parseOk(
          await conn.think(thought({ isRevision: true, revisesThought: 99 })),
        ).thoughtHistoryLength,
      ).toBe(1);
    });

    it("accepts isRevision without revisesThought, and revisesThought without isRevision", async () => {
      expect(
        (await conn.think(thought({ isRevision: true }))).isError,
      ).toBeFalsy();
      expect(
        (await conn.think(thought({ revisesThought: 1 }))).isError,
      ).toBeFalsy();
    });

    it("accepts needsMoreThoughts without changing the result", async () => {
      expect(
        parseOk(await conn.think(thought({ needsMoreThoughts: true }))),
      ).toEqual({
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branches: [],
        thoughtHistoryLength: 1,
      });
    });
  });

  describe("branches", () => {
    it("records a branch when both branchFromThought and branchId are given", async () => {
      await conn.think(thought());
      expect(
        parseOk(
          await conn.think(
            thought({
              thoughtNumber: 2,
              branchFromThought: 1,
              branchId: "alt",
            }),
          ),
        ),
      ).toMatchObject({ branches: ["alt"], thoughtHistoryLength: 2 });
    });

    it("lists each branch id once, in first-seen order", async () => {
      await conn.think(thought({ branchFromThought: 1, branchId: "b" }));
      await conn.think(thought({ branchFromThought: 1, branchId: "a" }));
      const result = parseOk(
        await conn.think(thought({ branchFromThought: 2, branchId: "b" })),
      );
      expect(result).toMatchObject({
        branches: ["b", "a"],
        thoughtHistoryLength: 3,
      });
    });

    it("ignores branchId without branchFromThought", async () => {
      expect(
        parseOk(await conn.think(thought({ branchId: "orphan" }))).branches,
      ).toEqual([]);
    });

    it("ignores branchFromThought without branchId", async () => {
      expect(
        parseOk(await conn.think(thought({ branchFromThought: 1 }))).branches,
      ).toEqual([]);
    });

    it("ignores an empty branchId", async () => {
      expect(
        parseOk(
          await conn.think(thought({ branchFromThought: 1, branchId: "" })),
        ).branches,
      ).toEqual([]);
    });

    it("does not check that the branching point exists", async () => {
      expect(
        parseOk(
          await conn.think(thought({ branchFromThought: 42, branchId: "far" })),
        ).branches,
      ).toEqual(["far"]);
    });

    it("keeps branches when a thought is both a revision and a branch", async () => {
      expect(
        parseOk(
          await conn.think(
            thought({
              isRevision: true,
              revisesThought: 1,
              branchFromThought: 1,
              branchId: "both",
            }),
          ),
        ).branches,
      ).toEqual(["both"]);
    });

    it("accepts branch ids with spaces, unicode and punctuation", async () => {
      const ids = ["with space", "ünïcödé", "a/b.c-d"];
      let last: string[] = [];
      for (const id of ids) {
        last = parseOk(
          await conn.think(thought({ branchFromThought: 1, branchId: id })),
        ).branches;
      }
      expect(last).toEqual(ids);
    });
  });

  // #4813: branches is a plain object, so a branchId that names an inherited
  // Object.prototype member reads back that member (truthy, not an array) and
  // `.push` throws. The call fails with the TypeError's message as an
  // isError result, after the thought was already appended to the history, so
  // the failed call still advances thoughtHistoryLength. PR #4814 fixes this;
  // these assertions change with it.
  describe("#4813: branchId colliding with an Object.prototype key", () => {
    // KNOWN BUG #4813: pins current (wrong) behavior; the fix changes this assertion.
    it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
      "fails the call for branchId %j",
      async (branchId) => {
        const result = await conn.think(
          thought({ branchFromThought: 1, branchId }),
        );
        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "this.branches[input.branchId].push is not a function",
                  status: "failed",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        });
      },
    );

    // KNOWN BUG #4813: pins current (wrong) behavior; the fix changes this assertion.
    it("still counts the failed thought in the history and does not list the branch", async () => {
      await conn.think(thought({ branchFromThought: 1, branchId: "alt" }));
      const failed = await conn.think(
        thought({
          thoughtNumber: 2,
          branchFromThought: 1,
          branchId: "constructor",
        }),
      );
      expect(failed.isError).toBe(true);
      expect(JSON.parse(textOf(failed))).toEqual({
        error: "this.branches[input.branchId].push is not a function",
        status: "failed",
      });
      expect(
        parseOk(
          await conn.think(
            thought({ thoughtNumber: 3, nextThoughtNeeded: false }),
          ),
        ),
      ).toEqual({
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branches: ["alt"],
        thoughtHistoryLength: 3,
      });
    });

    it("is harmless when branchFromThought is absent, since no branch is recorded", async () => {
      expect(
        parseOk(await conn.think(thought({ branchId: "constructor" })))
          .branches,
      ).toEqual([]);
    });
  });
});
