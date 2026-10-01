#!/usr/bin/env node
/**
 * The boot smoke: start each server the way a user's client does, over every
 * transport it implements, and ask it for one thing (#4871).
 *
 *   node scripts/smoke-servers.mjs            # every server
 *   node scripts/smoke-servers.mjs time git   # just the named ones
 *   npm run smoke                             # the root entry point (all)
 *
 * For each server and transport it connects an MCP client, lists the tools,
 * and calls one of them: stdio for all seven servers, plus HTTP+SSE and
 * Streamable HTTP for `everything`, the only server that serves them.
 *
 * Why it exists when every server has a test suite: the suites import the
 * source. Nothing in them runs the artifact a user actually launches, which is
 * the built `dist/index.js` behind the npm `bin` (TypeScript) or the console
 * script from `[project.scripts]` (Python). A wrong `bin` path, a file missing
 * from the build, a lost shebang, an import that only resolves under the test
 * runner, or a server that dies during the `initialize` handshake all pass the
 * unit tests and fail here. That is the whole of its job, so it is deliberately
 * thin: one tool per server, chosen to need nothing outside the machine.
 *
 * Why one Node script for both languages: the smoke is a client, and the
 * question it asks is the same whatever the server is written in. The Python
 * servers are launched through `uv run --no-sync`, never pip.
 *
 * `--no-sync` because the smoke tests an environment, it does not build one. A
 * plain `uv run` (even `--frozen`, which only stops the lockfile being
 * rewritten) creates the server's `.venv` and downloads into it when it is
 * missing or stale, which would make this stage a second, unannounced install
 * step. So each Python server must already be synced: `validate:py` does that
 * in the gate just before the smoke, and CI's smoke job has a sync step. A
 * server with no `.venv` is reported as that.
 *
 * The servers themselves are given nothing outside the machine to talk to, and
 * none of the user's files. `fetch` is pointed at an HTTP server this script
 * starts on the loopback interface; `git` and `filesystem` get a throwaway
 * directory; `memory` gets a throwaway graph file. The HTTP transports listen
 * on a port the OS reported free a moment earlier, not the server's default
 * 3001, so the smoke does not collide with a server the developer has running.
 * That port is not reserved between the probe and the server's own `listen`,
 * so a launch whose server reports the port taken is relaunched on a fresh
 * one. Both HTTP transports report it (`listenOrExit` in `everything`'s
 * `transports/listen.ts`).
 *
 * One server failing does not stop the rest: the run reports every target's
 * verdict and exits non-zero if any failed, so one run shows the whole picture.
 *
 * A TypeScript server must already be built (the gate builds before it smokes;
 * on its own, run `npm run build` first). A missing `dist/` is reported as
 * that, rather than as a server that failed to start.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import {
  connect as netConnect,
  createServer as createNetServer,
} from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** What the loopback page served to `fetch` contains, and what must come back. */
export const FETCH_MARKER = "boot-smoke-marker";

/**
 * How long one request may take, process start and the `initialize` handshake
 * included. Generous on purpose: a Python server imports its dependencies
 * before it can answer, and on a loaded machine or a cold disk cache that takes
 * seconds, not milliseconds. A boot smoke that flakes under load teaches people
 * to re-run it, which is the habit a gate must not create.
 */
export const REQUEST_TIMEOUT_MS = 120_000;

/** How many ports an HTTP launch may try before a taken port is the result. */
export const PORT_ATTEMPTS = 3;

/** Whether a server's output says it lost its port to another process. */
export function isPortTaken(output) {
  return /EADDRINUSE|already in use/i.test(output);
}

/** How long an HTTP server gets to start listening. */
export const LISTEN_TIMEOUT_MS = 30_000;

/**
 * Every server, the transports it implements, and the one tool call that
 * proves it is alive.
 *
 * `args(ctx)` are the server's command-line arguments and `env(ctx)` its extra
 * environment; `call(ctx)` is the tool call, and `expect` is a substring its
 * text result must contain (omitted where any non-error result will do).
 * `ctx` carries `dir` (a throwaway directory) and `pageUrl` (the loopback
 * page).
 *
 * Listed by hand rather than discovered, because the tool to call is a fact
 * about each server. `findUnlistedServers` is what keeps the list complete: a
 * new server directory with no entry here fails the script tests.
 */
