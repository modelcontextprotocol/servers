#!/usr/bin/env node
// The registry-diff guard for the npm publish jobs in `release.yml` (#4472):
// is this package's version already on the registry?
//
// A release publishes every package whose version the registry does not have
// yet, and SKIPS (not fails) the ones it does. That is what makes a release
// idempotent and self-healing: a package whose publish failed last time is
// simply picked up by the next release, and one that did not change is left
// alone. The guard this replaces ran `npm view` and exited 1 on a published
// version, so an unchanged package turned the run red; and `npm view` itself
// exits non-zero (E404) for a package with no registry entry at all, which
// would have aborted a brand-new server's first publish.
//
// It asks the registry directly rather than parsing `npm view` output. The
// three answers that matter are then three HTTP outcomes with no CLI wording
// or stdout/stderr split to interpret:
//
//   200, version listed      already published   → skip
//   200, version not listed  new version         → publish
//   404                      never published     → publish
//
// Anything else (a 5xx, a network error, a body that is not the document the
// registry serves) fails the job. Guessing "publish" on an unreadable answer
// would attempt a duplicate publish; guessing "skip" would silently release
// nothing.
//
// Usage: `node scripts/npm-publish-guard.mjs <package dir>`. It prints the
// verdict and, under GitHub Actions, writes `skip=true|false` to the step's
// outputs.

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REGISTRY = "https://registry.npmjs.org";

/**
 * The registry URL of a package's metadata document. A scoped name keeps its
 * `@` and has its `/` escaped, which is the form the registry routes.
 *
 * @param {string} name
 * @returns {string}
 */
export function packageUrl(name) {
  return `${REGISTRY}/${name.replace("/", "%2F")}`;
}

/**
 * Pure: the verdict for one registry response.
 *
 * @param {{ status: number, body: unknown }} response `body` is the parsed JSON, when there was any
 * @param {string} version the version about to be published
 * @returns {{ skip: boolean, reason: string }}
 */
export function decide({ status, body }, version) {
  if (status === 404)
    return { skip: false, reason: "never published; this is its first" };
  if (status !== 200)
    throw new Error(`the registry answered ${status}; not guessing`);
  const versions =
    body !== null && typeof body === "object" ? body.versions : undefined;
  if (versions === null || typeof versions !== "object")
    throw new Error("the registry's answer lists no `versions`; not guessing");
  return Object.hasOwn(versions, version)
    ? { skip: true, reason: "already on npm" }
    : { skip: false, reason: "not on npm yet" };
}

/**
 * @param {string[]} argv the arguments after the script name
 * @param {object} [seams]
 * @param {typeof fetch} [seams.fetch]
 * @param {NodeJS.ProcessEnv} [seams.env]
 * @returns {Promise<number>} the exit code
 */
export async function main(
  argv,
  { fetch = globalThis.fetch, env = process.env } = {},
) {
  const [dir] = argv;
  if (!dir) {
    console.error("usage: npm-publish-guard.mjs <package dir>");
    return 2;
  }
  const { name, version } = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  );
  let verdict;
  try {
    // The abbreviated document: it carries `versions` and is a fraction of the
    // size of the full one.
    const res = await fetch(packageUrl(name), {
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    const body = res.status === 200 ? await res.json() : null;
    verdict = decide({ status: res.status, body }, version);
  } catch (error) {
    console.error(
      `npm-publish-guard: could not tell whether ${name}@${version} is published: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  console.log(
    `${name}@${version}: ${verdict.reason} — ${verdict.skip ? "skipping" : "publishing"}`,
  );
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `skip=${verdict.skip}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(await main(process.argv.slice(2)));
