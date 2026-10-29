// Protocol-level invariants on the tool annotations every filesystem tool
// advertises in tools/list (#3402). server-tools.test.ts pins each tool's exact
// hints; this file holds the rules any tool, existing or added later, must
// keep: all four hints set explicitly (the spec's defaults for a missing hint
// are the pessimistic ones, so leaving one out misdescribes the tool), a
// read-only tool idempotent and never destructive, and no tool open-world,
// since every tool is confined to the allowed directories.

import fs from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tool } from "@modelcontextprotocol/client";
import {
  connect,
  makeTempDir,
  quietStderr,
  type Connected,
} from "./helpers.js";

let dir: string;
let conn: Connected;
let tools: Tool[];

beforeEach(async () => {
  // The server logs its roots decision to stderr on every connect.
  quietStderr();
  dir = await makeTempDir("mcp-fs-annotations-");
  conn = await connect([dir]);
  ({ tools } = await conn.client.listTools());
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("tool annotations (#3402)", () => {
  it("sets all four hints, as booleans, on every tool", () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      const a = tool.annotations;
      expect(
        {
          readOnlyHint: typeof a?.readOnlyHint,
          idempotentHint: typeof a?.idempotentHint,
          destructiveHint: typeof a?.destructiveHint,
          openWorldHint: typeof a?.openWorldHint,
        },
        tool.name,
      ).toEqual({
        readOnlyHint: "boolean",
        idempotentHint: "boolean",
        destructiveHint: "boolean",
        openWorldHint: "boolean",
      });
    }
  });

  it("marks every read-only tool idempotent and not destructive", () => {
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint === true);
    expect(readOnly.length).toBeGreaterThan(0);
    for (const tool of readOnly) {
      expect(tool.annotations, tool.name).toMatchObject({
        idempotentHint: true,
        destructiveHint: false,
      });
    }
  });

  it("marks no tool open-world", () => {
    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
    }
  });

  it("keeps the edits that compound non-idempotent", () => {
    // Re-running edit_file or move_file with the same arguments does not
    // leave the same state (the edit no longer matches; the source is gone),
    // so neither may be advertised as safe to retry.
    const byName = new Map(tools.map((t) => [t.name, t.annotations]));
    expect(byName.get("edit_file")?.idempotentHint).toBe(false);
    expect(byName.get("move_file")?.idempotentHint).toBe(false);
  });
});
