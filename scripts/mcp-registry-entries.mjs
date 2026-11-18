#!/usr/bin/env node
// Each server's entry for the official MCP Registry
// (registry.modelcontextprotocol.io), for `release.yml` (#3047).
//
// A registry entry is a `server.json`: the server's registry name, a title and
// description, and the package a client installs to run it. Each server keeps
// its own at `src/<server>/server.json`.
//
// THE COMMITTED FILE CARRIES NO VERSION, and this script adds it. The registry
// requires one, and it must be the version of a package that is already on npm
// or PyPI. But a version in this repository changes only in a version PR,
// which edits `package.json` or `pyproject.toml` and nothing else
// (`AGENTS.md`, **Versions**). A version written into `server.json` as well
// would be a second copy for those PRs to keep in step, and a stale one would
// register an entry pointing at the wrong package. So the manifest stays the
// only place a version lives, and the entry is stamped from it at release
// time, on the released commit.
//
// The registry accepts an entry only when the package itself names the server:
// `mcpName` in a published `package.json`, or an `mcp-name: <name>` marker in
// the README a PyPI project publishes as its description. Those were added
// when the issue was filed and are in every published package. A committed
// entry that disagreed with them would be refused at release time, long after
// the change that broke it merged, so `entryProblems` checks each entry against
// its package here, and the script tests run it against the repository as it
// stands (`npm run test:scripts`, part of `validate:guards`).
//
// Like `release-manifest.mjs`, this runs in `detect-packages`, with nothing
// installed and no third-party import, and its result reaches the publish job
// as a job output: the job that holds the OIDC credential takes what to
// register from the released source, not from a file a build job wrote.
//
// Under GitHub Actions it writes one step output, `mcp_registry`: a JSON
// object keyed by the server's directory under `src/`, each value the complete
// `server.json` to publish. It always prints the same JSON to stdout. Any
// problem with any entry fails the run and writes nothing.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectedPackages } from "./release-manifest.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** The `server.json` schema the entries are written against. */
export const SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

/**
 * The registry grants a namespace to whoever proves they own it. A workflow in
 * this organization proves `io.github.modelcontextprotocol/*` with its OIDC
 * token, and no other, so an entry outside it could never be published.
 */
export const NAMESPACE = "io.github.modelcontextprotocol/";

const REPOSITORY_URL = "https://github.com/modelcontextprotocol/servers";

// The registry's own limits (the schema's `maxLength`s). An over-long
// description is its most common rejection.
const MAX_DESCRIPTION = 100;
const MAX_TITLE = 100;
const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

/**
 * The server name a README claims with an `mcp-name:` marker, as the registry
 * reads it: the token after the marker, ended by whitespace, an HTML tag or a
 * comment close.
 *
 * @param {string} readme
 * @returns {string | undefined}
 */
export function readmeMarker(readme) {
  const match = /mcp-name:[ \t]*([^\s<]+?)(?=\s|<|-->|$)/.exec(readme);
  return match?.[1];
}

/**
 * Pure: what is wrong with one server's committed entry.
 *
 * @param {object} server
 * @param {string} server.dir the server's directory under `src/`
 * @param {"npm" | "pypi"} server.registryType
 * @param {string} server.packageName the name its manifest publishes under
 * @param {string | undefined} server.marker the server name its package claims
 * @param {unknown} server.entry the parsed `server.json`
 * @returns {string[]} one message per problem; empty when the entry is sound
 */
