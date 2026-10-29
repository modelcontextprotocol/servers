/**
 * Resource collections (#3130): one `resources/read` that answers with several
 * contents, each under a URI of its own. The spec allows a read to return more
 * than one content ("a server could return the contents of several files when
 * a directory resource is read"), and this module shows the pattern with a
 * small, fixed product catalog:
 *
 * - `demo://resource/collection/summer-specials` (static, listed): every item.
 * - `demo://resource/collection/by-category/{category}` (template, with a
 *   completer for `category`): the items in one category.
 * - `demo://resource/collection/item/{itemId}` (template, with a completer for
 *   `itemId`): one item.
 *
 * Every content a collection returns carries its item's URI, not the
 * collection's, and that URI is readable on its own through the item
 * template, so a client can follow up on any one member. The catalog is a
 * constant, so the module keeps no state and serves both protocol eras alike.
 * Adapted from the example in olaservo's gist linked on the issue.
 */
import {
  CompleteResourceTemplateCallback,
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
} from "@modelcontextprotocol/server";

/** One product in the example catalog. */
export type CollectionItem = {
  id: number;
  name: string;
  price: number;
  category: string;
};

/** The example catalog the collections are drawn from. */
export const COLLECTION_ITEMS: readonly CollectionItem[] = [
  { id: 1, name: "Summer Hat", price: 29.99, category: "accessories" },
  { id: 2, name: "Beach Towel", price: 19.99, category: "accessories" },
  { id: 3, name: "Sunglasses", price: 49.99, category: "accessories" },
  { id: 4, name: "Flip Flops", price: 14.99, category: "footwear" },
  { id: 5, name: "Sunscreen SPF50", price: 12.99, category: "skincare" },
];

/** The distinct categories in the catalog, in first-seen order. */
export const COLLECTION_CATEGORIES: readonly string[] = [
  ...new Set(COLLECTION_ITEMS.map((item) => item.category)),
];

const MIME_TYPE = "application/json";
const collectionUriBase = "demo://resource/collection";
const itemUriBase = `${collectionUriBase}/item`;
const categoryUriBase = `${collectionUriBase}/by-category`;

/** The URI of the collection holding every item. */
export const SUMMER_SPECIALS_URI = `${collectionUriBase}/summer-specials`;

/**
 * The URI under which one item can be read on its own.
 * @param id
 */
export const collectionItemUri = (id: number) => `${itemUriBase}/${id}`;

/**
 * The contents of one item: JSON, under the item's own URI.
 * @param item
 */
const itemContents = (item: CollectionItem) => ({
  uri: collectionItemUri(item.id),
  mimeType: MIME_TYPE,
  text: JSON.stringify(item, null, 2),
});

/** Completes a category name from its prefix. */
const categoryCompleter: CompleteResourceTemplateCallback = (value) =>
  COLLECTION_CATEGORIES.filter((category) => category.startsWith(value));

/** Completes an item id from its prefix. */
const itemIdCompleter: CompleteResourceTemplateCallback = (value) =>
  COLLECTION_ITEMS.map((item) => String(item.id)).filter((id) =>
    id.startsWith(value),
  );

/**
 * Register the collection resources with the MCP server.
 * - `summer-specials`: a static resource whose read returns every item
 * - `collection-by-category`: a template whose read returns one category's items
 * - `collection-item`: a template whose read returns one item
 * - A category or item id that is not in the catalog is not found (`-32602`)
 *
 * @param server
 */
export const registerCollectionResources = (server: McpServer) => {
  // The whole collection: one read, one content per item, each with its own URI
  server.registerResource(
    "summer-specials",
    SUMMER_SPECIALS_URI,
    {
      title: "Summer Specials Collection",
      mimeType: MIME_TYPE,
      description:
        "A resource collection: one read returns every item in the catalog as a separate content, each under its own demo://resource/collection/item/{itemId} URI.",
    },
    async () => ({ contents: COLLECTION_ITEMS.map(itemContents) }),
  );

  // A filtered collection: the items in one category
  server.registerResource(
    "collection-by-category",
    new ResourceTemplate(`${categoryUriBase}/{category}`, {
      list: undefined,
      complete: { category: categoryCompleter },
    }),
    {
      title: "Collection by Category",
      mimeType: MIME_TYPE,
      description: `A resource collection filtered by the {category} variable (${COLLECTION_CATEGORIES.join(", ")}): one read returns each item in that category as a separate content, under its own URI.`,
    },
    async (uri, variables) => {
      const category = String(variables.category);
      const items = COLLECTION_ITEMS.filter(
        (item) => item.category === category,
      );
      if (items.length === 0) throw new ResourceNotFoundError(uri.toString());
      return { contents: items.map(itemContents) };
    },
  );

  // One member of the collections, readable on its own
  server.registerResource(
    "collection-item",
    new ResourceTemplate(`${itemUriBase}/{itemId}`, {
      list: undefined,
      complete: { itemId: itemIdCompleter },
    }),
    {
      title: "Collection Item",
      mimeType: MIME_TYPE,
      description:
        "One item of the resource collections, selected by the {itemId} variable (1 to 5). The collections return their items under these URIs.",
    },
    async (uri, variables) => {
      // Match the id's exact spelling, so "01" is not found rather than item 1
      const itemId = String(variables.itemId);
      const item = COLLECTION_ITEMS.find(
        (candidate) => String(candidate.id) === itemId,
      );
      if (!item) throw new ResourceNotFoundError(uri.toString());
      return { contents: [itemContents(item)] };
    },
  );
};
