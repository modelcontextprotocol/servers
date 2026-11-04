// How the filesystem server reports its allow-list to the operator (#4912),
// and how --confine-roots keeps a client's Roots inside it (#3133).
// The allowed directories in force can come from the command line or, on a
// 2025-era connection, from the client's Roots, and they change at runtime as
// the client's Roots do. index.ts logs them at startup and server.ts after
// every change, both through describeAllowedDirectories, so the message reads
// the same wherever it is printed and an operator can tell the effective
// access state and its source from stderr alone, without calling a tool.
// confineRootsToDirectories is a pure function of the two lists, so the
// policy is testable apart from the roots/list exchange that feeds it.

import { isPathWithinAllowedDirectories } from "./path-validation.js";

/**
 * Where the allowed directories in force came from (#4912): the command line,
 * or the client's Roots, which on a 2025-era connection replace the
 * command-line directories (`replacedCommandLine` says whether there were any
 * to replace).
 */
export type AllowedDirectoriesSource =
  | { from: "command-line" }
  | { from: "roots"; replacedCommandLine: boolean; confined?: boolean };

/**
 * The one-message summary of the allowed directories in force, logged to
 * stderr at startup and after every change, so an operator can read the
 * effective access state and its source without calling a tool (#4912). Each
 * directory is on a line of its own, since a path may contain a comma.
 */
export function describeAllowedDirectories(
  directories: string[],
  source: AllowedDirectoriesSource,
): string {
  if (directories.length === 0) {
    return source.from === "roots"
      ? "Effective allowed directories: none. The client's Roots name no valid directory, so every path is refused until it exposes one again"
      : "Effective allowed directories: none. No command-line directories and no valid client Roots, so every path is refused";
  }
  const origin =
    source.from === "command-line"
      ? "from the command line"
      : source.confined
        ? "from the client's Roots, confined to the command-line directories"
        : source.replacedCommandLine
          ? "from the client's Roots, which replaced the command-line directories"
          : "from the client's Roots";
  return [
    `Effective allowed directories (${origin}):`,
    ...directories.map((dir) => `  ${dir}`),
  ].join("\n");
}

/**
 * The client's Roots confined to the operator's command-line directories
 * (`--confine-roots`, #3133): the overlap of the two lists, so a client's
 * Roots can narrow the command-line directories but never widen them. A root
 * inside a command-line directory is kept; a root that contains one is
 * narrowed to that directory; a root that overlaps none is ignored, and
 * returned in `ignored` so the caller can log it. Both lists hold resolved,
 * normalized directories (each spelling of a symlinked one), and every request
 * is still realpath'd and checked against the result, so a root's advertised
 * spelling kept here cannot reach past its target.
 */
export function confineRootsToDirectories(
  rootDirectories: string[],
  commandLineDirectories: string[],
): { confined: string[]; ignored: string[] } {
  const confined = new Set<string>();
  const ignored: string[] = [];
  for (const root of rootDirectories) {
    const inside = isPathWithinAllowedDirectories(root, commandLineDirectories);
    const contained = commandLineDirectories.filter((dir) =>
      isPathWithinAllowedDirectories(dir, [root]),
    );
    if (inside) confined.add(root);
    for (const dir of contained) confined.add(dir);
    if (!inside && contained.length === 0) ignored.push(root);
  }
  return { confined: [...confined], ignored };
}
