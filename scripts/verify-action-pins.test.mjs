// Tests for the credentialed-job SHA-pin guard (#4873). The pure helpers are
// driven with inline workflows; `main` against a throwaway tree on disk, so the
// workflow discovery and the exit status are covered too.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { credentialedJobs, main, unpinnedRefs } from "./verify-action-pins.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const wf = (...lines) => lines.join("\n");

test("an unparseable workflow fails loudly rather than reading as empty", () => {
  assert.throws(
    () => unpinnedRefs("jobs:\n  a: [unclosed", "broken.yml"),
    /could not parse broken\.yml/,
  );
});

test("a minting scope in a job's own permissions makes it credentialed", () => {
  const yaml = wf(
    "jobs:",
    "  publish:",
    "    permissions:",
    "      id-token: write",
    "  image:",
    "    permissions:",
    "      contents: read",
    "      packages: write",
    "  plain:",
    "    permissions:",
    "      contents: read",
  );
  assert.deepEqual([...credentialedJobs(yaml)].sort(), ["image", "publish"]);
});

test("write-all counts as a minting scope", () => {
  const yaml = wf("jobs:", "  everything:", "    permissions: write-all");
  assert.deepEqual([...credentialedJobs(yaml)], ["everything"]);
});

test("a job with no permissions block inherits the workflow's", () => {
  const minting = wf(
    "permissions:",
    "  id-token: write",
    "jobs:",
    "  inherits:",
    "    runs-on: x",
    "  overrides:",
    "    permissions:",
    "      contents: read",
  );
  assert.deepEqual([...credentialedJobs(minting)], ["inherits"]);
});

test("a commented-out scope does not count", () => {
  const yaml = wf(
    "jobs:",
    "  package:",
    "    # holds NO `id-token: write` — see publish",
    "    permissions:",
    "      contents: read",
  );
  assert.deepEqual([...credentialedJobs(yaml)], []);
});

test("any secret but GITHUB_TOKEN makes a job credentialed", () => {
  const yaml = wf(
    "jobs:",
    "  model:",
    "    steps:",
    "      - env:",
    "          KEY: ${{ secrets.ANTHROPIC_API_KEY }}",
    "  default:",
    "    steps:",
    "      - env:",
    "          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
  );
  assert.deepEqual([...credentialedJobs(yaml)], ["model"]);
});

test("every spelling of a non-default secret counts; GITHUB_TOKEN in any spelling does not", () => {
  const yaml = wf(
    "jobs:",
    "  bracket:",
    "    steps:",
    "      - env:",
    "          KEY: ${{ secrets['DEPLOY_TOKEN'] }}",
    "  dynamic:",
    "    steps:",
    "      - env:",
    "          KEY: ${{ secrets[matrix.secret] }}",
    "  inherits:",
    "    uses: org/repo/.github/workflows/publish.yml@v1",
    "    secrets: inherit",
    "  maps-default-only:",
    "    uses: org/repo/.github/workflows/lint.yml@v1",
    "    secrets:",
    "      token: ${{ secrets.GITHUB_TOKEN }}",
    "  maps-empty:",
    "    uses: org/repo/.github/workflows/lint.yml@v1",
    "    secrets: {}",
    "  maps-real:",
    "    uses: org/repo/.github/workflows/lint.yml@v1",
    "    secrets:",
    "      token: ${{ secrets.NPM_TOKEN }}",
    "  default-bracket:",
    "    steps:",
    "      - env:",
    `          GH_TOKEN: \${{ secrets["GITHUB_TOKEN"] }}`,
    "  prose:",
    "    steps:",
    "      - name: Scan for secrets",
    "        run: echo secrets.NOT_AN_EXPRESSION",
  );
  assert.deepEqual([...credentialedJobs(yaml)].sort(), [
    "bracket",
    "dynamic",
    "inherits",
    "maps-real",
  ]);
});

test("a secret in the workflow-level env reaches every job", () => {
  const yaml = wf(
    "env:",
    "  TOKEN: ${{ secrets.DEPLOY_TOKEN }}",
    "jobs:",
    "  a:",
    "    runs-on: x",
    "  b:",
    "    runs-on: y",
  );
  assert.deepEqual([...credentialedJobs(yaml)].sort(), ["a", "b"]);
  const defaultOnly = wf(
    "env:",
    "  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    "jobs:",
    "  a:",
    "    runs-on: x",
  );
  assert.deepEqual([...credentialedJobs(defaultOnly)], []);
});

