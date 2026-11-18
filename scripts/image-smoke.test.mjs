// Tests for the image smoke (#5598). Building and booting the images is what
// `npm run image-smoke` itself does, as a gate stage and in CI, so it is not
// repeated here. What is pinned is what a green run could otherwise hide: a
// Dockerfile missing from the table, a change that selects no image when it
// should, a typo'd name passing as "nothing to build", the build and run
// commands drifting from the documented ones, a killed container read as a
// clean stop, and a missing Docker daemon read as a pass. `checkImage` and
// `main` are driven with a fake `docker` and a fake MCP session.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMAGES,
  KILLED_EXIT_CODE,
  TOOLING_PATHS,
  buildCommand,
  checkImage,
  chooseImages,
  findUnlistedImages,
  imageTag,
  judgeLeftovers,
  judgeStop,
  main,
  parseArgs,
  runArgs,
  selectImages,
} from "./image-smoke.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const byName = (name) => IMAGES.find((i) => i.name === name);
const names = (selected) => selected.map((s) => s.server);
const noLocks = { baseLock: null, headLock: null };

/** Run `fn` with the console silenced, handing back what it printed. */
async function quietly(t, fn) {
  const lines = [];
  for (const method of ["log", "error"])
    t.mock.method(console, method, (line) => lines.push(String(line)));
  const result = await fn();
  return { result, output: lines.join("\n") };
}

test("every Dockerfile in the repo has an image entry", () => {
  assert.deepEqual(findUnlistedImages(path.join(repoRoot, "src")), []);
  assert.equal(IMAGES.length, 7);
});

test("findUnlistedImages names a Dockerfile the table lacks", (t) => {
  const src = mkdtempSync(path.join(tmpdir(), "image-smoke-src-"));
  t.after(() => rmSync(src, { recursive: true, force: true }));
  for (const [dir, file] of [
    ["time", "Dockerfile"],
    ["newserver", "Dockerfile"],
    ["nodocker", "package.json"],
  ]) {
    mkdirSync(path.join(src, dir));
    writeFileSync(path.join(src, dir, file), "");
  }
  assert.deepEqual(findUnlistedImages(src), ["newserver"]);
});

test("an image that declares a stop signal is checked for a clean stop", () => {
  // The table, not the Dockerfile, decides what is asserted, so a deleted
  // STOPSIGNAL cannot delete the check with it. This pins the other
  // direction: an image that gains a STOPSIGNAL gains the check in the same
  // change. Today that is `everything` and `memory`; the rest are #5611.
  const declared = IMAGES.filter((image) =>
    /^STOPSIGNAL\s/m.test(
      readFileSync(
        path.join(repoRoot, "src", image.name, "Dockerfile"),
        "utf8",
      ),
    ),
  ).map((image) => image.name);
  assert.deepEqual(declared, ["everything", "memory"]);
  for (const name of declared) assert.equal(byName(name).cleanStop, true, name);
});

test("parseArgs reads every flag, in either spelling", () => {
  const defaults = { base: null, servers: [], all: false, list: false };
  assert.deepEqual(parseArgs([]), defaults);
  assert.deepEqual(parseArgs(["--base", "abc", "--list"]), {
    ...defaults,
    base: "abc",
    list: true,
  });
  assert.deepEqual(parseArgs(["--server", "git", "--server=time"]), {
    ...defaults,
    servers: ["git", "time"],
  });
  assert.deepEqual(parseArgs(["--all"]), { ...defaults, all: true });
});

test("parseArgs refuses an unknown flag or server, or a missing value", () => {
  assert.throws(() => parseArgs(["--push"]), /unknown argument/);
  assert.throws(() => parseArgs(["--base"]), /--base needs a value/);
  assert.throws(() => parseArgs(["--all=yes"]), /--all takes no value/);
  assert.throws(() => parseArgs(["--all", "--server", "git"]), /combined/);
  // A typo must not read as "nothing to build".
  assert.throws(() => parseArgs(["--server", "tyme"]), /unknown server/);
});

test("a change under a server's directory selects that image only", () => {
  const selected = selectImages({
    changedFiles: ["src/memory/Dockerfile", "README.md"],
    ...noLocks,
  });
  assert.deepEqual(names(selected), ["memory"]);
  assert.match(selected[0].reason, /src\/memory\/Dockerfile/);
  assert.match(
    selectImages({
      changedFiles: ["src/git/a.py", "src/git/b.py"],
      ...noLocks,
    })[0].reason,
    /2 files under `src\/git\/`/,
  );
});

