#!/usr/bin/env node
/**
 * Pack-and-verify: build the exact artifact a registry would receive, install
 * it into a clean throwaway consumer, and boot the installed server (#4873).
 *
 *   node scripts/pack-and-verify.mjs                    # every server
 *   node scripts/pack-and-verify.mjs memory time        # just the named ones
 *   node scripts/pack-and-verify.mjs memory --out dir   # and keep the artifact in dir
 *   npm run pack:verify                                 # the root entry point (all)
 *
 * Why it exists when the boot smoke already starts every server: the smoke
 * runs the CHECKOUT (`src/<server>/dist/index.js`, or the console script
 * through `uv run` in the server's own environment). That is not what a user
 * gets. A user gets the tarball or the wheel, installed somewhere else, with
 * only the dependencies its manifest declares. So the smoke cannot see:
 *
 *   - a file the runtime needs that the `files` allowlist (npm) or the wheel's
 *     package selection (hatchling) leaves out;
 *   - a runtime dependency that resolves in the checkout only because the
 *     workspace root or the dev environment happens to provide it;
 *   - a `bin` or `[project.scripts]` entry that does not survive installation.
 *
 * Each passes every test and the smoke, and breaks the first `npx` or `uvx`
 * after a release. This closes that gap by doing what a user does:
 *
 *   TypeScript  `npm pack` (which runs the package's `prepare` build) →
 *               `npm install <tarball>` into an empty directory → run the
 *               installed `node_modules/.bin/<bin>`
 *   Python      `uv build` → `uv venv` + `uv pip install <wheel>` into an
 *               empty directory → run the installed console script
 *
 * and then asking the installed server the same question the boot smoke asks
 * (`smokeOne` from `smoke-servers.mjs`: connect, list tools, call one), over
 * every transport the server implements. The two cannot drift, because the
 * server table and the client are the same code.
 *
 * `--out <dir>` leaves each verified artifact in `<dir>/<server>/` instead of
 * deleting it. `release.yml` uses it so that what it uploads for the publish
 * job is the very file that was just verified, not a second build of it.
 *
 * It needs the network (the installs pull each package's runtime dependencies
 * from the registry), so it is NOT a stage of `local:gate`: the gate must be
 * runnable offline with warm caches. It runs in `release.yml` before anything
 * is published, and by hand when preparing the release ledger, since by the
 * time the workflow runs it the tag already exists.
 *
 * One server failing does not stop the rest; the run exits non-zero if any
 * failed.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SERVERS,
  selectTargets,
  serverArguments,
  smokeOne,
  startPage,
} from "./smoke-servers.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Split the command line into server names and the `--out` directory.
 *
 * @param {string[]} argv
 * @returns {{ names: string[], out: string | undefined }}
 */
export function parseArgs(argv) {
  const names = [];
  let out;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      out = argv[i + 1];
      if (!out || out.startsWith("--"))
        throw new Error("--out needs a directory");
      i += 1;
    } else if (argv[i].startsWith("--")) {
      throw new Error(`unknown option: ${argv[i]}`);
    } else {
      names.push(argv[i]);
    }
  }
  return { names, out };
}

/**
 * What is wrong with an npm tarball's contents, judged from its manifest and
 * file list alone: every `bin` target must be in it. Anything subtler (a
 * module the entry point imports, a data file) is found by actually running
 * the installed bin, which is the next step.
 *
 * @param {{ bin?: string | Record<string, string> }} manifest the package.json
 * @param {string[]} files the paths in the tarball, relative to the package
 * @returns {string[]} one line per problem; empty when there is none
 */
export function tarballProblems(manifest, files) {
  const bins = binEntries(manifest);
  if (bins.length === 0) return ["package.json declares no `bin`"];
  const present = new Set(files.map((f) => path.posix.normalize(f)));
  return bins
    .filter(([, target]) => !present.has(path.posix.normalize(target)))
    .map(
      ([name, target]) =>
        `bin \`${name}\` points at ${target}, which is not in the tarball`,
    );
}

/** A manifest's `bin` as `[command, target]` pairs, in either of its forms. */
function binEntries(manifest) {
  if (typeof manifest.bin === "string")
    return [[String(manifest.name).split("/").at(-1), manifest.bin]];
  return Object.entries(manifest.bin ?? {});
}

/**
 * Where an installed package's command lives inside its consumer directory.
 *
 * @param {"ts" | "py"} language
 * @param {string} consumer the directory the artifact was installed into
 * @param {string} command the bin or console-script name
 * @param {string} [platform]
 * @returns {string}
 */
export function installedCommand(
  language,
  consumer,
  command,
  platform = process.platform,
) {
  const win = platform === "win32";
  return language === "ts"
    ? path.join(
        consumer,
        "node_modules",
        ".bin",
        win ? `${command}.cmd` : command,
      )
    : path.join(
        consumer,
        ".venv",
        win ? "Scripts" : "bin",
        win ? `${command}.exe` : command,
      );
}

/** Is this file name something PyPI accepts: a wheel or an sdist? */
export function isDistribution(file) {
  return file.endsWith(".whl") || file.endsWith(".tar.gz");
}

/** Run a command to completion; throw with its output when it fails. */
function run(command, args, cwd) {
  const res = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (res.error) throw res.error;
  if (res.status !== 0)
    throw new Error(
      `\`${command} ${args.join(" ")}\` exited ${res.status}:\n${(res.stderr || res.stdout).trim().split("\n").slice(-25).join("\n")}`,
    );
  return res.stdout;
}

