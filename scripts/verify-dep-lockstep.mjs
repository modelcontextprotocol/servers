#!/usr/bin/env node
// Shared-devDependency lockstep guard (#4864), adapted from the MCP
// Inspector's `verify:dep-lockstep`.
//
// The Inspector's version runs over five separate installs and asks which
// packages two installs put into one `tsc` program. This repo is a single npm
// workspace with one lockfile, so that question mostly answers itself — but
// not entirely: each workspace still declares its own ranges, and they drift.
// When this guard landed, `typescript` alone was declared three ways
// (`^5.6.2`, `^5.8.2`, `^5.3.3`), and `everything` pinned Prettier 2 while the
// repo moved to Prettier 3. A range is a statement about which toolchain the
// package builds and tests with; three statements about one toolchain is two
// too many, and the lockfile resolving them to one version today is luck that
// the next install can undo.
//
// So the rule is the smaller one §2.3 of docs/agent-guidance-inception.md
// sets: every SHARED toolchain package is declared with ONE range everywhere it
// is declared — across the root and every workspace, in any dependency section.
// Declaring it in a single manifest (the root, as `prettier` is) is the
// degenerate case of the same rule: one declaration is one range. Where a
// package is declared is not this guard's question — only that no two
// declarations disagree. The shared set is named
// below. The Python servers are independent by design and have no manifest
// here, so they are out of scope.
//
// Exits non-zero, naming each package and where each range is declared.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rootReachesScript } from "./lib/npm-scripts.mjs";
import { readWorkspaces } from "./lib/workspaces.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The toolchain every TypeScript workspace builds, tests or formats with. A
 * package belongs here when two workspaces declaring different ranges of it
 * would mean they are gated by different tools.
 */
export const SHARED_DEV_DEPENDENCIES = [
  "typescript",
  "vitest",
  "@vitest/coverage-v8",
  "prettier",
  "@types/node",
];

// Every section a range can be declared in. `peerDependencies` is not one: a
// peer range states what a consumer may bring, not what this repo installs.
const SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"];

/**
 * Pure: the lockstep problems in a set of manifests.
 *
 * @param {{ dir: string, pkg: Record<string, unknown> }[]} manifests `dir` is
 *   repo-relative (`.` for the root).
 * @param {string[]} [shared]
 * @returns {string[]} One message per divergent package.
 */
export function lockstepProblems(manifests, shared = SHARED_DEV_DEPENDENCIES) {
  const problems = [];
  for (const name of shared) {
    /** @type {Map<string, string[]>} range -> ["dir (section)", …] */
    const byRange = new Map();
    for (const { dir, pkg } of manifests)
      for (const section of SECTIONS) {
        const range = pkg?.[section]?.[name];
        if (typeof range !== "string") continue;
        if (!byRange.has(range)) byRange.set(range, []);
        byRange.get(range).push(`${dir} (${section})`);
      }
    if (byRange.size <= 1) continue;
    const detail = [...byRange.entries()]
      .map(([range, where]) => `    ${range}: ${where.join(", ")}`)
      .join("\n");
    problems.push(
      `\`${name}\` is declared with ${byRange.size} different ranges:\n${detail}`,
    );
  }
  return problems;
}

/** Read the root manifest and every workspace manifest. */
function readManifests() {
  const read = (dir) =>
    JSON.parse(readFileSync(path.join(repoRoot, dir, "package.json"), "utf8"));
  return [
    { dir: ".", pkg: read(".") },
    ...readWorkspaces(repoRoot)
      .filter((w) => w.hasManifest)
      .map((w) => ({ dir: w.dir, pkg: read(w.dir) })),
  ];
}

export function main() {
  let manifests;
  try {
    manifests = readManifests();
  } catch (err) {
    console.error(`verify:dep-lockstep — ${err.message}`);
    process.exit(1);
  }

  // Vouch for the sibling guard: a guard cannot detect being unrun itself, but
  // `verify:format-coverage` checks this one is still in `validate`, and this
  // checks it back — so dropping either is caught by the other.
  if (!rootReachesScript(manifests[0].pkg.scripts, "verify:format-coverage")) {
    console.error(
      "verify:dep-lockstep — the root `validate` no longer runs `verify:format-coverage` (its sibling guard). Restore it.",
    );
    process.exit(1);
  }

  const problems = lockstepProblems(manifests);
  if (problems.length > 0) {
    console.error(
      `verify:dep-lockstep — ${problems.length} shared toolchain package(s) are not in lockstep:\n`,
    );
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nDeclare each with one identical range everywhere it is declared (or in a single manifest).",
    );
    console.error(
      "Bump it in every manifest in the same change, then `npm install` at the root so the lockfile follows.",
    );
    process.exit(1);
  }
  console.log(
    `verify:dep-lockstep — OK: ${SHARED_DEV_DEPENDENCIES.length} shared toolchain packages are in lockstep across ${manifests.length} manifests.`,
  );
}

// Run only when executed directly; importing (tests) exposes the pure helper.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
