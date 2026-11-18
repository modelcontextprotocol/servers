#!/usr/bin/env node
// The image smoke (#5598): build the Docker image of each server a change
// touches, start it the way a client configuration does (`docker run -i`),
// and ask it for its tools over stdio.
//
// Why it exists: every server ships a `Dockerfile`, and until this script
// nothing built one. The boot smoke runs the checkout and `pack:verify` the
// publish artifact, so a Dockerfile that no longer builds, an image whose
// entrypoint cannot find the server, or a container that `docker stop` has to
// kill all passed every check and reached a release, where they were found by
// hand (the v2.5.0 release verification, #5572).
//
// What it checks, per image:
//
//   1. It builds, with the command its Dockerfile and README document: the
//      repository root as the context for a TypeScript server (an npm
//      workspace, whose lockfile is the root's), the server's own directory
//      for a Python one.
//   2. It boots: an MCP client connects over the container's stdio, lists the
//      tools, and finds the one the table names.
//   3. Where the table says the image stops on its own (`cleanStop`),
//      `docker stop` ends it before Docker's timeout. A container Docker has
//      to SIGKILL exits 137, and the server in it ran none of its cleanup.
//   4. For `memory`, whose cleanup removes the lock file a write holds
//      (#5485): after a write and that stop, the graph's directory holds the
//      graph and nothing else, so no lock or temporary save file was left.
//
// `cleanStop` is in the table, not read from the image's `STOPSIGNAL`: the
// regression worth catching is that line being dropped, which would also drop
// a check derived from it. The other five images do not stop on their own
// today (#5611), so nothing is asserted of them.
//
// Which images it builds is decided from the files changed since the base,
// as the interface diff decides which servers to diff: a server's own
// directory, the root files its image copies, a change to the packages it
// resolves in the root lockfile, or a change to this tooling (every image).
// The root `package.json` is copied into the TypeScript images too, but it is
// left out of the selection: almost every tooling change edits it (a new npm
// script), and the part of it an image depends on, `overrides`, reaches the
// image only through the lockfile, which is read. CI's `changes` job asks
// this script for the list (`--list`) and fans out one leg per image
// (`--server`); the gate runs it bare. Both go through the same selection.
//
// A change that touches no image builds nothing and needs no Docker. One that
// does needs a running Docker daemon, in the gate as in CI, and fails without
// one rather than skipping: a skipped check that prints a line nobody reads is
// how the gap this closes went unnoticed. A build with a cold layer cache
// also needs the network (base images, `npm ci`, `uv sync`, `apt-get`).
//
// The MCP client is imported only when an image is booted, so `--list` runs
// before any `npm ci`, as the interface diff's does.
//
// Usage:
//   npm run image-smoke                      # base: merge-base with origin/v2/main
//   npm run image-smoke -- --base <ref>      # any commit, tag or branch
//   npm run image-smoke -- --server <name>   # this image, changed or not (repeatable)
//   npm run image-smoke -- --all             # every image, changed or not
//   npm run image-smoke -- --list            # print the selected images as JSON; build nothing

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { changesSince, resolveBase } from "./interface-diff.mjs";
import { lockfileClosure } from "./lib/interface-diff-servers.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** How long one MCP request may take, container start included. */
export const REQUEST_TIMEOUT_MS = 120_000;

/** The grace period `docker stop` gives a container: Docker's own default. */
export const STOP_TIMEOUT_SECONDS = 10;

/** What a container exits with when Docker had to SIGKILL it (128 + 9). */
export const KILLED_EXIT_CODE = 137;

/**
 * Every server's image: how it is run for the boot, and what proves it is up.
 *
 * `args` are the server's arguments, after the image name. `env` is set with
 * `docker run -e`. `tool` must be in `tools/list`. `cleanStop` says
 * `docker stop` must end the container without killing it. `write` is a tool
 * call made before the stop, and `leaves` the directory inside the container
 * that must then hold exactly those files.
 *
 * Listed by hand, because the tool to look for is a fact about each server.
 * `findUnlistedImages` keeps the list complete: a `src/<server>/Dockerfile`
 * with no entry here fails the script tests.
 */