test("a change that touches no image selects none", () => {
  assert.deepEqual(
    selectImages({
      changedFiles: ["AGENTS.md", "package.json", "scripts/smoke-servers.mjs"],
      ...noLocks,
    }),
    [],
  );
});

test("a root file the TypeScript images copy selects the four of them", () => {
  for (const file of [".npmrc", "tsconfig.json"])
    assert.deepEqual(
      names(selectImages({ changedFiles: [file], ...noLocks })),
      ["everything", "filesystem", "memory", "sequentialthinking"],
      file,
    );
});

test("the tooling's own files select every image", () => {
  for (const file of TOOLING_PATHS) {
    assert.ok(existsOnDisk(file), `${file} must exist`);
    const selected = selectImages({ changedFiles: [file], ...noLocks });
    assert.equal(selected.length, IMAGES.length, file);
    assert.match(selected[0].reason, /image tooling/);
  }
});

function existsOnDisk(file) {
  try {
    readFileSync(path.join(repoRoot, file));
    return true;
  } catch {
    return false;
  }
}

test("a lockfile change selects only the images that install the changed package", () => {
  const lock = (zodVersion) => ({
    packages: {
      "": { workspaces: ["src/*"] },
      "src/memory": { dependencies: { zod: "^4" } },
      "src/filesystem": { dependencies: { minimatch: "^11" } },
      "node_modules/zod": { version: zodVersion },
      "node_modules/minimatch": { version: "11.0.1" },
    },
  });
  const changedFiles = ["package-lock.json"];
  assert.deepEqual(
    names(
      selectImages({
        changedFiles,
        baseLock: lock("4.0.0"),
        headLock: lock("4.0.1"),
      }),
    ),
    ["memory"],
  );
  // A rewrite that reaches no server's packages selects nothing.
  assert.deepEqual(
    selectImages({
      changedFiles,
      baseLock: lock("4.0.0"),
      headLock: lock("4.0.0"),
    }),
    [],
  );
});

test("chooseImages: --all, --server, or the change, read only when needed", () => {
  const never = () => assert.fail("the change must not be read");
  assert.equal(chooseImages(parseArgs(["--all"]), never).length, IMAGES.length);
  assert.deepEqual(
    names(chooseImages(parseArgs(["--server", "time"]), never)),
    ["time"],
  );
  assert.deepEqual(
    names(
      chooseImages(parseArgs([]), () => ({
        changedFiles: ["src/fetch/uv.lock"],
        ...noLocks,
      })),
    ),
    ["fetch"],
  );
});

test("an image builds with the command its Dockerfile documents", () => {
  // TypeScript: the repository root is the context. Python: the server's
  // directory is.
  assert.deepEqual(buildCommand(byName("memory"), "/repo"), {
    args: [
      "build",
      "-f",
      "src/memory/Dockerfile",
      "-t",
      "mcp-image-smoke/memory:local",
      ".",
    ],
    cwd: "/repo",
  });
  assert.deepEqual(buildCommand(byName("git"), "/repo"), {
    args: ["build", "-t", "mcp-image-smoke/git:local", "."],
    cwd: path.join("/repo", "src", "git"),
  });
  for (const image of IMAGES) {
    const dockerfile = readFileSync(
      path.join(repoRoot, "src", image.name, "Dockerfile"),
      "utf8",
    );
    // The TypeScript Dockerfiles say so themselves; keep the table honest.
    assert.equal(
      dockerfile.includes(`-f src/${image.name}/Dockerfile`),
      image.language === "ts",
      image.name,
    );
  }
});

test("an image is run the way a client runs it: `docker run -i`, stdio", () => {
  assert.deepEqual(runArgs(byName("filesystem"), "c1"), [
    "run",
    "-i",
    "--name",
    "c1",
    "mcp-image-smoke/filesystem:local",
    "/tmp",
  ]);
  assert.deepEqual(runArgs(byName("memory"), "c2"), [
    "run",
    "-i",
    "--name",
    "c2",
    "-e",
    "MEMORY_FILE_PATH=/data/memory.jsonl",
    "mcp-image-smoke/memory:local",
  ]);
});

test("judgeStop fails only a container Docker killed, or one it cannot read", () => {
  assert.equal(judgeStop(0), null);
  assert.equal(judgeStop(130), null);
  assert.equal(judgeStop(143), null);
  assert.match(judgeStop(KILLED_EXIT_CODE), /had to kill it/);
  assert.match(judgeStop(NaN), /could not be read/);
});