export const SERVERS = [
  {
    name: "everything",
    language: "ts",
    transports: ["stdio", "sse", "streamableHttp"],
    call: () => ({ name: "echo", arguments: { message: "boot smoke" } }),
    expect: "boot smoke",
  },
  {
    name: "filesystem",
    language: "ts",
    transports: ["stdio"],
    args: (ctx) => [ctx.dir],
    call: () => ({ name: "list_allowed_directories", arguments: {} }),
    expect: (ctx) => path.basename(ctx.dir),
  },
  {
    name: "memory",
    language: "ts",
    transports: ["stdio"],
    env: (ctx) => ({ MEMORY_FILE_PATH: path.join(ctx.dir, "memory.jsonl") }),
    call: () => ({ name: "read_graph", arguments: {} }),
  },
  {
    name: "sequentialthinking",
    language: "ts",
    transports: ["stdio"],
    call: () => ({
      name: "sequentialthinking",
      arguments: {
        thought: "boot smoke",
        nextThoughtNeeded: false,
        thoughtNumber: 1,
        totalThoughts: 1,
      },
    }),
  },
  {
    name: "fetch",
    language: "py",
    transports: ["stdio"],
    // The loopback page must not be routed through a proxy the developer has
    // configured for real traffic.
    env: () => ({
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    }),
    call: (ctx) => ({ name: "fetch", arguments: { url: ctx.pageUrl } }),
    expect: FETCH_MARKER,
  },
  {
    name: "git",
    language: "py",
    transports: ["stdio"],
    args: (ctx) => ["--repository", ctx.dir],
    prepare: (ctx) => run("git", ["init", "--quiet", ctx.dir]),
    call: (ctx) => ({ name: "git_status", arguments: { repo_path: ctx.dir } }),
  },
  {
    name: "time",
    language: "py",
    transports: ["stdio"],
    args: () => ["--local-timezone", "UTC"],
    call: () => ({ name: "get_current_time", arguments: { timezone: "UTC" } }),
    expect: "UTC",
  },
];

/** The argument that selects a transport; only `everything` takes one. */
const TRANSPORT_ENDPOINT = { sse: "/sse", streamableHttp: "/mcp" };

/** Run a setup command to completion; throw with its output if it fails. */
function run(command, args) {
  const res = spawnSync(command, args, { encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0)
    throw new Error(
      `\`${command} ${args.join(" ")}\` exited ${res.status}: ${res.stderr.trim()}`,
    );
}

/**
 * The server directories under `srcDir` that `SERVERS` does not list: any
 * directory holding a `package.json` or a `pyproject.toml`.
 *
 * @param {string} srcDir
 * @param {{ name: string }[]} [servers]
 * @returns {string[]}
 */
export function findUnlistedServers(srcDir, servers = SERVERS) {
  const listed = new Set(servers.map((s) => s.name));
  return readdirSync(srcDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (existsSync(path.join(srcDir, entry.name, "package.json")) ||
          existsSync(path.join(srcDir, entry.name, "pyproject.toml"))),
    )
    .map((entry) => entry.name)
    .filter((name) => !listed.has(name))
    .sort();
}

/**
 * The (server, transport) pairs a run covers. With no names, every server;
 * otherwise only the named ones, in the table's order. An unknown name throws:
 * a typo must not read as "nothing to smoke, so it passed".
 *
 * @param {string[]} names
 * @param {typeof SERVERS} [servers]
 * @returns {{ server: (typeof SERVERS)[number], transport: string }[]}
 */
export function selectTargets(names, servers = SERVERS) {
  const known = new Set(servers.map((s) => s.name));
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length > 0)
    throw new Error(
      `unknown server(s): ${unknown.join(", ")}. Known: ${[...known].join(", ")}.`,
    );
  const wanted = names.length === 0 ? known : new Set(names);
  return servers
    .filter((s) => wanted.has(s.name))
    .flatMap((server) =>
      server.transports.map((transport) => ({ server, transport })),
    );
}

/**
 * How to launch a server: the command a client configuration would name.
 *
 * @param {(typeof SERVERS)[number]} server
 * @param {string} transport
 * @param {{ dir: string, pageUrl: string }} ctx
 * @param {string} [root]
 * @param {string} [platform]
 * @returns {{ command: string, args: string[], cwd: string, bin?: string }}
 */
