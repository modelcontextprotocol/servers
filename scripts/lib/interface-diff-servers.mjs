// The servers the MCP interface diff covers, how each is started for it, and
// which of them a change touches (#5428).
//
// Two things live here, both shared by CI (`mcp-interface-diff.yml`) and the
// pre-push gate through `scripts/interface-diff.mjs`, so the two always agree
// on what to diff:
//
//   - `SERVERS`: every server, with the arguments and environment it needs to
//     boot for a probe. A probe only reads the interface (the handshake and
//     the four list calls), so each server is given a throwaway directory and
//     nothing of the user's.
//   - `selectServers`: given the files a change touched and the root lockfile
//     on both sides, the servers whose interface the change can have moved.
//
// Why the lockfile is read rather than just matched by name: almost every
// TypeScript PR rewrites `package-lock.json`, so "the lockfile changed" would
// select every TypeScript server on almost every PR, which is the bug #5428
// was filed for. Instead each workspace's resolved dependency tree is walked
// in both lockfiles, the way Node resolves it, and the server is selected only
// when a package it can load differs. A Python server's lockfile lives inside
// its own directory, so `src/<server>/**` already covers it.
//
// This module imports nothing outside Node: the CI job that chooses the
// servers runs it before any `npm ci`.

/** Every server, and how a probe starts it. `ctx.dir` is a throwaway directory. */
export const SERVERS = [
  {
    name: "everything",
    language: "ts",
    // `everything` takes its transport as its first argument.
    args: () => ["stdio"],
  },
  {
    name: "filesystem",
    language: "ts",
    // It refuses to start without an allowed directory.
    args: (ctx) => [ctx.dir],
  },
  {
    name: "memory",
    language: "ts",
    // A probe writes nothing, but the graph file is kept out of the build
    // directory all the same.
    env: (ctx) => ({ MEMORY_FILE_PATH: `${ctx.dir}/memory.jsonl` }),
  },
  { name: "sequentialthinking", language: "ts" },
  { name: "fetch", language: "py" },
  {
    name: "git",
    language: "py",
    args: (ctx) => ["--repository", ctx.dir],
    prepareGitRepo: true,
  },
  {
    name: "time",
    language: "py",
    // Pinned, so the base and the head describe the same local zone.
    args: () => ["--local-timezone", "UTC"],
  },
];

/**
 * Files whose change selects every server: the diff tooling itself, since a
 * change to how the diff runs is checked by running it everywhere.
 */
export const TOOLING_PATHS = [
  "scripts/interface-diff.mjs",
  "scripts/lib/interface-diff-servers.mjs",
  "scripts/lib/win-shell-args.mjs",
  ".github/workflows/mcp-interface-diff.yml",
];

/** Root files every TypeScript server's build reads. */
export const TS_WIDE_PATHS = ["tsconfig.json"];

/** The root devDependency that runs the probes; its version counts as tooling. */
export const DIFF_TOOL_PACKAGE = "mcp-server-diff";

/**
 * Where Node finds `name` when it is required from the package at `from`, in
 * a v2/v3 lockfile's `packages` map: the nearest `node_modules/<name>` going
 * up from `from`. `null` when nothing provides it (an optional peer, say).
 *
 * @param {Record<string, object>} packages
 * @param {string} from a `packages` key ("" is the root)
 * @param {string} name
 * @returns {string | null}
 */
