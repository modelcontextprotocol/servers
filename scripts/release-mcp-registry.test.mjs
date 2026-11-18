// Regression tests for `release.yml`'s `publish-mcp-registry` job (#3047).
//
// The job lists each server in the official MCP Registry after its package is
// published. It holds an OIDC credential and has no checkout, so, as with the
// dist-tag choice (release-dist-tag.test.mjs), what decides which entries are
// published is shell inside the workflow file, and it runs only when a Release
// is published. These tests read the steps out of the workflow and run THAT
// text, with `curl` and `mcp-publisher` replaced by stubs: nothing here
// reaches the registry or authenticates to it.
//
// They pin what must not regress silently:
//   - an entry the registry already lists is skipped, and no token is asked
//     for when nothing is missing;
//   - an answer that is neither 200 nor 404 fails that entry without
//     publishing it, and without stopping the others;
//   - one refused entry does not stop the rest, and fails the job;
//   - an empty or malformed job output registers nothing;
//   - the job's shape: the credential, the environment, its place after the
//     package publish legs, no action and no checkout, and a publisher binary
//     pinned by version and checksum, verified before it is unpacked.
//
// The steps' shell is bash, so those tests are skipped where there is none.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { registryEntries } from "./mcp-registry-entries.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const WRITE_STEP = "Write the entries the released commit declares";
const PUBLISH_STEP = "Publish each entry the registry does not have";
const DOWNLOAD_STEP = "Download the pinned mcp-publisher";

function workflow() {
  return parse(
    readFileSync(
      path.join(repoRoot, ".github", "workflows", "release.yml"),
      "utf8",
    ),
  );
}

/** The `publish-mcp-registry` job, as the workflow file declares it. */
function registryJob() {
  const job = workflow().jobs["publish-mcp-registry"];
  assert.ok(job, "release.yml has no publish-mcp-registry job");
  return job;
}

function step(name) {
  const found = registryJob().steps.find((s) => s.name === name);
  assert.ok(found, `publish-mcp-registry has no \`${name}\` step`);
  return found;
}

const hasBash =
  process.platform !== "win32" &&
  spawnSync("bash", ["-c", "exit 0"]).status === 0;

const A = "io.github.modelcontextprotocol/server-a";
const B = "io.github.modelcontextprotocol/server-b";
const C = "io.github.modelcontextprotocol/server-c";

/** Three entries, in the shape `detect-packages` hands over. */
function threeEntries() {
  return {
    a: { name: A, version: "1.0.0", packages: [] },
    b: { name: B, version: "2026.1.2", packages: [] },
    c: { name: C, version: "3.0.0", packages: [] },
  };
}

/**
 * Run the write step and then the publish step in a scratch directory.
 *
 * `curl` is a stub that answers each registry lookup from `answers`, keyed by
 * the server's name: an HTTP status to print, or `"fail"` to exit non-zero the
 * way curl does when it cannot connect. `mcp-publisher` is a stub that logs
 * each call and fails a `publish` of any directory in `refuse`.
 *
 * @param {object} options
 * @param {string} [options.entries] the `mcp_registry` output, as text
 * @param {Record<string, string>} [options.answers]
 * @param {string[]} [options.refuse]
 * @returns {{ write: number | null, publish: number | null, calls: string[], lookups: string[], stdout: string, stderr: string, dir: (file: string) => string | undefined }}
 */