export function launchSpec(
  server,
  transport,
  ctx,
  root = repoRoot,
  platform = process.platform,
) {
  const cwd = path.join(root, "src", server.name);
  const rest = serverArguments(server, transport, ctx);
  if (server.language === "ts") {
    const bin = path.join(cwd, "dist", "index.js");
    // The published `bin` is the file itself, run through its shebang, so that
    // is what is executed: `node dist/index.js` would still work with the
    // shebang or the executable bit lost, and the installed command would not.
    // Windows has neither (npm generates a `.cmd` shim that calls node), so
    // there the file is handed to node.
    return platform === "win32"
      ? { command: process.execPath, args: [bin, ...rest], cwd, bin }
      : { command: bin, args: rest, cwd, bin };
  }
  return {
    command: "uv",
    args: ["run", "--no-sync", `mcp-server-${server.name}`, ...rest],
    cwd,
  };
}

/**
 * The arguments a server is started with, whatever launches it: the transport
 * where the server takes one, then its own. Shared with `pack:verify`, which
 * starts the same servers from an installed package instead of the checkout.
 *
 * @param {(typeof SERVERS)[number]} server
 * @param {string} transport
 * @param {{ dir: string, pageUrl: string }} ctx
 * @returns {string[]}
 */
export function serverArguments(server, transport, ctx) {
  // `everything` picks its transport from its first argument; the others are
  // stdio-only and take none.
  const transportArg = server.transports.length > 1 ? [transport] : [];
  return [...transportArg, ...(server.args?.(ctx) ?? [])];
}

/** Text content of a tool result, joined. */
function textOf(result) {
  return (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** Throw unless the tool is listed and its call returns what is expected. */
async function exercise(client, server, ctx) {
  const options = { timeout: REQUEST_TIMEOUT_MS };
  const call = server.call(ctx);
  const { tools } = await client.listTools(undefined, options);
  if (!tools.some((t) => t.name === call.name))
    throw new Error(
      `tools/list does not include \`${call.name}\` (got: ${tools.map((t) => t.name).join(", ")})`,
    );
  const result = await client.callTool(call, undefined, options);
  const text = textOf(result);
  if (result.isError)
    throw new Error(`\`${call.name}\` returned an error result: ${text}`);
  const expect =
    typeof server.expect === "function" ? server.expect(ctx) : server.expect;
  if (expect !== undefined && !text.includes(expect))
    throw new Error(
      `\`${call.name}\` did not return "${expect}". It returned: ${text.slice(0, 400)}`,
    );
}

/**
 * A port the OS says is free right now. Probed on the wildcard address, the
 * way the servers bind it (`app.listen(PORT)`): a port held on one interface
 * only can be bound again on the wildcard without an error, and the client
 * would then reach the holder, not the server.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Resolve once something accepts connections on `port`, or the child dies. */
async function waitForListen(port, child, output) {
  const deadline = Date.now() + LISTEN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `the server exited (${child.exitCode ?? child.signalCode}) before listening: ${output()}`,
      );
    const open = await new Promise((resolve) => {
      const socket = netConnect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (open) return;
    await delay(100);
  }
  throw new Error(
    `nothing listened on port ${port} within ${LISTEN_TIMEOUT_MS}ms: ${output()}`,
  );
}

/** Stop a child and wait for it, escalating if it ignores SIGTERM. */
async function stop(child) {
  // A child that never started (ENOENT, EACCES on a bin that lost its
  // executable bit) emits `error` and never `exit`: waiting for one would hang
  // until the job's timeout instead of reporting the launch failure.
  if (child.pid === undefined) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const killer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(killer);
}

/** The environment a server is launched with: ours, plus its own extras. */
function envFor(server, ctx, extra = {}, base = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(base))
    if (typeof value === "string") env[key] = value;
  return { ...env, ...(server.env?.(ctx) ?? {}), ...extra };
}

/**
 * Smoke one server over one transport. Resolves when it passes; rejects with
 * the reason when it does not. Always stops what it started.
 *
 * `installed` replaces the checkout's launch command with another one
 * (`pack:verify` passes the bin of a package it installed from the publish
 * artifact). The checkout preconditions below are about the checkout, so they
 * are skipped for it.
 *
 * @param {(typeof SERVERS)[number]} server
 * @param {string} transport
 * @param {{ dir: string, pageUrl: string }} ctx
 * @param {{ command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv }} [installed]
 *   `env`, when given, replaces this process's environment as the base the
 *   server's own variables are added to
 */
export async function smokeOne(server, transport, ctx, installed) {
  const spec = installed ?? launchSpec(server, transport, ctx);
  if (!installed && server.language === "ts" && !existsSync(spec.bin))
    throw new Error(
      `${path.relative(repoRoot, spec.bin)} does not exist — build first (\`npm run build -w src/${server.name}\`).`,
    );
  if (
    !installed &&
    server.language === "py" &&
    !existsSync(path.join(spec.cwd, ".venv"))
  )
    throw new Error(
      `src/${server.name}/.venv does not exist — sync first (\`npm run validate:py -- ${server.name}\`, or \`uv sync --locked --all-extras --dev\` in src/${server.name}). The smoke does not create environments.`,
    );
  server.prepare?.(ctx);

  const client = new Client({ name: "boot-smoke", version: "0.0.0" });
  const options = { timeout: REQUEST_TIMEOUT_MS };

  if (transport === "stdio") {
    let stderr = "";
    const clientTransport = new StdioClientTransport({
      command: spec.command,
      args: spec.args,
      cwd: spec.cwd,
      env: envFor(server, ctx, {}, installed?.env),
      stderr: "pipe",
    });
    clientTransport.stderr?.on("data", (chunk) => (stderr += chunk));
    try {
      await client.connect(clientTransport, options);
      await exercise(client, server, ctx);
    } catch (err) {
      const tail = stderr.trim().split("\n").slice(-15).join("\n");
      throw new Error(
        `${err?.message ?? err}${tail ? `\n--- server stderr ---\n${tail}` : ""}`,
        { cause: err },
      );
    } finally {
      await client.close().catch(() => {});
    }
    return;
  }

  // The probe port is free when probed, not reserved: another process can take
  // it before the server binds. Only that one failure is relaunched, on a fresh
  // port; anything else the server says on its way down is the result. The
  // check sits in the outer catch because the loss can surface at either step:
  // the listen probe can reach the OTHER process on that port before our child
  // has exited, and then it is the MCP connection that fails.
  for (let attempt = 1; ; attempt += 1) {
    const httpClient = new Client({ name: "boot-smoke", version: "0.0.0" });
    const port = await freePort();
    let output = "";
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: envFor(server, ctx, { PORT: String(port) }, installed?.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const tail = () => output.trim().split("\n").slice(-15).join("\n");
    try {
      await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("spawn", resolve);
      });
      await waitForListen(port, child, tail);
      const url = new URL(
        `http://127.0.0.1:${port}${TRANSPORT_ENDPOINT[transport]}`,
      );
      const clientTransport =
        transport === "sse"
          ? new SSEClientTransport(url)
          : new StreamableHTTPClientTransport(url);
      try {
        await httpClient.connect(clientTransport, options);
        await exercise(httpClient, server, ctx);
      } finally {
        await httpClient.close().catch(() => {});
      }
      return;
    } catch (err) {
      // Give a child that is on its way down a moment to say why.
      if (child.exitCode === null && child.signalCode === null)
        await delay(200);
      if (attempt < PORT_ATTEMPTS && isPortTaken(output)) continue;
      throw new Error(
        `${err?.message ?? err}${tail() ? `\n--- server output ---\n${tail()}` : ""}`,
        { cause: err },
      );
    } finally {
      await stop(child);
    }
  }
}