export const IMAGES = [
  { name: "everything", language: "ts", tool: "echo", cleanStop: true },
  {
    name: "filesystem",
    language: "ts",
    // It refuses to start without an allowed directory; the image has /tmp.
    args: ["/tmp"],
    tool: "list_allowed_directories",
  },
  {
    name: "memory",
    language: "ts",
    // /data is the directory the image prepares for a graph kept outside
    // dist; nothing is mounted over it, so the graph dies with the container.
    env: { MEMORY_FILE_PATH: "/data/memory.jsonl" },
    tool: "read_graph",
    cleanStop: true,
    write: {
      name: "create_entities",
      arguments: {
        entities: [
          { name: "image-smoke", entityType: "probe", observations: ["up"] },
        ],
      },
    },
    leaves: { dir: "/data", files: ["memory.jsonl"] },
  },
  { name: "sequentialthinking", language: "ts", tool: "sequentialthinking" },
  { name: "fetch", language: "py", tool: "fetch" },
  { name: "git", language: "py", tool: "git_status" },
  { name: "time", language: "py", tool: "get_current_time" },
];

/** Files whose change selects every image: this tooling itself. */
export const TOOLING_PATHS = [
  "scripts/image-smoke.mjs",
  ".github/workflows/image-smoke.yml",
];

/** Root files every TypeScript image copies, besides the manifests. */
export const TS_WIDE_PATHS = [".npmrc", "tsconfig.json"];

/**
 * The server directories under `srcDir` that hold a `Dockerfile` and that
 * `IMAGES` does not list.
 *
 * @param {string} srcDir
 * @param {{ name: string }[]} [images]
 * @returns {string[]}
 */
export function findUnlistedImages(srcDir, images = IMAGES) {
  const listed = new Set(images.map((i) => i.name));
  return readdirSync(srcDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(srcDir, entry.name, "Dockerfile")),
    )
    .map((entry) => entry.name)
    .filter((name) => !listed.has(name))
    .sort();
}

/**
 * Parse the command line.
 *
 * @param {string[]} argv
 * @returns {{ base: string | null, servers: string[], all: boolean,
 *   list: boolean }}
 */
export function parseArgs(argv) {
  const opts = { base: null, servers: [], all: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--") ? arg.split(/=(.*)/s) : [arg];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v === "") throw new Error(`${flag} needs a value`);
      return v;
    };
    const bare = () => {
      if (inline !== undefined) throw new Error(`${flag} takes no value`);
      return true;
    };
    if (flag === "--base") opts.base = value();
    else if (flag === "--server") opts.servers.push(value());
    else if (flag === "--all") opts.all = bare();
    else if (flag === "--list") opts.list = bare();
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (opts.all && opts.servers.length > 0)
    throw new Error("--all and --server cannot be combined");
  const known = new Set(IMAGES.map((i) => i.name));
  const unknown = opts.servers.filter((s) => !known.has(s));
  // A typo must not read as "nothing to build, so it passed".
  if (unknown.length > 0)
    throw new Error(
      `unknown server(s): ${unknown.join(", ")}. Known: ${[...known].join(", ")}.`,
    );
  return opts;
}

/** Whether two lockfile closures lock different packages. */
function closuresDiffer(a, b) {
  if (a.size !== b.size) return true;
  for (const [location, print] of a) if (b.get(location) !== print) return true;
  return false;
}

/**
 * The images a change can have broken, in `IMAGES` order, each with the
 * reason it was selected.
 *
 * @param {{ changedFiles: string[], baseLock: object | null,
 *   headLock: object | null, images?: typeof IMAGES }} input
 *   `changedFiles` are repository-relative, `/`-separated paths.
 * @returns {{ server: string, language: string, reason: string }[]}
 */
export function selectImages({
  changedFiles,
  baseLock,
  headLock,
  images = IMAGES,
}) {
  const changed = new Set(changedFiles);
  const tooling = TOOLING_PATHS.find((p) => changed.has(p));
  const selected = [];
  for (const { name, language } of images) {
    const dir = `src/${name}/`;
    const own = changedFiles.filter((f) => f.startsWith(dir));
    let reason = tooling ? `\`${tooling}\` (the image tooling) changed` : null;
    if (!reason && own.length > 0)
      reason =
        own.length === 1
          ? `\`${own[0]}\` changed`
          : `${own.length} files under \`${dir}\` changed`;
    if (!reason && language === "ts") {
      const wide = TS_WIDE_PATHS.find((p) => changed.has(p));
      if (wide)
        reason = `\`${wide}\`, which every TypeScript image copies, changed`;
      else if (
        changed.has("package-lock.json") &&
        closuresDiffer(
          lockfileClosure(baseLock, `src/${name}`),
          lockfileClosure(headLock, `src/${name}`),
        )
      )
        reason = "`package-lock.json` changes a package it installs";
    }
    if (reason) selected.push({ server: name, language, reason });
  }
  return selected;
}