export function entryProblems({
  dir,
  registryType,
  packageName,
  marker,
  entry,
}) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry))
    return ["is not a JSON object"];
  const problems = [];
  const { name, title, description, repository, packages } = entry;

  if (entry.$schema !== SCHEMA_URL)
    problems.push(`\`$schema\` must be ${SCHEMA_URL}`);

  if (typeof name !== "string" || !NAME_PATTERN.test(name))
    problems.push("`name` must be `<namespace>/<server>`");
  else if (!name.startsWith(NAMESPACE))
    problems.push(
      `\`name\` must start with \`${NAMESPACE}\`, the only namespace this repository's workflows can publish to`,
    );
  if (marker === undefined)
    problems.push(
      registryType === "npm"
        ? "its package.json has no `mcpName`, which the registry reads to verify the package"
        : "its README has no `mcp-name:` marker, which the registry reads to verify the package",
    );
  else if (name !== marker)
    problems.push(
      `\`name\` is ${JSON.stringify(name)} but the package claims ${JSON.stringify(marker)} (${registryType === "npm" ? "`mcpName` in package.json" : "the `mcp-name:` marker in README.md"}); the registry refuses an entry whose package names another server`,
    );

  if (typeof title !== "string" || title === "" || title.length > MAX_TITLE)
    problems.push(`\`title\` must be 1 to ${MAX_TITLE} characters`);
  if (
    typeof description !== "string" ||
    description === "" ||
    description.length > MAX_DESCRIPTION
  )
    problems.push(
      `\`description\` must be 1 to ${MAX_DESCRIPTION} characters${typeof description === "string" ? ` (it is ${description.length})` : ""}`,
    );

  if ("version" in entry)
    problems.push(
      "`version` must not be committed: it is stamped from the package manifest at release time",
    );

  if (
    repository?.url !== REPOSITORY_URL ||
    repository?.source !== "github" ||
    repository?.subfolder !== `src/${dir}`
  )
    problems.push(
      `\`repository\` must be { url: ${REPOSITORY_URL}, source: github, subfolder: src/${dir} }`,
    );

  if ("remotes" in entry)
    problems.push(
      "`remotes` is not supported: these servers are installed as packages",
    );

  if (!Array.isArray(packages) || packages.length !== 1) {
    problems.push("`packages` must hold exactly one package");
    return problems;
  }
  const [pkg] = packages;
  if (pkg === null || typeof pkg !== "object") {
    problems.push("`packages[0]` is not an object");
    return problems;
  }
  if (pkg.registryType !== registryType)
    problems.push(`\`packages[0].registryType\` must be \`${registryType}\``);
  if (pkg.identifier !== packageName)
    problems.push(
      `\`packages[0].identifier\` must be the published package, \`${packageName}\``,
    );
  if ("version" in pkg)
    problems.push(
      "`packages[0].version` must not be committed: it is stamped from the package manifest at release time",
    );
  if ("registryBaseUrl" in pkg)
    problems.push(
      "`packages[0].registryBaseUrl` must be left out: the registry accepts only the public npm and PyPI registries, which are the defaults",
    );
  if (pkg.transport?.type !== "stdio")
    problems.push(
      "`packages[0].transport.type` must be `stdio`, the transport every server starts in by default",
    );
  return problems;
}

/**
 * Pure: the entry to publish, with the package's version in both places the
 * registry reads it. `version` goes after `description`, where the registry's
 * own examples put it; nothing else moves.
 *
 * @param {Record<string, unknown>} entry a committed entry `entryProblems` passed
 * @param {string} version
 * @returns {Record<string, unknown>}
 */
export function stampEntry(entry, version) {
  const stamped = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === "packages")
      stamped.packages = value.map((pkg) => ({
        registryType: pkg.registryType,
        identifier: pkg.identifier,
        version,
        ...pkg,
      }));
    else stamped[key] = value;
    if (key === "description") stamped.version = version;
  }
  return stamped;
}

/**
 * Every server's entry, stamped, or the problems that stop any from being
 * published.
 *
 * @param {string} [root] the repository root
 * @returns {{ entries: Record<string, Record<string, unknown>>, problems: string[] }}
 */
export function registryEntries(root = repoRoot) {
  const { npm, pypi } = expectedPackages(root);
  const servers = [
    ...Object.entries(npm).map(([dir, pkg]) => ({
      dir,
      registryType: "npm",
      pkg,
    })),
    ...Object.entries(pypi).map(([dir, pkg]) => ({
      dir,
      registryType: "pypi",
      pkg,
    })),
  ].sort((a, b) => a.dir.localeCompare(b.dir));

  const entries = {};
  const problems = [];
  for (const { dir, registryType, pkg } of servers) {
    const serverDir = path.join(root, "src", dir);
    const file = path.join(serverDir, "server.json");
    const label = `src/${dir}/server.json`;
    if (!existsSync(file)) {
      problems.push(
        `${label} is missing: every published server has a registry entry`,
      );
      continue;
    }
    let entry;
    try {
      entry = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      problems.push(`${label} does not parse: ${err.message}`);
      continue;
    }
    const found = entryProblems({
      dir,
      registryType,
      packageName: pkg.name,
      marker: packageMarker(serverDir, registryType),
      entry,
    });
    if (found.length > 0) {
      for (const problem of found) problems.push(`${label}: ${problem}`);
      continue;
    }
    entries[dir] = stampEntry(entry, pkg.version);
  }
  return { entries, problems };
}

/** The server name a package claims, read the way the registry will read it. */
function packageMarker(serverDir, registryType) {
  if (registryType === "npm") {
    const { mcpName } = JSON.parse(
      readFileSync(path.join(serverDir, "package.json"), "utf8"),
    );
    return typeof mcpName === "string" ? mcpName : undefined;
  }
  // Every Python server's `pyproject.toml` declares `readme = "README.md"`,
  // which is what PyPI serves as the project description.
  const readme = path.join(serverDir, "README.md");
  return existsSync(readme)
    ? readmeMarker(readFileSync(readme, "utf8"))
    : undefined;
}

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {number} the exit code
 */
export function main({ root = repoRoot, env = process.env } = {}) {
  const { entries, problems } = registryEntries(root);
  if (problems.length > 0) {
    console.error(
      `mcp-registry-entries: ${problems.length} problem(s) with the MCP Registry entries:\n`,
    );
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  console.log(JSON.stringify(entries, null, 2));
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      `mcp_registry=${JSON.stringify(entries)}\n`,
    );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
