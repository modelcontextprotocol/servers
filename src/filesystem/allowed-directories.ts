// How the filesystem server reports its allow-list to the operator (#4912).
// The allowed directories in force can come from the command line or, on a
// 2025-era connection, from the client's Roots, and they change at runtime as
// the client's Roots do. index.ts logs them at startup and server.ts after
// every change, both through describeAllowedDirectories, so the message reads
// the same wherever it is printed and an operator can tell the effective
// access state and its source from stderr alone, without calling a tool.

/**
 * Where the allowed directories in force came from (#4912): the command line,
 * or the client's Roots, which on a 2025-era connection replace the
 * command-line directories (`replacedCommandLine` says whether there were any
 * to replace).
 */
export type AllowedDirectoriesSource =
  | { from: "command-line" }
  | { from: "roots"; replacedCommandLine: boolean };

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
      : source.replacedCommandLine
        ? "from the client's Roots, which replaced the command-line directories"
        : "from the client's Roots";
  return [
    `Effective allowed directories (${origin}):`,
    ...directories.map((dir) => `  ${dir}`),
  ].join("\n");
}