/** The loopback page `fetch` is pointed at, with a permissive robots.txt. */
export function startPage() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\n");
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<html><head><title>smoke</title></head><body><p>${FETCH_MARKER}</p></body></html>`,
      );
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise((done) => server.close(done)),
      }),
    );
  });
}

/**
 * @param {string[]} [argv] server names; none means every server
 * @returns {Promise<number>} the exit code
 */
export async function main(argv = process.argv.slice(2)) {
  let targets;
  try {
    targets = selectTargets(argv);
  } catch (err) {
    console.error(`smoke — ${err.message}`);
    return 2;
  }

  const page = await startPage();
  const failures = [];
  try {
    for (const { server, transport } of targets) {
      const label = `${server.name} over ${transport}`;
      const dir = mkdtempSync(path.join(tmpdir(), `mcp-smoke-${server.name}-`));
      const started = Date.now();
      try {
        await smokeOne(server, transport, { dir, pageUrl: page.url });
        console.log(`smoke — ok    ${label} (${Date.now() - started}ms)`);
      } catch (err) {
        failures.push(label);
        console.error(`smoke — FAIL  ${label}\n${err?.message ?? err}\n`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await page.close();
  }

  if (failures.length > 0) {
    console.error(
      `smoke — ${failures.length} of ${targets.length} failed: ${failures.join("; ")}`,
    );
    return 1;
  }
  console.log(`smoke — OK (${targets.length} server/transport pairs booted)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(await main());