test("a job whose artifact a credentialed job downloads is credentialed", () => {
  const yaml = wf(
    "jobs:",
    "  build:",
    "    steps:",
    "      - uses: actions/checkout@v7",
    "  package:",
    "    needs: [build]",
    "    steps:",
    "      - uses: actions/upload-artifact@v7",
    "  publish:",
    "    needs: [package, build]",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    "      - uses: actions/download-artifact@v8",
  );
  // `build` is needed too, but uploads nothing, so it feeds nothing published.
  assert.deepEqual([...credentialedJobs(yaml)].sort(), ["package", "publish"]);
});

test("the artifact rule follows a multi-hop chain regardless of job order", () => {
  const yaml = wf(
    "jobs:",
    "  source:",
    "    steps:",
    "      - uses: actions/upload-artifact@v7",
    "  package:",
    "    needs: source",
    "    steps:",
    "      - uses: actions/download-artifact@v8",
    "      - uses: actions/upload-artifact@v7",
    "  publish:",
    "    needs: package",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    "      - uses: actions/download-artifact@v8",
  );
  assert.deepEqual([...credentialedJobs(yaml)].sort(), [
    "package",
    "publish",
    "source",
  ]);
});

test("a producer behind a job that neither downloads nor uploads still counts", () => {
  const yaml = wf(
    "jobs:",
    "  source:",
    "    steps:",
    "      - uses: actions/upload-artifact@v7",
    "  bridge:",
    "    needs: source",
    "    steps:",
    "      - uses: actions/checkout@v7",
    "  unrelated:",
    "    steps:",
    "      - uses: actions/upload-artifact@v7",
    "  publish:",
    "    needs: bridge",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    "      - uses: actions/download-artifact@v8",
  );
  // Artifacts are run-scoped, so `publish` can download what `source`
  // uploaded. `bridge` handles no artifact, and `unrelated` is not upstream.
  assert.deepEqual([...credentialedJobs(yaml)].sort(), ["publish", "source"]);
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "source", uses: "actions/upload-artifact@v7" },
    { job: "publish", uses: "actions/download-artifact@v8" },
  ]);
});

test("action names are matched without regard to case, as GitHub resolves them", () => {
  const yaml = wf(
    "jobs:",
    "  package:",
    "    steps:",
    "      - uses: Actions/Upload-Artifact@v7",
    "  publish:",
    "    needs: package",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    `      - uses: Actions/Download-Artifact@${SHA} # v8.0.1`,
  );
  assert.deepEqual([...credentialedJobs(yaml)].sort(), ["package", "publish"]);
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "package", uses: "Actions/Upload-Artifact@v7" },
  ]);
});

test("an upstream reusable-workflow call counts as an artifact producer", () => {
  const yaml = wf(
    "jobs:",
    "  build:",
    "    uses: org/repo/.github/workflows/build.yml@v1",
    "  lint:",
    "    uses: org/repo/.github/workflows/lint.yml@v1",
    "  publish:",
    "    needs: build",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    `      - uses: actions/download-artifact@${SHA} # v8.0.1`,
  );
  // The called workflow can upload into this run and is not read here, so the
  // call upstream of the downloader is held to the pin. `lint` is not upstream.
  assert.deepEqual([...credentialedJobs(yaml)].sort(), ["build", "publish"]);
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "build", uses: "org/repo/.github/workflows/build.yml@v1" },
  ]);
});

test("a credentialed reusable-workflow call counts as an artifact downloader", () => {
  const yaml = wf(
    "jobs:",
    "  package:",
    "    steps:",
    "      - uses: actions/upload-artifact@v7",
    "  publish:",
    "    needs: package",
    "    permissions:",
    "      id-token: write",
    `    uses: org/repo/.github/workflows/publish.yml@${SHA} # v1.2.3`,
  );
  // The called workflow can download what `package` uploaded, and is not read
  // here, so `package` is held to the pin although `publish` has no steps.
  assert.deepEqual([...credentialedJobs(yaml)].sort(), ["package", "publish"]);
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "package", uses: "actions/upload-artifact@v7" },
  ]);
});