/**
 * The images a run covers, each with the reason: every one (`--all`), the
 * named ones (`--server`), or else the ones the change touches.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {() => Parameters<typeof selectImages>[0]} changes read lazily, so
 *   naming the images needs no git history
 * @returns {{ server: string, language: string, reason: string }[]}
 */
export function chooseImages(opts, changes) {
  const named = (reason, keep) =>
    IMAGES.filter(keep).map(({ name, language }) => ({
      server: name,
      language,
      reason,
    }));
  if (opts.all) return named("every image was asked for (`--all`)", () => true);
  if (opts.servers.length > 0)
    return named("it was named (`--server`)", (i) =>
      opts.servers.includes(i.name),
    );
  return selectImages(changes());
}

/**
 * The tag an image is built under. One per server, reused by every run, so
 * the images do not pile up and one can be run by hand afterwards. A run never
 * boots by this tag: another checkout's run can move it between this run's
 * build and its boot, and the boot would then pass on that checkout's image.
 * The boot uses the image ID the build wrote (`--iidfile`).
 */
export function imageTag(name) {
  return `mcp-image-smoke/${name}:local`;
}

/**
 * How an image is built: `docker`'s arguments and the directory to run it in.
 * These are the commands each Dockerfile and README give.
 *
 * @param {(typeof IMAGES)[number]} image
 * @param {string} [root]
 * @returns {{ args: string[], cwd: string }}
 */
export function buildCommand(image, root = repoRoot) {
  const tag = imageTag(image.name);
  return image.language === "ts"
    ? {
        args: ["build", "-f", `src/${image.name}/Dockerfile`, "-t", tag, "."],
        cwd: root,
      }
    : {
        args: ["build", "-t", tag, "."],
        cwd: path.join(root, "src", image.name),
      };
}

/**
 * `docker`'s arguments for the boot: `run -i`, as a client configuration has
 * it, under a name so the container can be stopped and inspected afterwards
 * (hence no `--rm`; the check removes it).
 *
 * @param {(typeof IMAGES)[number]} image
 * @param {string} container
 * @param {string} [ref] the image to run: the ID this run built
 * @returns {string[]}
 */
export function runArgs(image, container, ref = imageTag(image.name)) {
  return [
    "run",
    "-i",
    "--name",
    container,
    ...Object.entries(image.env ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    ref,
    ...(image.args ?? []),
  ];
}

/**
 * Why a stopped container's exit code fails the clean-stop check, or `null`
 * when it passes. Any code but Docker's kill is the server's own exit: 0, or
 * 128 plus the signal it handled.
 *
 * @param {number} exitCode
 * @returns {string | null}
 */
export function judgeStop(exitCode) {
  if (!Number.isInteger(exitCode))
    return "its exit code could not be read after `docker stop`";
  return exitCode === KILLED_EXIT_CODE
    ? `\`docker stop\` had to kill it after ${STOP_TIMEOUT_SECONDS}s (exit ${KILLED_EXIT_CODE}): the server did not exit on the image's stop signal, so it ran none of its cleanup. Check the Dockerfile's STOPSIGNAL and the server's signal handlers.`
    : null;
}

/**
 * Why the files a stopped container left fail the check, or `null`.
 *
 * @param {string[]} found
 * @param {{ dir: string, files: string[] }} leaves
 * @returns {string | null}
 */
export function judgeLeftovers(found, leaves) {
  const want = [...leaves.files].sort();
  const got = [...found].sort();
  return got.length === want.length && got.every((f, i) => f === want[i])
    ? null
    : `${leaves.dir} holds [${got.join(", ")}] after the stop, not exactly [${want.join(", ")}]: a write was lost, or a lock or temporary file was left behind.`;
}

const tail = (text) =>
  (text ?? "").trim().split("\n").slice(-25).join("\n").trim();

/** Run `docker` to completion and hand back what happened; never throws. */
function docker(args, cwd = repoRoot) {
  const res = spawnSync("docker", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: res.error ? null : res.status,
    stdout: res.stdout ?? "",
    stderr: res.error ? String(res.error.message) : (res.stderr ?? ""),
  };
}

/** This process's environment, as the string map the transport takes. */
export function inheritedEnv(base = process.env) {
  return Object.fromEntries(
    Object.entries(base).filter(([, value]) => typeof value === "string"),
  );
}

/** The signals that interrupt a run, and what a process they end exits with. */
export const INTERRUPT_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };

