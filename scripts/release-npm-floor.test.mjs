// Regression tests for how `release.yml`'s `publish-npm` job gets its npm (#5104).
//
// That job holds the OIDC credential, so it installs nothing: it runs an
// exactly pinned Node whose bundled npm meets the floor for OIDC trusted
// publishing (11.5.1), and a step fails the job before anything is published
// if that npm is ever below the floor. The step's comparator is inline shell
// and JavaScript in the workflow file, which runs only after a Release is
// published, so a later edit that let 11.5.0 through would otherwise surface
// at release time.
//
// As in release-dist-tag.test.mjs, these tests read the step out of the
// workflow file and run THAT, with `npm` on PATH replaced by a stub that
// reports a chosen version. They also pin the job's shape: an exact Node
// pin, the check ahead of the download and the publish, no step that
// installs a package, and the `./` that makes `npm publish` read the tarball
// as a local file. Without it npm reads `release-artifact/x.tgz` as GitHub
// `owner/repo` shorthand and tries to clone it over SSH: the MCP Inspector's
// first release through the same split publish job failed exactly that way
// (modelcontextprotocol/inspector#2551).
//
// The step's shell is bash, so those tests are skipped where there is none.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const CHECK_STEP = "Check the bundled npm supports OIDC trusted publishing";

/** The `publish-npm` job's steps, as the workflow file declares them. */
function publishSteps() {
  const workflow = parse(
    readFileSync(
      path.join(repoRoot, ".github", "workflows", "release.yml"),
      "utf8",
    ),
  );
  const job = workflow.jobs["publish-npm"];
  assert.ok(job, "release.yml has no publish-npm job");
  return job.steps;
}

const hasBash =
  process.platform !== "win32" &&
  spawnSync("bash", ["-c", "exit 0"]).status === 0;

/**
 * Run the workflow's npm floor check with `npm --version` reporting `version`.
 *
 * @param {string} version what the stub npm reports
 * @returns {{ status: number | null, stderr: string }}
 */
function runCheck(version) {
  const step = publishSteps().find((s) => s.name === CHECK_STEP);
  assert.ok(step, `publish-npm has no \`${CHECK_STEP}\` step`);
  const dir = mkdtempSync(path.join(tmpdir(), "npm-floor-"));
  try {
    const stub = path.join(dir, "npm");
    writeFileSync(stub, `#!/bin/sh\necho "${version}"\n`);
    chmodSync(stub, 0o755);
    const result = spawnSync("bash", ["-e", "-c", step.run], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH}`,
      },
    });
    return { status: result.status, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test(
  "the npm floor check accepts 11.5.1 and later",
  { skip: !hasBash && "needs bash" },
  () => {
    for (const version of ["11.5.1", "11.6.0", "11.19.0", "12.0.0"]) {
      const { status, stderr } = runCheck(version);
      assert.equal(status, 0, `npm ${version} was refused: ${stderr}`);
    }
  },
);

test(
  "the npm floor check refuses anything below 11.5.1",
  { skip: !hasBash && "needs bash" },
  () => {
    for (const version of ["11.5.0", "11.4.9", "10.9.9", "9.0.0"]) {
      const { status, stderr } = runCheck(version);
      assert.notEqual(status, 0, `npm ${version} was accepted`);
      assert.match(stderr, /below 11\.5\.1/);
    }
  },
);

test("publish-npm pins Node exactly, to a release whose npm meets the floor", () => {
  const setup = publishSteps().find((s) =>
    String(s.uses ?? "").startsWith("actions/setup-node@"),
  );
  assert.ok(setup, "publish-npm has no actions/setup-node step");
  const pin = String(setup.with?.["node-version"] ?? "");
  assert.match(
    pin,
    /^\d+\.\d+\.\d+$/,
    `node-version ${pin} is not an exact x.y.z pin`,
  );
  // Node 24.5.0 is the first release whose bundled npm is 11.5.1.
  const [major, minor] = pin.split(".").map(Number);
  assert.ok(
    major > 24 || (major === 24 && minor >= 5),
    `Node ${pin} bundles an npm below the OIDC floor`,
  );
});

test("publish-npm checks npm before it downloads or publishes anything", () => {
  const names = publishSteps().map((s) => s.name ?? s.uses);
  const check = names.indexOf(CHECK_STEP);
  assert.notEqual(check, -1, `publish-npm has no \`${CHECK_STEP}\` step`);
  const download = names.findIndex((n) =>
    String(n).startsWith("Download the artifact"),
  );
  const publish = names.indexOf("Publish package");
  assert.ok(
    download !== -1 && publish !== -1,
    "publish-npm lost its download or publish step",
  );
  assert.ok(
    check < download && check < publish,
    `the npm check runs after: ${names.join(" > ")}`,
  );
});

test("publish-npm installs no package next to the OIDC credential", () => {
  const install =
    /\b(?:npm|pnpm|yarn)\s+(?:install|i|ci|add|exec|dlx)\b|\bnpx\b|\bcorepack\b|\bpip3?\s+install\b|\buvx?\b/;
  for (const step of publishSteps()) {
    if (!step.run) continue;
    // Shell comments may name these tools in prose; only commands count.
    const commands = step.run
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    assert.doesNotMatch(
      commands,
      install,
      `publish-npm step \`${step.name}\` installs or runs a fetched package`,
    );
  }
});

test("publish-npm hands npm the tarball as a ./ path, not a bare dir/file", () => {
  const step = publishSteps().find((s) => s.name === "Publish package");
  assert.ok(step, "publish-npm has no `Publish package` step");
  const commands = step.run
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.match(
    commands,
    /^\s*set -- \.\/release-artifact\/\*\.tgz\s*$/m,
    "the publish step must resolve the tarball as ./release-artifact/*.tgz",
  );
  assert.doesNotMatch(
    commands,
    /set -- release-artifact\//,
    "a bare release-artifact/ path makes npm read the tarball as a GitHub repo",
  );
  assert.match(
    commands,
    /npm publish "\$1"/,
    "npm publish must be given the ./ path resolved above",
  );
});