test("an upload is not credentialed when the consumer downloads nothing", () => {
  const yaml = wf(
    "jobs:",
    "  package:",
    "    steps:",
    "      - uses: actions/upload-artifact@v7",
    "  publish:",
    "    needs: package",
    "    permissions:",
    "      id-token: write",
  );
  assert.deepEqual([...credentialedJobs(yaml)], ["publish"]);
});

test("unpinnedRefs flags tags and comment-less SHAs in credentialed jobs only", () => {
  const yaml = wf(
    "jobs:",
    "  publish:",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    `      - uses: actions/setup-node@${SHA} # v7.0.0`,
    `      - uses: actions/download-artifact@${SHA}`,
    "      - uses: actions/checkout@v7",
    "  lint:",
    "    steps:",
    "      - uses: actions/checkout@v7",
  );
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "publish", uses: `actions/download-artifact@${SHA}` },
    { job: "publish", uses: "actions/checkout@v7" },
  ]);
});

test("a credentialed reusable-workflow call must pin its own ref", () => {
  const yaml = wf(
    "jobs:",
    "  release:",
    "    permissions:",
    "      id-token: write",
    "    uses: org/repo/.github/workflows/publish.yml@main",
    "  pinned:",
    "    permissions:",
    "      id-token: write",
    `    uses: org/repo/.github/workflows/publish.yml@${SHA} # v1.2.3`,
    "  local:",
    "    permissions:",
    "      id-token: write",
    "    uses: ./.github/workflows/publish.yml",
  );
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "release", uses: "org/repo/.github/workflows/publish.yml@main" },
  ]);
});

test("a YAML alias in a credentialed job is a finding, not a pass", () => {
  const yaml = wf(
    "x-refs:",
    "  checkout: &checkout actions/checkout@v7",
    "  step: &step",
    "    uses: actions/cache@v6",
    "jobs:",
    "  publish:",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    "      - uses: *checkout",
    "      - *step",
    "  lint:",
    "    steps:",
    "      - uses: *checkout",
  );
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "publish", uses: "*checkout" },
    { job: "publish", uses: "*step" },
  ]);
});

test("a version comment must name an exact release", () => {
  const yaml = wf(
    "jobs:",
    "  publish:",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    `      - uses: actions/setup-node@${SHA} # v7`,
    `      - uses: actions/cache@${SHA} # pinned`,
    "      - uses: ./.github/actions/local",
  );
  // A major-only comment is not what the SHA was resolved from, and the sweep
  // would compare it at major precision only — the moving-tag behavior again.
  assert.deepEqual(unpinnedRefs(yaml), [
    { job: "publish", uses: `actions/setup-node@${SHA}` },
    { job: "publish", uses: `actions/cache@${SHA}` },
  ]);
});

function withWorkflows(files, fn) {
  const root = mkdtempSync(path.join(tmpdir(), "action-pins-"));
  try {
    const dir = path.join(root, ".github", "workflows");
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files))
      writeFileSync(path.join(dir, name), body);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const quiet = (fn) => (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  return fn(t);
};

test(
  "main passes when every credentialed job is pinned",
  quiet(() => {
    const ok = wf(
      "jobs:",
      "  publish:",
      "    permissions:",
      "      id-token: write",
      "    steps:",
      `      - uses: actions/setup-node@${SHA} # v7.0.0`,
    );
    assert.equal(
      withWorkflows({ "ok.yml": ok, "notes.txt": "uses: x@v1" }, main),
      0,
    );
  }),
);

test(
  "main fails and names the job when one is not",
  quiet(() => {
    const bad = wf(
      "jobs:",
      "  publish:",
      "    permissions:",
      "      id-token: write",
      "    steps:",
      "      - uses: actions/setup-node@v7",
    );
    assert.equal(withWorkflows({ "main.yml": bad }, main), 1);
    assert.match(
      console.error.mock.calls[0].arguments[0],
      /main\.yml → publish: actions\/setup-node@v7/,
    );
  }),
);
