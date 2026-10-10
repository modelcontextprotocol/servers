#!/usr/bin/env node
// What each package on the released commit is called and which version it
// carries, for `release.yml` (#4873).
//
// The publish jobs hold the OIDC credential and publish an artifact a build
// job produced. That artifact is untrusted input: it was built after
// dependency install scripts ran, and every package in this repository
// trusts the same workflow and environment, so a tampered build could hand
// the publish job a tarball named for a DIFFERENT trusted package, or
// carrying an arbitrary version. The publish jobs therefore compare what they
// are about to publish with what the released source says it should be.
//
// That expectation has to come from somewhere dependency code has not run.
// `detect-packages` is that place: it checks out the tag and runs this script,
// which reads the manifests with nothing installed and no third-party import.
// Its output reaches each publish leg as a job output, not as a file a build
// job could rewrite.
//
// Under GitHub Actions it writes two step outputs, `npm_expected` and
// `pypi_expected`, each a JSON object keyed by the package's directory under
// `src/`: `{ "memory": { "name": "@scope/pkg", "version": "1.0.0" } }`. It
// always prints the same JSON to stdout.

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readProject } from "./prepare-python-release.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The name and version of every package under `src/`, by registry.
 *
 * @param {string} [root] the repository root
 * @returns {{ npm: Record<string, { name: string, version: string }>, pypi: Record<string, { name: string, version: string }> }}
 */
export function expectedPackages(root = repoRoot) {
  const src = path.join(root, "src");
  const npm = {};
  const pypi = {};
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(src, entry.name);
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      const { name, version } = JSON.parse(readFileSync(manifest, "utf8"));
      npm[entry.name] = identity(name, version, manifest);
    }
    const pyproject = path.join(dir, "pyproject.toml");
    if (existsSync(pyproject)) {
      const { name, version } = readProject(readFileSync(pyproject, "utf8"));
      pypi[entry.name] = identity(name, version, pyproject);
    }
  }
  return { npm, pypi };
}

/** A name and a version, both non-empty strings, or a loud failure. */
function identity(name, version, file) {
  if (typeof name !== "string" || name === "")
    throw new Error(`${file} has no package name`);
  if (typeof version !== "string" || version === "")
    throw new Error(`${file} has no version`);
  return { name, version };
}

/**
 * The file-name stem PyPI distributions of a project carry: the project name
 * with every run of `-`, `_` and `.` turned into one `_`, lowercased, then
 * `-<version>`. A wheel is `<stem>-<tags>.whl`, an sdist `<stem>.tar.gz`.
 *
 * @param {string} name
 * @param {string} version
 * @returns {string}
 */
export function distributionStem(name, version) {
  return `${name.replace(/[-_.]+/g, "_").toLowerCase()}-${version}`;
}

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {number} the exit code
 */
export function main({ root = repoRoot, env = process.env } = {}) {
  const { npm, pypi } = expectedPackages(root);
  // The stem is computed here, once, so the publish job's shell compares file
  // names with a string and does no normalizing of its own.
  for (const pkg of Object.values(pypi))
    pkg.stem = distributionStem(pkg.name, pkg.version);
  console.log(JSON.stringify({ npm, pypi }, null, 2));
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      `npm_expected=${JSON.stringify(npm)}\npypi_expected=${JSON.stringify(pypi)}\n`,
    );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