export function resolveLocation(packages, from, name) {
  let base = from;
  for (;;) {
    const candidate = base
      ? `${base}/node_modules/${name}`
      : `node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    if (!base) return null;
    const nested = base.lastIndexOf("node_modules/");
    if (nested === 0) base = "";
    else if (nested > 0) base = base.slice(0, nested - 1);
    else base = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
  }
}

/** What identifies a locked package's content. */
function fingerprint(entry) {
  if (entry.link) return `link:${entry.resolved}`;
  return [entry.version, entry.resolved, entry.integrity].join("|");
}

/**
 * Every package the package at `start` can load, by lockfile location, with
 * the fingerprint of what is locked there. The starting package's own
 * devDependencies count (they build it); a dependency's do not (npm does not
 * install them). Workspace links are followed to their target.
 *
 * @param {{ packages?: Record<string, object> } | null} lock a parsed lockfile
 * @param {string | null} start a `packages` key
 * @returns {Map<string, string>}
 */
export function lockfileClosure(lock, start) {
  const packages = lock?.packages ?? {};
  const seen = new Map();
  if (start === null) return seen;
  const stack = [start];
  while (stack.length > 0) {
    const location = stack.pop();
    if (seen.has(location)) continue;
    const entry = packages[location];
    if (!entry) continue;
    seen.set(location, fingerprint(entry));
    if (entry.link) {
      stack.push(entry.resolved);
      continue;
    }
    const names = new Set([
      ...Object.keys(entry.dependencies ?? {}),
      ...Object.keys(entry.optionalDependencies ?? {}),
      ...Object.keys(entry.peerDependencies ?? {}),
      ...(location === start ? Object.keys(entry.devDependencies ?? {}) : []),
    ]);
    for (const name of names) {
      const found = resolveLocation(packages, location, name);
      if (found !== null) stack.push(found);
    }
  }
  return seen;
}

/** Whether two closures lock different packages. */
function closuresDiffer(a, b) {
  if (a.size !== b.size) return true;
  for (const [location, print] of a) if (b.get(location) !== print) return true;
  return false;
}

/**
 * The servers a change can have moved the interface of, in `SERVERS` order,
 * each with the reason it was selected.
 *
 * @param {{ changedFiles: string[], baseLock: object | null,
 *   headLock: object | null, servers?: typeof SERVERS }} input
 *   `changedFiles` are repository-relative, `/`-separated paths, both sides
 *   of a rename included.
 * @returns {{ server: string, language: string, reason: string }[]}
 */
export function selectServers({
  changedFiles,
  baseLock,
  headLock,
  servers = SERVERS,
}) {
  const changed = new Set(changedFiles);
  const lockChanged = changed.has("package-lock.json");
  const treeChanged = (start) =>
    closuresDiffer(
      lockfileClosure(baseLock, start),
      lockfileClosure(headLock, start),
    );

  // The diff tool's own version, not its dependency tree: a transitive bump
  // under it (an `overrides` pin, say) moves no probe, and selecting every
  // server for one is the noise this selection exists to remove.
  const toolPrint = (lock) => {
    const entry = lock?.packages?.[`node_modules/${DIFF_TOOL_PACKAGE}`];
    return entry ? fingerprint(entry) : null;
  };

  let everyServer = null;
  const tooling = TOOLING_PATHS.find((p) => changed.has(p));
  if (tooling) everyServer = `\`${tooling}\` (the diff tooling) changed`;
  else if (lockChanged && toolPrint(baseLock) !== toolPrint(headLock))
    everyServer = `\`package-lock.json\` changes \`${DIFF_TOOL_PACKAGE}\`, which runs the diff`;

  const selected = [];
  for (const { name, language } of servers) {
    const dir = `src/${name}/`;
    const own = changedFiles.filter((f) => f.startsWith(dir));
    let reason = everyServer;
    if (!reason && own.length > 0)
      reason =
        own.length === 1
          ? `\`${own[0]}\` changed`
          : `${own.length} files under \`${dir}\` changed`;
    if (!reason && language === "ts") {
      const wide = TS_WIDE_PATHS.find((p) => changed.has(p));
      if (wide)
        reason = `\`${wide}\`, which every TypeScript server extends, changed`;
      else if (lockChanged && treeChanged(`src/${name}`))
        reason = "`package-lock.json` changes a package it resolves";
    }
    if (reason) selected.push({ server: name, language, reason });
  }
  return selected;
}