function run({
  entries = JSON.stringify(threeEntries()),
  answers = {},
  refuse = [],
} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "mcp-registry-job-"));
  try {
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const lookups = path.join(dir, "lookups.log");
    const calls = path.join(dir, "calls.log");
    // The URL is curl's last argument. The name in it is `%2F`-encoded.
    const cases = Object.entries(answers)
      .map(([name, answer]) => {
        const pattern = `*/v0/servers/${name.replace("/", "%2F")}/versions/*`;
        return answer === "fail"
          ? `  ${pattern}) printf '000'; exit 7 ;;`
          : `  ${pattern}) printf '${answer}' ;;`;
      })
      .join("\n");
    writeFileSync(
      path.join(bin, "curl"),
      `#!/bin/sh\nfor url; do :; done\necho "$url" >> "${lookups}"\ncase "$url" in\n${cases}\n  *) printf '404' ;;\nesac\n`,
    );
    chmodSync(path.join(bin, "curl"), 0o755);
    const refused = refuse
      .map((d) => `  "publish entries/${d}/server.json") exit 1 ;;`)
      .join("\n");
    writeFileSync(
      path.join(dir, "mcp-publisher"),
      `#!/bin/sh\necho "$*" >> "${calls}"\ncase "$*" in\n${refused}\n  *) exit 0 ;;\nesac\n`,
    );
    chmodSync(path.join(dir, "mcp-publisher"), 0o755);

    const env = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      ENTRIES: entries,
    };
    const options = { cwd: dir, encoding: "utf8", env };
    const write = spawnSync(
      "bash",
      ["-e", "-c", step(WRITE_STEP).run],
      options,
    );
    const publish =
      write.status === 0
        ? spawnSync("bash", ["-e", "-c", step(PUBLISH_STEP).run], options)
        : { status: null, stdout: "", stderr: "" };
    const lines = (file) =>
      existsSync(file)
        ? readFileSync(file, "utf8").split("\n").filter(Boolean)
        : [];
    const files = new Map(
      ["plan.tsv", "entries/a/server.json"].map((f) => [
        f,
        existsSync(path.join(dir, f))
          ? readFileSync(path.join(dir, f), "utf8")
          : undefined,
      ]),
    );
    return {
      write: write.status,
      publish: publish.status,
      calls: lines(calls),
      lookups: lines(lookups),
      stdout: write.stdout + publish.stdout,
      stderr: write.stderr + publish.stderr,
      dir: (file) => files.get(file),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const bashTest = (name, fn) => test(name, { skip: !hasBash }, fn);

bashTest("write: one server.json per entry, and a plan naming each", () => {
  const result = run();
  assert.equal(result.write, 0, result.stderr);
  assert.equal(
    result.dir("plan.tsv"),
    `a\t${A}\t1.0.0\nb\t${B}\t2026.1.2\nc\t${C}\t3.0.0\n`,
  );
  assert.deepEqual(
    JSON.parse(result.dir("entries/a/server.json")),
    threeEntries().a,
  );
});

bashTest("write: the entries the repository records pass its checks", () => {
  const { entries, problems } = registryEntries();
  assert.deepEqual(problems, []);
  const result = run({ entries: JSON.stringify(entries) });
  assert.equal(result.write, 0, result.stderr);
  assert.equal(
    result.dir("plan.tsv").trim().split("\n").length,
    Object.keys(entries).length,
  );
});

for (const [name, entries] of [
  ["an empty output", ""],
  ["an output with no entries", "{}"],
  ["an output that is not JSON", "{ nope"],
  [
    "a directory that would leave entries/",
    JSON.stringify({ "../x": { name: A, version: "1.0.0" } }),
  ],
  [
    "a name outside this organization's namespace",
    JSON.stringify({ a: { name: "io.github.someone/else", version: "1.0.0" } }),
  ],
  ["an entry with no name", JSON.stringify({ a: { version: "1.0.0" } })],
  ["an entry with no version", JSON.stringify({ a: { name: A } })],
  [
    "a version that would change the lookup URL",
    JSON.stringify({ a: { name: A, version: "1.0.0/../../x" } }),
  ],
])
  bashTest(`write: ${name} registers nothing`, () => {
    const result = run({ entries });
    assert.notEqual(result.write, 0);
    assert.equal(result.publish, null);
    assert.deepEqual(result.calls, []);
    assert.deepEqual(result.lookups, []);
  });

bashTest("publish: every missing entry is published, after one login", () => {
  const result = run();
  assert.equal(result.publish, 0, result.stderr);
  assert.deepEqual(result.calls, [
    "login github-oidc",
    "publish entries/a/server.json",
    "publish entries/b/server.json",
    "publish entries/c/server.json",
  ]);
  assert.deepEqual(result.lookups, [
    "https://registry.modelcontextprotocol.io/v0/servers/io.github.modelcontextprotocol%2Fserver-a/versions/1.0.0",
    "https://registry.modelcontextprotocol.io/v0/servers/io.github.modelcontextprotocol%2Fserver-b/versions/2026.1.2",
    "https://registry.modelcontextprotocol.io/v0/servers/io.github.modelcontextprotocol%2Fserver-c/versions/3.0.0",
  ]);
});

bashTest("publish: an entry the registry already lists is skipped", () => {
  const result = run({ answers: { [B]: "200" } });
  assert.equal(result.publish, 0, result.stderr);
  assert.deepEqual(result.calls, [
    "login github-oidc",
    "publish entries/a/server.json",
    "publish entries/c/server.json",
  ]);
  assert.match(
    result.stdout,
    /server-b@2026\.1\.2 is already in the MCP Registry/,
  );
});

bashTest("publish: with nothing missing, no token is asked for", () => {
  const result = run({ answers: { [A]: "200", [B]: "200", [C]: "200" } });
  assert.equal(result.publish, 0, result.stderr);
  assert.deepEqual(result.calls, []);
});

for (const [name, answer] of [
  ["a server error", "500"],
  ["a rate limit", "429"],
  ["a redirect", "302"],
  ["no answer at all", "fail"],
])
  bashTest(`publish: ${name} fails that entry without publishing it`, () => {
    const result = run({ answers: { [B]: answer } });
    assert.equal(result.publish, 1);
    assert.deepEqual(result.calls, [
      "login github-oidc",
      "publish entries/a/server.json",
      "publish entries/c/server.json",
    ]);
    assert.match(
      result.stdout,
      /::error::Could not tell whether .*server-b@2026\.1\.2 is in the MCP Registry/,
    );
  });

bashTest(
  "publish: unreadable answers and nothing missing still fail, with no login",
  () => {
    const result = run({ answers: { [A]: "200", [B]: "503", [C]: "200" } });
    assert.equal(result.publish, 1);
    assert.deepEqual(result.calls, []);
  },
);

bashTest(
  "publish: one refused entry does not stop the rest, and fails the job",
  () => {
    const result = run({ refuse: ["a"] });
    assert.equal(result.publish, 1);
    assert.deepEqual(result.calls, [
      "login github-oidc",
      "publish entries/a/server.json",
      "publish entries/b/server.json",
      "publish entries/c/server.json",
    ]);
    assert.match(
      result.stdout,
      /::error::The MCP Registry refused the entry for src\/a/,
    );
    assert.match(result.stdout, /Registered src\/b\./);
  },
);

test("shape: the job holds the credential and waits for the release environment", () => {
  const job = registryJob();
  assert.deepEqual(job.permissions, { "id-token": "write" });
  assert.equal(job.environment, "release");
  assert.equal(typeof job["timeout-minutes"], "number");
});

test("shape: it runs after both sets of package publish legs, whatever their result", () => {
  const job = registryJob();
  assert.deepEqual([...job.needs].sort(), [
    "detect-packages",
    "publish-npm",
    "publish-pypi",
  ]);
  assert.match(job.if, /!cancelled\(\)/);
  assert.match(job.if, /needs\.detect-packages\.result == 'success'/);
});

test("shape: it runs no action, so no checkout and no dependency install", () => {
  for (const s of registryJob().steps) {
    assert.equal(s.uses, undefined, `step \`${s.name}\` uses an action`);
    assert.doesNotMatch(s.run, /\bnpm (ci|install|i)\b|\bnpx\b|\bpip\b|\buv\b/);
  }
});

test("shape: the entries come from detect-packages, as a job output", () => {
  const detect = workflow().jobs["detect-packages"];
  assert.equal(
    detect.outputs.mcp_registry,
    "${{ steps.registry.outputs.mcp_registry }}",
  );
  const record = detect.steps.find((s) => s.id === "registry");
  assert.ok(record, "detect-packages has no step with id `registry`");
  assert.equal(record.run, "node scripts/mcp-registry-entries.mjs");
  assert.equal(
    step(WRITE_STEP).env.ENTRIES,
    "${{ needs.detect-packages.outputs.mcp_registry }}",
  );
});

test("shape: the publisher is pinned by release and checksum, verified before it is unpacked", () => {
  const job = registryJob();
  assert.match(job.env.MCP_PUBLISHER_VERSION, /^v\d+\.\d+\.\d+$/);
  assert.match(job.env.MCP_PUBLISHER_SHA256, /^[a-f0-9]{64}$/);
  const { run: script } = step(DOWNLOAD_STEP);
  assert.match(
    script,
    /github\.com\/modelcontextprotocol\/registry\/releases\/download\/\$MCP_PUBLISHER_VERSION\//,
  );
  assert.doesNotMatch(script, /releases\/latest/);
  const check = script.indexOf("sha256sum --check --strict");
  const unpack = script.indexOf("tar -xzf");
  assert.ok(check !== -1, "the download step no longer checks the archive");
  assert.ok(
    check < unpack,
    "the archive must be checked before it is unpacked",
  );
  assert.match(script, /\$MCP_PUBLISHER_SHA256 {2}\$ARCHIVE/);
});

test("shape: the download comes first, and the only login is github-oidc", () => {
  const steps = registryJob().steps;
  assert.equal(steps[0].name, DOWNLOAD_STEP);
  const logins = steps.flatMap(
    (s) => s.run.match(/mcp-publisher login \S+/g) ?? [],
  );
  assert.deepEqual(logins, ["mcp-publisher login github-oidc"]);
  for (const s of steps) assert.doesNotMatch(s.run, /secrets\./);
});
