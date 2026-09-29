// Shared resolver for spawning a package's CLI cross-platform (#1939).
//
// Ported from the MCP Inspector for #4864, where `verify:typecheck-coverage`
// spawns tsc through it; `#N` in these comments are that repo's issues.
//
// On Windows, `npx`/`npm` are `.cmd` shims, not executables — a shell-free
// `execFileSync`/`spawnSync` cannot start one (Node refuses `.cmd`/`.bat`
// spawns without `shell: true` since the CVE-2024-27980 hardening) and throws
// `ENOENT`. GitHub CI runs Linux, so the gate stayed green there while being
// unrunnable for any Windows contributor. Instead of shelling through `npx`,
// resolve the JS entry behind the package's bin and run it with
// `process.execPath`: cross-platform, shell-free (no quoting hazards), faster
// (no npx resolution), and pinned to the locally installed package exactly as
// `npx --no-install` was.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Absolute path of the JS entry behind a package's bin (e.g. typescript's
 * `tsc`, vite's `vite`), resolved from `fromDir` up the node_modules tree —
 * the same walk `npx --no-install` does, minus the `.cmd` shim a shell-free
 * spawn can't start on Windows. Reads the package's manifest and takes the
 * path out of its `bin` field (what npx itself does) rather than resolving the
 * bin path directly, because an `exports` map blocks deep resolution — Vite 8
 * doesn't export `./bin/vite.js`, so `require.resolve("vite/bin/vite.js")`
 * throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * Throws if the package isn't installed from `fromDir`, declares no such bin,
 * or declares one whose file is missing — the caller decides whether that's a
 * hard "cannot measure" error or a fallback.
 */
export function resolveNodeBin(pkg, binName, fromDir) {
  const pkgPath = resolveManifest(pkg, fromDir);
  const manifest = JSON.parse(readFileSync(pkgPath, "utf8"));
  const { bin } = manifest;
  // A string-form `bin` is npm's shorthand for ONE command, named after the
  // package (unscoped). It does not make every requested `binName` valid, so
  // match it rather than accepting whatever was asked for — otherwise a typo
  // silently resolves the package's only executable instead of failing.
  const rel =
    typeof bin === "string"
      ? unscopedName(manifest.name ?? pkg) === binName
        ? bin
        : undefined
      : bin?.[binName];
  if (typeof rel !== "string")
    throw new Error(`${pkg} declares no "${binName}" bin in its package.json`);
  const entry = path.join(path.dirname(pkgPath), rel);
  // A declared bin whose file is absent is a partial install, and it fails
  // *silently* downstream: `process.execPath <missing>` still spawns fine and
  // exits 1 with nothing on stdout, which `rawProjectListing` records as "no
  // diagnostic captured" and turns into the bogus every-file-uncovered report
  // this helper exists to eliminate. Fail here, where the remedy is actionable.
  if (!existsSync(entry))
    throw new Error(
      `${pkg}'s "${binName}" bin points at a missing file: ${entry}`,
    );
  return entry;
}

/**
 * The package's own `package.json`, found by walking the same `node_modules`
 * chain Node's resolver would from `fromDir` — deliberately NOT via
 * `require.resolve("<pkg>/package.json")`.
 *
 * That shortcut reads as safe and isn't: subpath resolution is governed by the
 * package's `exports`, and a package may declare one that omits `./package.json`
 * (Node dropped its special case for it, so there is no guaranteed export). Such
 * a package throws `ERR_PACKAGE_PATH_NOT_EXPORTED` here even though its bin is
 * installed and perfectly spawnable — a false "not installed" that would send
 * someone to `npm install` for a package already on disk. `resolve.paths()`
 * gives the search dirs without consulting `exports` at all.
 *
 * Its list is then filtered to the `node_modules` directories on `fromDir`'s
 * own ancestor chain, because `resolve.paths()` also appends Node's GLOBAL
 * FOLDERS (`$HOME/.node_modules`, `$HOME/.node_libraries`, `$PREFIX/lib/node`)
 * and any `NODE_PATH` entries. Accepting those would quietly break the
 * guarantee this module exists to keep — that the spawned tsc/vite is the
 * REPO-PINNED one, exactly as `npx --no-install` promised. A missing repo
 * install would then find a globally installed TypeScript and measure the
 * programs with the wrong compiler, instead of failing with the actionable
 * "run npm install" this helper is supposed to produce.
 */
function resolveManifest(pkg, fromDir) {
  const require = createRequire(path.join(fromDir, "package.json"));
  // `resolve.paths` returns null only for builtins, which have no bin to find.
  for (const dir of localSearchDirs(
    require.resolve.paths(pkg) ?? [],
    fromDir,
  )) {
    const candidate = path.join(dir, ...pkg.split("/"), "package.json");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot find ${pkg} from ${fromDir}`);
}

/**
 * The subset of `resolve.paths()` that is a `node_modules` directory sitting
 * directly under `fromDir` or one of its ancestors — i.e. the local walk, with
 * Node's global folders and `NODE_PATH` dropped. Exported for its own test.
 */
export function localSearchDirs(dirs, fromDir) {
  const ancestors = new Set();
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    ancestors.add(dir);
    if (dir === path.dirname(dir)) break;
  }
  return dirs.filter(
    (dir) =>
      path.basename(dir) === "node_modules" &&
      ancestors.has(path.dirname(path.resolve(dir))),
  );
}

/** `@scope/name` → `name`; an unscoped name is returned unchanged. */
function unscopedName(name) {
  return name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
}
