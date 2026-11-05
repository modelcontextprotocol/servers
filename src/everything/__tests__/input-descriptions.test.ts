// Every property of every tool input schema the server advertises in
// tools/list carries a description (#3669). A model reads these to decide what
// to pass, and with no description it guesses from the property name alone.
// This is the reference implementation other server authors copy, so the rule
// is pinned for every tool, existing or added later, and for nested
// properties (array items, object fields) as well as top-level ones.

import { afterEach, describe, expect, it } from "vitest";
import { ALL_CAPABILITIES, connect, type Session } from "./harness.js";

/** A JSON Schema node, as much of it as the walk reads. */
type SchemaNode = {
  description?: unknown;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode | SchemaNode[];
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  allOf?: SchemaNode[];
};

/**
 * The path of every property under `node`, at any depth, that has no
 * non-empty description: the properties of nested objects and of array
 * items count, since a model fills those in too.
 */
function undescribed(node: SchemaNode, path: string): string[] {
  const missing: string[] = [];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const at = `${path}.${key}`;
    if (
      typeof child.description !== "string" ||
      child.description.trim() === ""
    ) {
      missing.push(at);
    }
    missing.push(...undescribed(child, at));
  }
  const items = node.items;
  for (const item of Array.isArray(items) ? items : items ? [items] : []) {
    missing.push(...undescribed(item, `${path}[]`));
  }
  for (const branch of [
    ...(node.anyOf ?? []),
    ...(node.oneOf ?? []),
    ...(node.allOf ?? []),
  ]) {
    missing.push(...undescribed(branch, path));
  }
  return missing;
}

let session: Session | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
});

describe("tool input descriptions (#3669)", () => {
  it("describes every input property of every tool", async () => {
    // Every capability, so the tools gated on one are listed too.
    session = await connect({ capabilities: ALL_CAPABILITIES });
    const { tools } = await session.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    const missing = tools.flatMap((tool) =>
      undescribed(tool.inputSchema as SchemaNode, tool.name),
    );
    expect(missing).toEqual([]);
  });
});
