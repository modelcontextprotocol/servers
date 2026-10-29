/**
 * Characterizes the resource collections (#3130) through the protocol: a
 * single `resources/read` of a collection answers with several contents, each
 * under its item's own URI, and each of those URIs reads back on its own. The
 * same reads run against a 2025-era client (`initialize`) and a 2026-07-28
 * client (`server/discover`), since the collections are served to both. Also
 * covers the category and item-id completers and the -32602 for a category or
 * item that is not in the catalog.
 */
import { afterEach, describe, expect, it } from "vitest";
import { connect, connectModern, type Session } from "./harness.js";
import {
  COLLECTION_CATEGORIES,
  COLLECTION_ITEMS,
  SUMMER_SPECIALS_URI,
  collectionItemUri,
} from "../resources/collections.js";

let session: Session | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
});

/** The contents one item is served as. */
const contentsOf = (item: (typeof COLLECTION_ITEMS)[number]) => ({
  uri: collectionItemUri(item.id),
  mimeType: "application/json",
  text: JSON.stringify(item, null, 2),
});

const CATEGORY_URI = "demo://resource/collection/by-category";

describe.each([
  ["2025-era", () => connect()],
  ["2026-07-28", () => connectModern()],
])("resource collections for a %s client", (_era, open) => {
  it("lists the summer-specials collection and both templates", async () => {
    session = await open();
    const { resources } = await session.client.listResources();
    expect(resources).toContainEqual(
      expect.objectContaining({
        name: "summer-specials",
        uri: SUMMER_SPECIALS_URI,
        mimeType: "application/json",
      }),
    );
    const { resourceTemplates } = await session.client.listResourceTemplates();
    expect(resourceTemplates.map((t) => [t.name, t.uriTemplate])).toEqual(
      expect.arrayContaining([
        ["collection-by-category", `${CATEGORY_URI}/{category}`],
        ["collection-item", "demo://resource/collection/item/{itemId}"],
      ]),
    );
  });

  it("returns every item as a separate content, each under its own URI", async () => {
    session = await open();
    const { contents } = await session.client.readResource({
      uri: SUMMER_SPECIALS_URI,
    });
    expect(contents).toEqual(COLLECTION_ITEMS.map(contentsOf));
    expect(new Set(contents.map((c) => c.uri)).size).toBe(
      COLLECTION_ITEMS.length,
    );
  });

  it.each(COLLECTION_CATEGORIES)(
    "returns only the %s items for that category",
    async (category) => {
      session = await open();
      const { contents } = await session.client.readResource({
        uri: `${CATEGORY_URI}/${category}`,
      });
      expect(contents).toEqual(
        COLLECTION_ITEMS.filter((i) => i.category === category).map(contentsOf),
      );
    },
  );

  it("reads back each member of a collection under the URI it was returned with", async () => {
    session = await open();
    const { contents } = await session.client.readResource({
      uri: SUMMER_SPECIALS_URI,
    });
    for (const member of contents) {
      const read = await session.client.readResource({ uri: member.uri });
      expect(read.contents).toEqual([member]);
    }
  });

  it.each([
    `${CATEGORY_URI}/outerwear`,
    "demo://resource/collection/item/0",
    "demo://resource/collection/item/6",
    "demo://resource/collection/item/01",
    "demo://resource/collection/item/abc",
  ])("answers %s, which is not in the catalog, with -32602", async (uri) => {
    session = await open();
    await expect(session.client.readResource({ uri })).rejects.toMatchObject({
      code: -32602,
      data: { uri },
    });
  });
});

describe("completion/complete for the collection templates", () => {
  /** Complete one variable of a collection template. */
  async function complete(uri: string, name: string, value: string) {
    session = await connect();
    const { completion } = await session.client.complete({
      ref: { type: "ref/resource", uri },
      argument: { name, value },
    });
    return completion.values;
  }

  it.each([
    ["", ["accessories", "footwear", "skincare"]],
    ["f", ["footwear"]],
    ["x", []],
  ])("completes category %j", async (value, expected) => {
    expect(
      await complete(`${CATEGORY_URI}/{category}`, "category", value),
    ).toEqual(expected);
  });

  it.each([
    ["", ["1", "2", "3", "4", "5"]],
    ["3", ["3"]],
    ["9", []],
  ])("completes itemId %j", async (value, expected) => {
    expect(
      await complete(
        "demo://resource/collection/item/{itemId}",
        "itemId",
        value,
      ),
    ).toEqual(expected);
  });
});
