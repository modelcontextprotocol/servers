// Characterization tests for the size of one item (#5543). The server's
// documented caps are on other dimensions: MAX_THOUGHT_HISTORY bounds how many
// thoughts are retained, and MAX_BOX_TEXT_WIDTH / MAX_BOX_ROWS bound what one
// thought draws on stderr. Nothing bounds how large a single thought or
// branchId may be: the input schema is a bare `z.string()` for both, and the
// history keeps each one whole.
//
// These cases pin that absence, and take no position on whether a per-item cap
// should exist. If one is ever added, they fail, so the change is a visible,
// deliberate one rather than a silent side effect.
//
// Each case runs with thought logging off and on. Logging is on by default for
// a real client, and drawing the box is the one step between validation and
// retention that reads the whole item, so "accepted" has to hold there too.
// The stderr caps themselves are covered in thought-logging.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { connect, parseOk, thought, type Connected } from "./helpers.js";

describe.each([
  { logging: "off", disableThoughtLogging: "true" },
  { logging: "on", disableThoughtLogging: undefined },
])(
  "sequentialthinking item size (characterization), thought logging $logging",
  ({ disableThoughtLogging }) => {
    let conn: Connected;

    beforeEach(async () => {
      // With logging on, every accepted thought draws a box on stderr.
      vi.spyOn(console, "error").mockImplementation(() => {});
      conn = await connect({ disableThoughtLogging });
    });

    afterEach(async () => {
      await conn.close();
      vi.restoreAllMocks();
    });

    it("accepts a thought of a million characters, counted once", async () => {
      const result = parseOk(
        await conn.think(thought({ thought: "a".repeat(1_000_000) })),
      );
      expect(result.thoughtHistoryLength).toBe(1);
    });

    it("accepts a thought of five thousand lines, counted once", async () => {
      const result = parseOk(
        await conn.think(thought({ thought: "line\n".repeat(5000) })),
      );
      expect(result.thoughtHistoryLength).toBe(1);
    });

    it("accepts a ten-thousand-character branchId and lists it verbatim", async () => {
      const branchId = "b".repeat(10_000);
      const first = parseOk(
        await conn.think(thought({ branchFromThought: 1, branchId })),
      );
      expect(first.branches).toEqual([branchId]);

      // A later, unbranched thought still reports the id untruncated: it is
      // read back from what the server retained, not echoed from the request.
      const later = parseOk(
        await conn.think(thought({ thoughtNumber: 2, totalThoughts: 3 })),
      );
      expect(later.branches).toEqual([branchId]);
      expect(later.thoughtHistoryLength).toBe(2);
    });
  },
);
