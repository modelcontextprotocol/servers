/**
 * Icons with light and dark themes (SEP-973, #3131), as each era's client
 * sees them.
 *
 * The server attaches one light/dark icon pair per primitive kind
 * (server/icons.ts). These tests read what crosses the wire, in both
 * protocol eras: `serverInfo` from `initialize` (2025-era) or
 * `server/discover` (2026-07-28), and every entry of `tools/list`,
 * `prompts/list`, `resources/list` and `resources/templates/list`. Each
 * must carry a "light" and a "dark" icon, and each icon must be a scalable
 * SVG `data:` URI that decodes to an SVG document.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Icon } from "@modelcontextprotocol/client";
import {
  ALL_CAPABILITIES,
  connect,
  connectModern,
  connectRaw,
  MODERN_CAPABILITIES,
  type RawSession,
  type Session,
} from "./harness.js";
import {
  PROMPT_ICONS,
  RESOURCE_ICONS,
  RESOURCE_TEMPLATE_ICONS,
  SERVER_ICONS,
  TOOL_ICONS,
} from "../server/icons.js";

let session: Session | undefined;
let raw: RawSession | undefined;

afterEach(async () => {
  await session?.close();
  await raw?.close();
  session = undefined;
  raw = undefined;
});

const SVG_DATA_URI = "data:image/svg+xml;base64,";

/** Assert that `icons` is a themed pair of decodable SVG icons. */
function expectThemedPair(icons: Icon[] | undefined): void {
  expect(icons).toBeDefined();
  const themes = (icons ?? []).map((icon) => icon.theme).sort();
  expect(themes).toEqual(["dark", "light"]);
  for (const icon of icons ?? []) {
    expect(icon.mimeType).toBe("image/svg+xml");
    expect(icon.sizes).toEqual(["any"]);
    expect(icon.src.startsWith(SVG_DATA_URI)).toBe(true);
    const svg = Buffer.from(
      icon.src.slice(SVG_DATA_URI.length),
      "base64",
    ).toString("utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/<\/svg>$/);
  }
  // The two variants are drawn differently, not one image labelled twice.
  expect(icons?.[0]?.src).not.toBe(icons?.[1]?.src);
}

describe("the icon sets", () => {
  it("gives every primitive kind its own light/dark pair", () => {
    const sets = [
      SERVER_ICONS,
      TOOL_ICONS,
      PROMPT_ICONS,
      RESOURCE_ICONS,
      RESOURCE_TEMPLATE_ICONS,
    ];
    for (const set of sets) expectThemedPair(set);
    const lightSources = new Set(
      sets.map((set) => set.find((icon) => icon.theme === "light")?.src),
    );
    expect(lightSources.size).toBe(sets.length);
  });
});

describe.each([
  {
    era: "2025-era",
    open: () => connect({ capabilities: ALL_CAPABILITIES }),
  },
  {
    era: "2026-07-28",
    open: () => connectModern({ capabilities: MODERN_CAPABILITIES }),
  },
])("icons on the $era surface", ({ open }) => {
  it("puts the server's pair on serverInfo", async () => {
    session = await open();
    const info = session.client.getServerVersion();
    expect(info?.icons).toEqual(SERVER_ICONS);
    expectThemedPair(info?.icons);
  });

  it("puts the tool pair on every tool", async () => {
    session = await open();
    const { tools } = await session.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(tool.icons).toEqual(TOOL_ICONS);
  });

  it("puts the prompt pair on every prompt", async () => {
    session = await open();
    const { prompts } = await session.client.listPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) expect(prompt.icons).toEqual(PROMPT_ICONS);
  });

  it("puts the resource pair on every listed resource", async () => {
    session = await open();
    const { resources } = await session.client.listResources();
    expect(resources.length).toBeGreaterThan(0);
    for (const resource of resources) {
      expect(resource.icons).toEqual(RESOURCE_ICONS);
    }
  });

  it("puts the template pair on every resource template", async () => {
    session = await open();
    const { resourceTemplates } = await session.client.listResourceTemplates();
    expect(resourceTemplates.length).toBeGreaterThan(0);
    for (const template of resourceTemplates) {
      expect(template.icons).toEqual(RESOURCE_TEMPLATE_ICONS);
    }
  });
});

describe("icons on the raw 2026-07-28 wire", () => {
  it("carries the server's pair in server/discover's serverInfo", async () => {
    raw = await connectRaw({});
    const discover = await raw.result("server/discover");
    expect(discover).toMatchObject({
      _meta: {
        "io.modelcontextprotocol/serverInfo": { icons: SERVER_ICONS },
      },
    });
  });
});