/**
 * Pack a TypeScript server and install the tarball into `consumer`.
 *
 * @returns {{ command: string, artifacts: string[] }}
 */
function packTs(server, artifactDir, consumer) {
  const pkgDir = path.join(repoRoot, "src", server.name);
  const manifest = JSON.parse(
    readFileSync(path.join(pkgDir, "package.json"), "utf8"),
  );
  // `npm pack` runs the package's `prepare` script, which builds it: the
  // tarball holds a fresh build, never whatever `dist/` was lying around.
  const [packed] = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", artifactDir], pkgDir),
  );
  const problems = tarballProblems(
    manifest,
    packed.files.map((f) => f.path),
  );
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const tarball = path.join(artifactDir, packed.filename);
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({ name: "pack-verify-consumer", private: true }),
  );
  run("npm", ["install", "--no-audit", "--no-fund", tarball], consumer);
  const [command] = binEntries(manifest)[0];
  return {
    command: installedCommand("ts", consumer, command),
    artifacts: [tarball],
  };
}

/**
 * Build a Python server and install its wheel into a fresh environment in
 * `consumer`.
 *
 * @returns {{ command: string, artifacts: string[] }}
 */
function packPy(server, artifactDir, consumer) {
  const pkgDir = path.join(repoRoot, "src", server.name);
  // Both distributions are built, since both are published; the wheel is the
  // one installed, because it is what `uvx` and `pip` pick.
  run("uv", ["build", "--out-dir", artifactDir], pkgDir);
  // uv also drops a `.gitignore` into the output directory. It is not a
  // distribution, and this directory is what the publish job uploads.
  for (const f of readdirSync(artifactDir))
    if (!isDistribution(f)) rmSync(path.join(artifactDir, f), { force: true });
  const built = readdirSync(artifactDir).map((f) => path.join(artifactDir, f));
  const wheels = built.filter((f) => f.endsWith(".whl"));
  if (wheels.length !== 1)
    throw new Error(
      `expected exactly one wheel from \`uv build\`, found ${wheels.length}: ${built.map((f) => path.basename(f)).join(", ")}`,
    );
  const python = readFileSync(
    path.join(pkgDir, ".python-version"),
    "utf8",
  ).trim();
  const venv = path.join(consumer, ".venv");
  run("uv", ["venv", "--python", python, venv], consumer);
  run("uv", ["pip", "install", "--python", venv, wheels[0]], consumer);
  return {
    command: installedCommand("py", consumer, `mcp-server-${server.name}`),
    artifacts: built,
  };
}

/**
 * @param {string[]} [argv] server names and `--out <dir>`; no names means every server
 * @returns {Promise<number>} the exit code
 */
export async function main(argv = process.argv.slice(2)) {
  let servers, out;
  try {
    const args = parseArgs(argv);
    out = args.out && path.resolve(args.out);
    // The names are validated by the smoke's own selector, so a typo fails
    // here the same way it does there.
    const wanted = new Set(selectTargets(args.names).map((t) => t.server.name));
    servers = SERVERS.filter((s) => wanted.has(s.name));
  } catch (err) {
    console.error(`pack:verify — ${err.message}`);
    return 2;
  }

  const page = await startPage();
  const failures = [];
  try {
    for (const server of servers) {
      const work = mkdtempSync(path.join(tmpdir(), `mcp-pack-${server.name}-`));
      const consumer = path.join(work, "consumer");
      const artifactDir = out
        ? path.join(out, server.name)
        : path.join(work, "artifact");
      const started = Date.now();
      try {
        // A leftover artifact from an earlier run must not be mistaken for
        // this run's, or uploaded next to it.
        rmSync(artifactDir, { recursive: true, force: true });
        mkdirSync(artifactDir, { recursive: true });
        mkdirSync(consumer);
        const { command, artifacts } =
          server.language === "ts"
            ? packTs(server, artifactDir, consumer)
            : packPy(server, artifactDir, consumer);
        if (!existsSync(command))
          throw new Error(
            `the install did not create ${path.relative(work, command)}`,
          );
        for (const transport of server.transports) {
          const dir = mkdtempSync(path.join(work, "run-"));
          await smokeOne(
            server,
            transport,
            { dir, pageUrl: page.url },
            {
              command,
              args: serverArguments(server, transport, {
                dir,
                pageUrl: page.url,
              }),
              // Not the checkout: a relative path that only resolves there
              // must not resolve here.
              cwd: consumer,
            },
          );
        }
        const sizes = artifacts
          .map(
            (f) =>
              `${path.basename(f)} ${(statSync(f).size / 1024).toFixed(1)} kB`,
          )
          .join(", ");
        console.log(
          `pack:verify — ok    ${server.name} over ${server.transports.join(", ")} (${sizes}; ${Date.now() - started}ms)`,
        );
      } catch (err) {
        failures.push(server.name);
        console.error(
          `pack:verify — FAIL  ${server.name}\n${err?.message ?? err}\n`,
        );
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }
  } finally {
    await page.close();
  }

  if (failures.length > 0) {
    console.error(
      `pack:verify — ${failures.length} of ${servers.length} failed: ${failures.join(", ")}`,
    );
    return 1;
  }
  console.log(
    `pack:verify — OK (${servers.length} package(s) installed from the publish artifact and booted)`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(await main());