test("judgeLeftovers wants exactly the files named", () => {
  const leaves = { dir: "/data", files: ["memory.jsonl"] };
  assert.equal(judgeLeftovers(["memory.jsonl"], leaves), null);
  assert.match(
    judgeLeftovers(["memory.jsonl", "memory.jsonl.lock"], leaves),
    /memory\.jsonl\.lock/,
  );
  assert.match(judgeLeftovers([], leaves), /a write was lost/);
});

/**
 * A fake `docker` that records each call and answers from `answers`, keyed by
 * the subcommand; anything unlisted succeeds with no output. `cp` writes
 * `files` into its destination, as the real one copies a directory out.
 */
function fakeDocker(answers = {}, files = ["memory.jsonl"]) {
  const calls = [];
  const docker = (args, cwd) => {
    calls.push({ args, cwd });
    if (args[0] === "cp" && answers.cp === undefined)
      for (const file of files) writeFileSync(path.join(args[2], file), "");
    return { status: 0, stdout: "", stderr: "", ...answers[args[0]] };
  };
  return { docker, calls, ran: () => calls.map((c) => c.args[0]) };
}

/** A fake MCP session over a container. */
function fakeSession({ tools, isError = false } = {}) {
  const state = { closed: 0, called: [] };
  const connect = async () => ({
    listTools: async () => tools,
    callTool: async (call) => {
      state.called.push(call.name);
      return { isError, text: "refused" };
    },
    stderr: () => "server stderr line",
    close: async () => void (state.closed += 1),
  });
  return { connect, state };
}

const quiet = { log: () => {} };

test("checkImage builds, boots, stops and reads back memory's directory", async () => {
  const { docker, calls, ran } = fakeDocker({
    inspect: { stdout: "130\n" },
  });
  const { connect, state } = fakeSession({ tools: ["read_graph"] });
  await checkImage(byName("memory"), {
    docker,
    connect,
    root: "/repo",
    ...quiet,
  });
  assert.deepEqual(ran(), ["build", "stop", "inspect", "cp", "rm"]);
  assert.equal(calls[0].cwd, "/repo");
  const container = calls[1].args.at(-1);
  assert.match(container, /^mcp-image-smoke-memory-/);
  assert.match(calls[3].args[1], /:\/data\/\.$/);
  assert.deepEqual(calls[4].args, ["rm", "-f", container]);
  assert.deepEqual(state.called, ["create_entities"]);
  assert.equal(state.closed, 1);
});

test("checkImage does not stop-check an image the table does not say stops", async () => {
  const { docker, ran } = fakeDocker();
  const { connect } = fakeSession({ tools: ["get_current_time"] });
  await checkImage(byName("time"), { docker, connect, ...quiet });
  assert.deepEqual(ran(), ["build", "rm"]);
});

test("checkImage fails an image that does not build, and starts nothing", async () => {
  const { docker, ran } = fakeDocker({
    build: { status: 1, stderr: "ERROR: failed to solve" },
  });
  const { connect, state } = fakeSession({ tools: [] });
  await assert.rejects(
    checkImage(byName("git"), { docker, connect, ...quiet }),
    /docker build -t mcp-image-smoke\/git:local \.` failed \(1\):\nERROR: failed to solve/,
  );
  assert.deepEqual(ran(), ["build"]);
  assert.equal(state.closed, 0);
});

test("checkImage fails an image whose server does not list its tool, with its stderr", async () => {
  const { docker, ran } = fakeDocker();
  const { connect, state } = fakeSession({ tools: ["other"] });
  await assert.rejects(
    checkImage(byName("everything"), { docker, connect, ...quiet }),
    /tools\/list does not include `echo` \(got: other\)\n--- container stderr ---\nserver stderr line/,
  );
  // The container is removed and the session closed all the same.
  assert.deepEqual(ran(), ["build", "rm"]);
  assert.equal(state.closed, 1);
});

test("checkImage fails an image whose container never answers", async () => {
  const { docker, ran } = fakeDocker();
  const connect = async () => {
    throw new Error("Connection closed");
  };
  await assert.rejects(
    checkImage(byName("fetch"), { docker, connect, ...quiet }),
    /Connection closed/,
  );
  assert.deepEqual(ran(), ["build", "rm"]);
});

test("checkImage fails a write the server refuses", async () => {
  const { docker } = fakeDocker();
  const { connect } = fakeSession({ tools: ["read_graph"], isError: true });
  await assert.rejects(
    checkImage(byName("memory"), { docker, connect, ...quiet }),
    /`create_entities` returned an error result: refused/,
  );
});

test("checkImage fails a container Docker had to kill", async () => {
  const { docker, ran } = fakeDocker({
    inspect: { stdout: `${KILLED_EXIT_CODE}\n` },
  });
  const { connect } = fakeSession({ tools: ["echo"] });
  await assert.rejects(
    checkImage(byName("everything"), { docker, connect, ...quiet }),
    /had to kill it/,
  );
  assert.deepEqual(ran(), ["build", "stop", "inspect", "rm"]);
});

test("checkImage fails when the stop, the inspect or the copy cannot run", async () => {
  const { connect } = fakeSession({ tools: ["read_graph"] });
  for (const [answers, message] of [
    [
      { stop: { status: 1, stderr: "no such container" } },
      /docker stop` failed/,
    ],
    [{ inspect: { status: 1 } }, /exit code could not be read/],
    [
      { inspect: { stdout: "0" }, cp: { status: 1, stderr: "denied" } },
      /could not read \/data from the stopped container:\ndenied/,
    ],
  ])
    await assert.rejects(
      checkImage(byName("memory"), {
        docker: fakeDocker(answers).docker,
        connect,
        ...quiet,
      }),
      message,
    );
});

