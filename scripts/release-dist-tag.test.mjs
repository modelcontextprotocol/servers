// Regression tests for the npm dist-tag `release.yml` publishes with (#4873).
//
// The choice between `latest` and `backfill` is made by a few lines of
// JavaScript INSIDE the `publish-npm` job's publish step. It cannot be a
// script in this directory: that job holds the OIDC credential and has no
// checkout, on purpose, so the only code it can run is what the workflow file
// itself carries. A helper tested here and re-typed there would be two copies
// that can drift, with the untested one being the one that publishes.
//
// So these tests read the step out of the workflow file and run THAT: the
// same text GitHub Actions hands to bash. A change to the workflow that lets
// `latest` move backward fails here.
//
// The step's shell is bash, so the tests are skipped where there is none.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** The `TAG="$(node -e "…")"` assignment, exactly as the publish step has it. */
function tagAssignment() {
  const workflow = parse(
    readFileSync(
      path.join(repoRoot, ".github", "workflows", "release.yml"),
      "utf8",
    ),
  );
  const step = workflow.jobs["publish-npm"].steps.find(
    (s) => s.name === "Publish package",
  );
  assert.ok(step, "publish-npm has no `Publish package` step");
  const start = step.run.indexOf('TAG="$(node -e "');
  const end = step.run.indexOf('")" || {', start);
  assert.ok(
    start !== -1 && end !== -1,
    'the publish step no longer chooses its dist-tag with `TAG="$(node -e …)"`; update this test with it',
  );
  return step.run.slice(start, end + 3);
}

const hasBash = spawnSync("bash", ["-c", "exit 0"]).status === 0;

/**
 * Run the step's tag choice for one version against one registry document.
 *
 * @param {string} version the version about to be published
 * @param {string} registry the text of registry.json, as the step saved it
 * @returns {{ status: number | null, tag: string, stderr: string }}
 */
function chooseTag(version, registry) {
  const dir = mkdtempSync(path.join(tmpdir(), "dist-tag-"));
  try {
    writeFileSync(path.join(dir, "registry.json"), registry);
    const res = spawnSync(
      "bash",
      ["-e", "-c", `${tagAssignment()}\nprintf '%s' "$TAG"`],
      {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, EXPECTED_VERSION: version },
      },
    );
    return { status: res.status, tag: res.stdout, stderr: res.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const latest = (version) =>
  JSON.stringify({ "dist-tags": { latest: version } });

const cases = [
  {
    name: "the move from the date-stamped line to 1.x takes latest",
    version: "1.0.0",
    registry: latest("2026.8.31"),
    tag: "latest",
  },
  {
    name: "a version higher than the registry's latest takes latest",
    version: "1.1.0",
    registry: latest("1.0.3"),
    tag: "latest",
  },
  {
    name: "a higher major takes latest",
    version: "2.0.0",
    registry: latest("1.9.9"),
    tag: "latest",
  },
  {
    name: "components compare as numbers, not text: 1.10.0 is above 1.9.0",
    version: "1.10.0",
    registry: latest("1.9.0"),
    tag: "latest",
  },
  {
    name: "an older release re-run after a newer one published is a backfill",
    version: "1.0.0",
    registry: latest("1.1.0"),
    tag: "backfill",
  },
  {
    name: "1.2.0 is below 1.10.0, so it is a backfill",
    version: "1.2.0",
    registry: latest("1.10.0"),
    tag: "backfill",
  },
  {
    name: "the version already at latest does not re-take it",
    version: "1.0.0",
    registry: latest("1.0.0"),
    tag: "backfill",
  },
  {
    name: "a never-published package (the step saves {} for a 404) takes latest",
    version: "1.0.0",
    registry: "{}",
    tag: "latest",
  },
];

for (const c of cases)
  test(c.name, { skip: !hasBash }, () => {
    const res = chooseTag(c.version, c.registry);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.tag, c.tag);
  });

const refusals = [
  {
    name: "a prerelease to publish is refused: its tag is a person's choice",
    version: "1.1.0-rc.1",
    registry: latest("1.0.0"),
  },
  {
    name: "a registry latest that is not plain x.y.z is refused",
    version: "1.0.0",
    registry: latest("1.1.0-rc.1"),
  },
  {
    name: "a registry document that does not parse is refused",
    version: "1.0.0",
    registry: "<html>bad gateway</html>",
  },
];

for (const c of refusals)
  test(c.name, { skip: !hasBash }, () => {
    const res = chooseTag(c.version, c.registry);
    assert.notEqual(res.status, 0);
    assert.equal(res.tag, "");
  });

test("the step passes the chosen tag to npm publish, and nothing else", () => {
  const workflow = readFileSync(
    path.join(repoRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  const publishes = workflow
    .split("\n")
    .filter((l) => /^\s*npm publish\b/.test(l));
  assert.equal(publishes.length, 1);
  assert.match(publishes[0], /--tag "\$TAG"/);
});