/**
 * Connect an MCP client to a container started with `dockerArgs`.
 *
 * @param {string[]} dockerArgs
 * @returns {Promise<{ listTools: () => Promise<string[]>,
 *   callTool: (call: object) => Promise<{ isError: boolean, text: string }>,
 *   stderr: () => string, close: () => Promise<void> }>}
 */
async function connect(dockerArgs) {
  const { Client } = await import("@modelcontextprotocol/client");
  const { StdioClientTransport } =
    await import("@modelcontextprotocol/client/stdio");
  const options = { timeout: REQUEST_TIMEOUT_MS };
  const client = new Client({ name: "image-smoke", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: "docker",
    args: dockerArgs,
    // The transport's default environment is a short allowlist that leaves
    // out DOCKER_HOST, DOCKER_CONTEXT and the TLS settings, so `docker run`
    // would reach a different daemon from the one `docker()` built on.
    env: inheritedEnv(),
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => (stderr += chunk));
  const session = {
    listTools: async () =>
      (await client.listTools(undefined, options)).tools.map((t) => t.name),
    callTool: async (call) => {
      const result = await client.callTool(call, options);
      return {
        isError: result.isError === true,
        text: (result.content ?? [])
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n"),
      };
    },
    stderr: () => stderr,
    close: () => client.close().catch(() => {}),
  };
  try {
    await client.connect(transport, options);
  } catch (err) {
    await session.close();
    throw new Error(
      `${err?.message ?? err}${tail(stderr) ? `\n--- container stderr ---\n${tail(stderr)}` : ""}`,
      { cause: err },
    );
  }
  return session;
}

/**
 * Build, boot and stop one image. Resolves when it passes; rejects with the
 * reason when it does not. Always removes the container it started.
 *
 * @param {(typeof IMAGES)[number]} image
 * @param {{ docker?: typeof docker, connect?: typeof connect,
 *   log?: (line: string) => void, root?: string,
 *   proc?: Pick<NodeJS.Process, "once" | "off" | "exit"> }} [deps] replaced
 *   in tests
 */
export async function checkImage(image, deps = {}) {
  const run = deps.docker ?? docker;
  const open = deps.connect ?? connect;
  const log = deps.log ?? console.log;
  const proc = deps.proc ?? process;

  const build = buildCommand(image, deps.root);
  const scratch = mkdtempSync(path.join(tmpdir(), "mcp-image-smoke-"));
  const iidFile = path.join(scratch, "image-id");
  let imageId;
  try {
    // The context (`.`) stays last; the ID file is how the boot below runs
    // exactly what this build produced, whatever the shared tag points at.
    const built = run(
      [...build.args.slice(0, -1), "--iidfile", iidFile, "."],
      build.cwd,
    );
    if (built.status !== 0)
      throw new Error(
        `\`docker ${build.args.join(" ")}\` failed (${built.status ?? "could not run"}):\n${tail(built.stderr) || tail(built.stdout)}`,
      );
    imageId = existsSync(iidFile) ? readFileSync(iidFile, "utf8").trim() : "";
    if (!imageId)
      throw new Error(
        `\`docker ${build.args.join(" ")}\` succeeded but wrote no image ID, so there is nothing to boot.`,
      );
  } catch (err) {
    rmSync(scratch, { recursive: true, force: true });
    throw err;
  }
  log(
    `image-smoke —   built ${imageTag(image.name)} (${imageId.replace(/^sha256:/, "").slice(0, 12)})`,
  );

  const container = `mcp-image-smoke-${image.name}-${process.pid}-${Date.now()}`;
  let session;
  // An interrupt (Ctrl-C, a cancelled gate) ends the process without running
  // the `finally` below, and the container has no `--rm`, so it would be left
  // behind, still running where the image ignores the signal `docker run`
  // forwards. Remove it first, then exit as the signal would have.
  const interrupts = Object.entries(INTERRUPT_EXIT_CODES).map(
    ([signal, code]) => [
      signal,
      () => {
        run(["rm", "-f", container]);
        proc.exit(code);
      },
    ],
  );
  for (const [signal, handler] of interrupts) proc.once(signal, handler);
  try {
    session = await open(runArgs(image, container, imageId));
    try {
      const tools = await session.listTools();
      if (!tools.includes(image.tool))
        throw new Error(
          `tools/list does not include \`${image.tool}\` (got: ${tools.join(", ")})`,
        );
      if (image.write) {
        const result = await session.callTool(image.write);
        if (result.isError)
          throw new Error(
            `\`${image.write.name}\` returned an error result: ${result.text}`,
          );
      }
    } catch (err) {
      const stderr = tail(session.stderr());
      throw new Error(
        `${err?.message ?? err}${stderr ? `\n--- container stderr ---\n${stderr}` : ""}`,
        { cause: err },
      );
    }
    log(`image-smoke —   booted; tools/list has \`${image.tool}\``);

    if (image.cleanStop) {
      const stopped = run([
        "stop",
        "-t",
        String(STOP_TIMEOUT_SECONDS),
        container,
      ]);
      if (stopped.status !== 0)
        throw new Error(`\`docker stop\` failed:\n${tail(stopped.stderr)}`);
      const inspected = run([
        "inspect",
        "-f",
        "{{.State.ExitCode}}",
        container,
      ]);
      const exitCode =
        inspected.status === 0 ? Number(inspected.stdout.trim()) : NaN;
      const verdict = judgeStop(exitCode);
      if (verdict) throw new Error(verdict);
      log(`image-smoke —   stopped on its own (exit ${exitCode})`);
    }

    if (image.leaves) {
      const left = path.join(scratch, "left");
      mkdirSync(left);
      // `docker cp` reads a stopped container's filesystem; `/.` copies the
      // directory's contents rather than the directory.
      const copied = run(["cp", `${container}:${image.leaves.dir}/.`, left]);
      if (copied.status !== 0)
        throw new Error(
          `could not read ${image.leaves.dir} from the stopped container:\n${tail(copied.stderr)}`,
        );
      const verdict = judgeLeftovers(readdirSync(left), image.leaves);
      if (verdict) throw new Error(verdict);
      log(
        `image-smoke —   ${image.leaves.dir} holds only ${image.leaves.files.join(", ")}`,
      );
    }
  } finally {
    await session?.close();
    run(["rm", "-f", container]);
    for (const [signal, handler] of interrupts) proc.off(signal, handler);
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * @param {string[]} [argv]
 * @param {{ changes?: () => Parameters<typeof selectImages>[0],
 *   docker?: typeof docker, check?: typeof checkImage }} [deps] replaced in
 *   tests
 * @returns {Promise<number>} the exit code
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`image-smoke — ${err.message}`);
    return 2;
  }

  let selected;
  try {
    selected = chooseImages(
      opts,
      deps.changes ?? (() => changesSince(resolveBase(opts.base))),
    );
  } catch (err) {
    console.error(`image-smoke — ${err.message}`);
    return 1;
  }
  for (const s of selected)
    console.error(`image-smoke — ${s.server}: selected because ${s.reason}`);

  if (opts.list) {
    console.log(
      JSON.stringify(
        selected.map(({ server, language }) => ({ server, language })),
      ),
    );
    return 0;
  }
  if (selected.length === 0) {
    console.log(
      "image-smoke — the change touches no server's image; nothing to build.",
    );
    return 0;
  }

  const run = deps.docker ?? docker;
  const daemon = run(["version", "--format", "{{.Server.Version}}"]);
  if (daemon.status !== 0) {
    console.error(
      `image-smoke — FAIL  no Docker daemon answered (\`docker version\`: ${tail(daemon.stderr) || "no output"}).\n` +
        `The change touches ${selected.map((s) => s.server).join(", ")}, so ${selected.length === 1 ? "its image has" : "their images have"} to build and boot before it is pushed. Start Docker and run \`npm run image-smoke\` again.`,
    );
    return 1;
  }

  const check = deps.check ?? checkImage;
  const failures = [];
  for (const { server } of selected) {
    const image = IMAGES.find((i) => i.name === server);
    const started = Date.now();
    console.log(`image-smoke — ${server} …`);
    try {
      await check(image, { docker: deps.docker });
      console.log(`image-smoke — ok    ${server} (${Date.now() - started}ms)`);
    } catch (err) {
      failures.push(server);
      console.error(`image-smoke — FAIL  ${server}\n${err?.message ?? err}\n`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `image-smoke — ${failures.length} of ${selected.length} failed: ${failures.join(", ")}`,
    );
    return 1;
  }
  console.log(
    `image-smoke — OK (${selected.length} image${selected.length === 1 ? "" : "s"} built and booted)`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(await main());