test("checkImage fails memory when a lock file outlives the stop", async () => {
  const { docker } = fakeDocker({ inspect: { stdout: "130" } }, [
    "memory.jsonl",
    "memory.jsonl.lock",
  ]);
  const { connect } = fakeSession({ tools: ["read_graph"] });
  await assert.rejects(
    checkImage(byName("memory"), { docker, connect, ...quiet }),
    /memory\.jsonl\.lock/,
  );
});

test("main: a bad argument exits 2", async (t) => {
  const { result, output } = await quietly(t, () => main(["--nope"]));
  assert.equal(result, 2);
  assert.match(output, /unknown argument/);
});

test("main: a change that cannot be read exits 1", async (t) => {
  const { result, output } = await quietly(t, () =>
    main([], {
      changes: () => {
        throw new Error("origin/v2/main is not available");
      },
    }),
  );
  assert.equal(result, 1);
  assert.match(output, /origin\/v2\/main is not available/);
});

test("main --list prints the selection as JSON and touches no Docker", async (t) => {
  const { docker, calls } = fakeDocker();
  const { result, output } = await quietly(t, () =>
    main(["--list"], {
      docker,
      changes: () => ({ changedFiles: ["src/time/Dockerfile"], ...noLocks }),
    }),
  );
  assert.equal(result, 0);
  assert.match(output, /\[\{"server":"time","language":"py"\}\]/);
  assert.equal(calls.length, 0);
});

test("main: a change that touches no image passes without Docker", async (t) => {
  const { docker, calls } = fakeDocker({ version: { status: 1 } });
  const { result, output } = await quietly(t, () =>
    main([], {
      docker,
      changes: () => ({ changedFiles: ["README.md"], ...noLocks }),
    }),
  );
  assert.equal(result, 0);
  assert.match(output, /nothing to build/);
  assert.equal(calls.length, 0);
});

test("main: a selected image with no Docker daemon fails; it is never skipped", async (t) => {
  const checked = [];
  const { result, output } = await quietly(t, () =>
    main(["--server", "git", "--server", "time"], {
      docker: fakeDocker({
        version: { status: 1, stderr: "Cannot connect to the Docker daemon" },
      }).docker,
      check: async (image) => void checked.push(image.name),
    }),
  );
  assert.equal(result, 1);
  assert.match(output, /no Docker daemon answered/);
  assert.match(output, /Cannot connect to the Docker daemon/);
  assert.match(output, /git, time, so their images have/);
  assert.deepEqual(checked, []);
});

test("main checks every selected image, and one failure does not stop the rest", async (t) => {
  const checked = [];
  const deps = (failing) => ({
    docker: fakeDocker().docker,
    check: async (image) => {
      checked.push(image.name);
      if (failing.includes(image.name)) throw new Error("did not build");
    },
  });
  const failed = await quietly(t, () => main(["--all"], deps(["memory"])));
  assert.equal(failed.result, 1);
  assert.equal(checked.length, IMAGES.length);
  assert.match(failed.output, /FAIL {2}memory\ndid not build/);
  assert.match(failed.output, /1 of 7 failed: memory/);

  const passed = await quietly(t, () => main(["--server", "time"], deps([])));
  assert.equal(passed.result, 0);
  assert.match(passed.output, /OK \(1 image built and booted\)/);
});

test("imageTag is one fixed tag per server", () => {
  assert.equal(imageTag("time"), "mcp-image-smoke/time:local");
});
