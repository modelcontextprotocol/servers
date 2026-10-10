// How the tool's input schema behaves on the wire: which arguments are
// required, how strings are coerced to booleans and numbers, and the exact
// error a client gets back for each kind of bad input. Originally the #4651
// regression test, which spawned dist/index.js and was skipped when no build
// existed; ported to the in-process client (#4854) so it always runs and
// always tests the source. The error texts are the SDK 1.x mapping of a Zod
// failure and are pinned verbatim: a change to them is a wire change.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  connect,
  parseOk,
  textOf,
  thought,
  type Connected,
} from "./helpers.js";

const INVALID =
  "MCP error -32602: Input validation error: Invalid arguments for tool sequentialthinking: ";

describe("sequentialthinking input schema", () => {
  let conn: Connected;

  beforeEach(async () => {
    conn = await connect();
  });

  afterEach(async () => {
    await conn.close();
  });

  async function expectInvalid(
    args: Record<string, unknown>,
    detail: string,
  ): Promise<void> {
    const result = await conn.think(args);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(textOf(result)).toBe(INVALID + detail);
  }

  describe("required fields (#4651)", () => {
    it("rejects a call that omits nextThoughtNeeded", async () => {
      await expectInvalid(
        { thought: "t", thoughtNumber: 1, totalThoughts: 1 },
        "Invalid input at nextThoughtNeeded",
      );
    });

    it("rejects a call that omits thought", async () => {
      const { thought: _omitted, ...args } = thought();
      await expectInvalid(
        args,
        "Invalid input: expected string, received undefined at thought",
      );
    });

    it("reports every missing numeric field, coerced to NaN", async () => {
      await expectInvalid(
        { thought: "t" },
        "Invalid input at nextThoughtNeeded\n" +
          "Invalid input: expected number, received NaN at thoughtNumber\n" +
          "Invalid input: expected number, received NaN at totalThoughts",
      );
    });

    it("accepts a call with only the four required fields", async () => {
      expect(parseOk(await conn.think(thought()))).toEqual({
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branches: [],
        thoughtHistoryLength: 1,
      });
    });
  });

  describe("boolean coercion", () => {
    it.each([
      ["True", true],
      ["FALSE", false],
      ["true", true],
      ["false", false],
      [true, true],
      [false, false],
    ])("accepts nextThoughtNeeded %j as %j", async (value, expected) => {
      const result = parseOk(
        await conn.think(thought({ nextThoughtNeeded: value })),
      );
      expect(result.nextThoughtNeeded).toBe(expected);
    });

    it.each(["yes", "", "1"])(
      "rejects the string %j, naming it in the error",
      async (value) => {
        await expectInvalid(
          thought({ nextThoughtNeeded: value }),
          `Expected boolean or "true"/"false" string, received "${value}" at nextThoughtNeeded`,
        );
      },
    );

    it.each([1, 0, null])("rejects the non-string %j", async (value) => {
      await expectInvalid(
        thought({ nextThoughtNeeded: value }),
        "Invalid input at nextThoughtNeeded",
      );
    });

    it("coerces the optional booleans the same way", async () => {
      expect(
        (
          await conn.think(
            thought({ isRevision: "TRUE", needsMoreThoughts: "False" }),
          )
        ).isError,
      ).toBeFalsy();
      await expectInvalid(
        thought({ isRevision: "maybe" }),
        'Expected boolean or "true"/"false" string, received "maybe" at isRevision',
      );
      await expectInvalid(
        thought({ needsMoreThoughts: "nope" }),
        'Expected boolean or "true"/"false" string, received "nope" at needsMoreThoughts',
      );
    });
  });

  describe("number coercion", () => {
    it("coerces numeric strings", async () => {
      expect(
        parseOk(
          await conn.think(thought({ thoughtNumber: "2", totalThoughts: "4" })),
        ),
      ).toMatchObject({ thoughtNumber: 2, totalThoughts: 4 });
    });

    // z.coerce.number() is Number(value), so a boolean true becomes 1.
    it("coerces true to 1", async () => {
      expect(
        parseOk(await conn.think(thought({ thoughtNumber: true }))),
      ).toMatchObject({ thoughtNumber: 1 });
    });

    it.each([
      ["thoughtNumber", 0, "Too small: expected number to be >=1"],
      ["totalThoughts", -1, "Too small: expected number to be >=1"],
      ["thoughtNumber", "", "Too small: expected number to be >=1"],
      ["thoughtNumber", null, "Too small: expected number to be >=1"],
      ["thoughtNumber", 1.5, "Invalid input: expected int, received number"],
      ["thoughtNumber", "abc", "Invalid input: expected number, received NaN"],
      ["revisesThought", 0, "Too small: expected number to be >=1"],
      [
        "branchFromThought",
        "x",
        "Invalid input: expected number, received NaN",
      ],
    ])("rejects %s = %j", async (field, value, detail) => {
      await expectInvalid(thought({ [field]: value }), `${detail} at ${field}`);
    });

    it("rejects a non-string branchId", async () => {
      await expectInvalid(
        thought({ branchFromThought: 1, branchId: 7 }),
        "Invalid input: expected string, received number at branchId",
      );
    });
  });

  it("ignores unknown arguments", async () => {
    expect(
      parseOk(await conn.think(thought({ somethingElse: "x" }))),
    ).toMatchObject({ thoughtNumber: 1, thoughtHistoryLength: 1 });
  });

  it("does not count a rejected call in the history", async () => {
    await conn.think(thought({ nextThoughtNeeded: "yes" }));
    expect(parseOk(await conn.think(thought())).thoughtHistoryLength).toBe(1);
  });
});
