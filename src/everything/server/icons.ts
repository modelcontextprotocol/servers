// The icons the everything server attaches to its primitives (#3131).
//
// SEP-973 lets a server give `icons` to its implementation info and to each
// tool, prompt, resource and resource template, and an icon may name the
// `theme` it is drawn for: "light" for a light background, "dark" for a dark
// one. This module defines one light/dark pair per primitive kind, so a client
// such as the Inspector can show which kind an entry is and pick the variant
// that suits its own theme.
//
// One pair per kind, rather than one per item, keeps every registration to a
// single `icons:` line that names its kind's set. Each icon is a small inline
// SVG carried as a base64 `data:` URI, the form the spec names for embedded
// image data: a client fetches nothing, and the package ships no new files.

import type { Icon } from "@modelcontextprotocol/server";

/** Stroke colour of the variant drawn for a light background. */
const LIGHT_THEME_STROKE = "#1F2937";

/** Stroke colour of the variant drawn for a dark background. */
const DARK_THEME_STROKE = "#F9FAFB";

/**
 * Build the light and dark variants of one glyph.
 *
 * @param glyph - The SVG elements of a 24x24, stroke-only glyph.
 * @returns Two scalable SVG icons, one per theme.
 */
const themedIcons = (glyph: string): Icon[] =>
  (
    [
      ["light", LIGHT_THEME_STROKE],
      ["dark", DARK_THEME_STROKE],
    ] as const
  ).map(([theme, stroke]) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
      `fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      `${glyph}</svg>`;
    return {
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      mimeType: "image/svg+xml",
      sizes: ["any"],
      theme,
    };
  });

/** The server itself (its `serverInfo`): a two-unit server rack. */
export const SERVER_ICONS: Icon[] = themedIcons(
  '<rect x="3" y="4" width="18" height="7" rx="2"/>' +
    '<rect x="3" y="13" width="18" height="7" rx="2"/>' +
    '<path d="M7 7.5h.01M7 16.5h.01"/>',
);

/** Every tool: a wrench. */
export const TOOL_ICONS: Icon[] = themedIcons(
  '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
);

/** Every prompt: a speech bubble. */
export const PROMPT_ICONS: Icon[] = themedIcons(
  '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
);

/** Every concrete resource: a document. */
export const RESOURCE_ICONS: Icon[] = themedIcons(
  '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
);

/** Every resource template: a document with a placeholder in braces. */
export const RESOURCE_TEMPLATE_ICONS: Icon[] = themedIcons(
  '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>' +
    '<path d="M10.5 11c-1 0-1 .8-1 1.5s0 1.5-1 1.5c1 0 1 .8 1 1.5s0 1.5 1 1.5"/>' +
    '<path d="M13.5 11c1 0 1 .8 1 1.5s0 1.5 1 1.5c-1 0-1 .8-1 1.5s0 1.5-1 1.5"/>',
);
