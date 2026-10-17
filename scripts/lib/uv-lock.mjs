// Reading a `uv.lock` (#4874), for the sweeps that check the Python servers:
// `dependabot-alerts.mjs` (which version of an advisory's package is locked)
// and `sdk-watch.mjs` (which `mcp` is locked, and what range each server
// declares).
//
// A line-oriented read of the shapes uv writes, not a TOML parser: the sweeps
// need each locked package's name and version, the root project's name, and
// the root's `requires-dist` / `requires-dev` specifiers, and nothing else.
// A real TOML parser would be the sweeps' only new dependency for that.

import { normalizeName } from "./pep440.mjs";

/**
 * Every `[[package]]` in a `uv.lock`, with the root project's declared
 * specifiers. A line-oriented read of the shapes uv writes, not a TOML
 * parser: the sweep needs names, versions and the root's `requires-dist` /
 * `requires-dev` entries, nothing else.
 *
 * @param {string} text
 * @returns {{project: string | null, packages: Array<{name: string, version: string}>, declared: Map<string, string>}}
 *   `project` is the root project's normalized name; `declared` maps a
 *   normalized name to its specifier (`""` when unbounded)
 */
export function parseUvLock(text) {
  const packages = [];
  const declared = new Map();
  let project = null;
  for (const chunk of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name = "([^"]+)"/m.exec(chunk)?.[1];
    const version = /^version = "([^"]+)"/m.exec(chunk)?.[1];
    if (!name) continue;
    const isRoot = /^source = \{ (?:editable|virtual) = "\." \}/m.test(chunk);
    if (version && !isRoot) packages.push({ name, version });
    if (!isRoot) continue;
    project = normalizeName(name);
    const metadata = chunk.slice(chunk.indexOf("[package.metadata]"));
    if (!chunk.includes("[package.metadata]")) continue;
    for (const match of metadata.matchAll(
      /\{ name = "([^"]+)"(?:[^}\n]*?specifier = "([^"]*)")?[^}\n]*\}/g,
    )) {
      const key = normalizeName(match[1]);
      if (!declared.has(key)) declared.set(key, match[2] ?? "");
    }
  }
  return { project, packages, declared };
}
