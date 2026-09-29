#!/usr/bin/env node
/**
 * The Python gate: one `validate` chain per Python server, and one command
 * that runs it for every server (#4865).
 *
 *   node scripts/validate-py.mjs            # every server under src/ with a pyproject.toml
 *   node scripts/validate-py.mjs fetch git  # just the named ones
 *   npm run validate:py                     # the root entry point (all servers)
 *
 * Each server runs the same chain, in its own directory, through `uv` (never
 * pip): a locked sync, `ruff check`, `ruff format --check`, `pyright`,
 * `pytest`, then `uv build`. It is the Python counterpart of the TypeScript
 * `validate` (format check, lint, typecheck, test, build).
 *
 * Why a Node script rather than a `uv run` chain in each pyproject: Python has
 * no script runner in `pyproject.toml`, and a root npm script chaining three
 * `cd … && … &&` strings would stop at the first failing server. This runs the
 * chain fail-fast *within* a server — a later step is meaningless once the
 * lockfile or the lint is red — but carries on to the next server, so one run
 * reports every server's verdict. CI calls the same script with one server per
 * matrix leg, so the local command and CI cannot drift.
 *
 * Servers are discovered, not listed: a new Python server is gated the moment
 * it lands with a `pyproject.toml`, rather than silently falling outside a
 * hardcoded table.
 *
 * `--locked` on the sync fails when `uv.lock` no longer matches
 * `pyproject.toml` (the same check CI's build job makes); every later `uv run`
 * then uses `--frozen`, so no step can re-resolve the environment it is
 * checking.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The chain every Python server runs, in order. */
export const STEPS = [
  { name: "sync", argv: ["uv", "sync", "--locked", "--all-extras", "--dev"] },
  { name: "ruff check", argv: ["uv", "run", "--frozen", "ruff", "check", "."] },
  {
    name: "ruff format --check",
    argv: ["uv", "run", "--frozen", "ruff", "format", "--check", "."],
  },
  { name: "pyright", argv: ["uv", "run", "--frozen", "pyright"] },
  { name: "pytest", argv: ["uv", "run", "--frozen", "pytest"] },
  { name: "build", argv: ["uv", "build"] },
];

/**
 * Every directory directly under `srcDir` that holds a `pyproject.toml`,
 * sorted so the run order is stable.
 * @param {string} srcDir
 * @returns {string[]}
 */
export function discoverServers(srcDir) {
  return readdirSync(srcDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(srcDir, entry.name, "pyproject.toml"))
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Resolve the servers to validate from the CLI arguments. No arguments means
 * every discovered server; a name that is not a Python server is an error,
 * never a silent skip.
 * @param {string[]} args
 * @param {string[]} available
 * @returns {{ servers: string[] } | { error: string }}
 */
export function selectServers(args, available) {
  if (available.length === 0) {
    return { error: "no Python servers found (no src/*/pyproject.toml)" };
  }
  if (args.length === 0) return { servers: available };
  const unknown = args.filter((name) => !available.includes(name));
  if (unknown.length > 0) {
    return {
      error: `not a Python server: ${unknown.join(
        ", "
      )} (known: ${available.join(", ")})`,
    };
  }
  return { servers: args };
}

/**
 * Run one command and report whether it succeeded.
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {{ ok: boolean, detail?: string }}
 */
export function runCommand(argv, cwd) {
  const [cmd, ...rest] = argv;
  const result = spawnSync(cmd, rest, { cwd, stdio: "inherit" });
  if (result.error) {
    const code = /** @type {NodeJS.ErrnoException} */ (result.error).code;
    return {
      ok: false,
      detail:
        code === "ENOENT"
          ? `${cmd} not found on PATH (install uv: https://docs.astral.sh/uv/)`
          : result.error.message,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      detail:
        result.status === null
          ? `killed by ${result.signal}`
          : `exit ${result.status}`,
    };
  }
  return { ok: true };
}

/**
 * Validate each server: its chain stops at the first failing step, and the
 * run moves on to the next server either way.
 * @param {{
 *   servers: string[],
 *   srcDir: string,
 *   steps?: typeof STEPS,
 *   run?: (argv: string[], cwd: string) => { ok: boolean, detail?: string },
 *   log?: (line: string) => void,
 * }} options
 * @returns {{ server: string, failedStep?: string, detail?: string }[]}
 */
export function validateServers({
  servers,
  srcDir,
  steps = STEPS,
  run = runCommand,
  log = console.log,
}) {
  const results = [];
  for (const server of servers) {
    const cwd = path.join(srcDir, server);
    let failure;
    for (const step of steps) {
      log(`\n[validate:py] ${server}: ${step.name}`);
      const outcome = run(step.argv, cwd);
      if (!outcome.ok) {
        failure = { failedStep: step.name, detail: outcome.detail };
        break;
      }
    }
    results.push({ server, ...failure });
  }
  return results;
}

/**
 * One line per server, and the process exit code the results imply.
 * @param {{ server: string, failedStep?: string, detail?: string }[]} results
 * @returns {{ lines: string[], exitCode: number }}
 */
export function summarize(results) {
  const lines = results.map((r) =>
    r.failedStep === undefined
      ? `  PASS  ${r.server}`
      : `  FAIL  ${r.server} — ${r.failedStep}${
          r.detail ? ` (${r.detail})` : ""
        }`
  );
  const exitCode = results.some((r) => r.failedStep !== undefined) ? 1 : 0;
  return { lines, exitCode };
}

function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const srcDir = path.join(repoRoot, "src");
  const selection = selectServers(
    process.argv.slice(2),
    discoverServers(srcDir)
  );
  if ("error" in selection) {
    console.error(`[validate:py] ${selection.error}`);
    return 2;
  }
  const results = validateServers({ servers: selection.servers, srcDir });
  const { lines, exitCode } = summarize(results);
  console.log(["\n[validate:py] summary", ...lines].join("\n"));
  return exitCode;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
