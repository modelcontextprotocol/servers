// The tool's stateful logic as a client observes it: the thought history
// count, the branch list, revisions, totalThoughts auto-adjustment and the
// state kept per server instance. Every case drives the tool through the
// in-process client and reads only the result's text and structuredContent.
// Includes the #4813 regression tests: a branchId that names an
// Object.prototype key is an ordinary branch, and a failed call leaves the
// state unchanged; and the #2912 tests: the history is capped at
// MAX_THOUGHT_HISTORY, evicting the oldest thought from its branch too.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  connect,
  parseOk,
  textOf,
  thought,
  type Connected,
} from "./helpers.js";
import { DEFAULT_MAX_THOUGHT_HISTORY } from "../lib.js";

/**
 * Connect to a server built under MAX_THOUGHT_HISTORY=`value` (`undefined` =
 * unset). The cap is read once, when the server is built, so the variable is
 * restored as soon as the connection is up.
 */
async function connectCapped(value: string | undefined): Promise<Connected> {
  const previous = process.env.MAX_THOUGHT_HISTORY;
  if (value === undefined) {
    delete process.env.MAX_THOUGHT_HISTORY;
  } else {
    process.env.MAX_THOUGHT_HISTORY = value;
  }
  try {
    return await connect();
  } finally {
    if (previous === undefined) {
      delete process.env.MAX_THOUGHT_HISTORY;
    } else {
      process.env.MAX_THOUGHT_HISTORY = previous;
    }
  }
}

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

  // #4813: a branchId is an opaque string, so one that names an
  // Object.prototype member is tracked like any other id, and a call that
  // fails leaves thoughtHistory and branches as they were.
  describe("#4813: branchId colliding with an Object.prototype key", () => {
    it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
      "creates and lists the branch for branchId %j",
      async (branchId) => {
        expect(
          parseOk(
            await conn.think(thought({ branchFromThought: 1, branchId })),
          ),
        ).toEqual({
          thoughtNumber: 1,
          totalThoughts: 3,
          nextThoughtNeeded: true,
          branches: [branchId],
          thoughtHistoryLength: 1,
        });
      },
    );

    it("counts the thought once and lists the branch alongside ordinary ones", async () => {
      await conn.think(thought({ branchFromThought: 1, branchId: "alt" }));
      parseOk(
        await conn.think(
          thought({
            thoughtNumber: 2,
            branchFromThought: 1,
            branchId: "constructor",
          }),
        ),
      );
      expect(
        parseOk(
          await conn.think(
            thought({
              thoughtNumber: 3,
              nextThoughtNeeded: false,
              branchFromThought: 1,
              branchId: "constructor",
            }),
          ),
        ),
      ).toEqual({
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branches: ["alt", "constructor"],
        thoughtHistoryLength: 3,
      });
    });

    // Drawing the box and writing it to stderr are the steps that can still
    // throw; make each fail once and check nothing was recorded.
    it.each([
      [
        "drawing",
        () =>
          vi.spyOn(String.prototype, "padEnd").mockImplementationOnce(() => {
            throw new Error("boom");
          }),
      ],
      [
        "writing",
        () =>
          vi.spyOn(console, "error").mockImplementationOnce(() => {
            throw new Error("boom");
          }),
      ],
    ])(
      "leaves the history and branches unchanged when %s the log box fails",
      async (_step, fail) => {
        const logging = await connect({ disableThoughtLogging: undefined });
        vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          await logging.think(
            thought({ branchFromThought: 1, branchId: "alt" }),
          );
          fail();
          const failed = await logging.think(
            thought({
              thoughtNumber: 2,
              branchFromThought: 1,
              branchId: "new",
            }),
          );
          expect(failed.isError).toBe(true);
          expect(JSON.parse(textOf(failed))).toEqual({
            error: "boom",
            status: "failed",
          });
          expect(
            parseOk(await logging.think(thought({ thoughtNumber: 3 }))),
          ).toEqual({
            thoughtNumber: 3,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            branches: ["alt"],
            thoughtHistoryLength: 2,
          });
        } finally {
          vi.restoreAllMocks();
          await logging.close();
        }
      },
    );

    it("is harmless when branchFromThought is absent, since no branch is recorded", async () => {
      expect(
        parseOk(await conn.think(thought({ branchId: "constructor" })))
          .branches,
      ).toEqual([]);
    });
  });

  // #2912: a server lives as long as its connection, so the history it keeps
  // is capped, oldest thought first, and the branches shrink with it.
  describe("#2912: bounded thought history", () => {
    let capped: Connected | undefined;

    afterEach(async () => {
      await capped?.close();
      capped = undefined;
      vi.restoreAllMocks();
    });

    it(`retains at most ${DEFAULT_MAX_THOUGHT_HISTORY} thoughts by default`, async () => {
      capped = await connectCapped(undefined);
      let length = 0;
      for (let n = 1; n <= DEFAULT_MAX_THOUGHT_HISTORY + 5; n++) {
        length = parseOk(
          await capped.think(thought({ thoughtNumber: n })),
        ).thoughtHistoryLength;
        expect(length).toBe(Math.min(n, DEFAULT_MAX_THOUGHT_HISTORY));
      }
      expect(length).toBe(DEFAULT_MAX_THOUGHT_HISTORY);
    });

    it("stops thoughtHistoryLength at MAX_THOUGHT_HISTORY", async () => {
      capped = await connectCapped("3");
      const lengths: number[] = [];
      for (let n = 1; n <= 6; n++) {
        lengths.push(
          parseOk(await capped.think(thought({ thoughtNumber: n })))
            .thoughtHistoryLength,
        );
      }
      expect(lengths).toEqual([1, 2, 3, 3, 3, 3]);
    });

    it("drops a branch once all of its thoughts are evicted", async () => {
      capped = await connectCapped("2");
      await capped.think(thought({ branchFromThought: 1, branchId: "alt" }));
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 2 }))).branches,
      ).toEqual(["alt"]);
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 3 }))),
      ).toMatchObject({ branches: [], thoughtHistoryLength: 2 });
    });

    it("keeps a branch while any of its thoughts is retained", async () => {
      capped = await connectCapped("2");
      await capped.think(thought({ branchFromThought: 1, branchId: "alt" }));
      await capped.think(
        thought({ thoughtNumber: 2, branchFromThought: 1, branchId: "alt" }),
      );
      // Evicts the first "alt" thought; the second is still retained.
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 3 }))),
      ).toMatchObject({ branches: ["alt"], thoughtHistoryLength: 2 });
      // Evicts the second; nothing on "alt" is left.
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 4 }))).branches,
      ).toEqual([]);
    });

    it("lists a branch recreated after eviction as newly seen", async () => {
      capped = await connectCapped("3");
      await capped.think(thought({ branchFromThought: 1, branchId: "a" }));
      await capped.think(
        thought({ thoughtNumber: 2, branchFromThought: 1, branchId: "b" }),
      );
      await capped.think(
        thought({ thoughtNumber: 3, branchFromThought: 1, branchId: "b" }),
      );
      // Evicts the only "a" thought.
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 4 }))).branches,
      ).toEqual(["b"]);
      // "a" is recorded again, after "b"; the first "b" thought is evicted.
      expect(
        parseOk(
          await capped.think(
            thought({ thoughtNumber: 5, branchFromThought: 1, branchId: "a" }),
          ),
        ).branches,
      ).toEqual(["b", "a"]);
    });

    it("evicts a branch whose id names an Object.prototype key", async () => {
      capped = await connectCapped("1");
      await capped.think(
        thought({ branchFromThought: 1, branchId: "__proto__" }),
      );
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 2 }))),
      ).toMatchObject({ branches: [], thoughtHistoryLength: 1 });
    });

    it("accepts a value padded with whitespace", async () => {
      capped = await connectCapped(" 1 ");
      await capped.think(thought());
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 2 })))
          .thoughtHistoryLength,
      ).toBe(1);
    });

    it("uses the default for an empty value, without a warning", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      capped = await connectCapped("");
      await capped.think(thought());
      expect(
        parseOk(await capped.think(thought({ thoughtNumber: 2 })))
          .thoughtHistoryLength,
      ).toBe(2);
      expect(errors).not.toHaveBeenCalled();
    });

    it.each(["0", "-1", "1.5", "abc", "1e3", "99999999999999999999"])(
      "reports %j on stderr and keeps the default cap",
      async (value) => {
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        capped = await connectCapped(value);
        expect(errors).toHaveBeenCalledWith(
          `MAX_THOUGHT_HISTORY must be a positive integer, got "${value}"; using ${DEFAULT_MAX_THOUGHT_HISTORY}`,
        );
        await capped.think(thought());
        expect(
          parseOk(await capped.think(thought({ thoughtNumber: 2 })))
            .thoughtHistoryLength,
        ).toBe(2);
      },
    );
  });
});
