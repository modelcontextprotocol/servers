// Ported from the MCP Inspector for #4864; `#N` below are that repo's issues
// unless marked otherwise.
//
// Regression tests for `verify-format-coverage`'s sibling-guard vouch (Copilot,
// #1962). The three root guards form a cycle so that dropping any one from
// `validate` is caught by another — but the vouch branch itself had no test, so
// a typo in a sibling's name would leave `test:scripts` green while that guard
// silently stopped being enforced. That is the same "a gate that stops gating"
// failure the cycle exists to prevent, one level up.
//
// The vouch runs before any file enumeration, so the fixture needs only a
// `package.json` and the script. The workspace-reach and file-coverage phases
// (added here for this repo's npm workspaces) get fixtures of their own below.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

/** A `validate` chain running each named guard, plus the always-present self. */
function scriptsRunning(guards) {
  const scripts = {
    validate: ["verify:format-coverage", ...guards]
      .map((g) => `npm run ${g}`)
      .join(" && "),
    "verify:format-coverage": "node scripts/verify-format-coverage.mjs",
  };
  for (const g of guards) scripts[g] = `node scripts/${g.slice(7)}.mjs`;
  return scripts;
}

/**
 * Run `verify-format-coverage` in a throwaway repo whose root `validate` runs
 * exactly `guards`. realpath'd because the script only executes when
 * `import.meta.url` matches `process.argv[1]`, and macOS `tmpdir()` is a
 * symlink — see the note in `verify-dep-lockstep.main.test.mjs`.
 */
function runWithGuards(guards) {
  return runWithScripts(scriptsRunning(guards));
}

/**
 * Same, for a fixture whose `scripts` are built by hand. `files` maps extra
 * repo-relative paths to their contents (a workspace manifest, a source file).
 */
function runWithScripts(scripts, files = {}) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "format-cov-")));
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify(
        { name: "fixture", workspaces: ["src/*"], scripts },
        null,
        2,
      ),
    );
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), content);
    }
    mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
    for (const rel of [
      "verify-format-coverage.mjs",
      path.join("lib", "npm-scripts.mjs"),
      path.join("lib", "workspaces.mjs"),
    ])
      cpSync(path.join(scriptsDir, rel), path.join(dir, "scripts", rel));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "-A"], { cwd: dir });

    const r = spawnSync(
      process.execPath,
      [path.join(dir, "scripts", "verify-format-coverage.mjs")],
      { cwd: dir, encoding: "utf8" },
    );
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ALL_SIBLINGS = [
  "verify:typecheck-coverage",
  "verify:dep-lockstep",
  "verify:skills",
];

for (const dropped of ALL_SIBLINGS) {
  test(`vouch: fails when \`${dropped}\` is dropped from validate`, () => {
    const { status, out } = runWithGuards(
      ALL_SIBLINGS.filter((g) => g !== dropped),
    );
    assert.equal(status, 1, out);
    assert.match(out, new RegExp("no longer runs `" + dropped + "`"));
  });
}

test("vouch: a mention is not an invocation", () => {
  // `rootReachesScript` used to match any `npm run …` substring, so a `validate`
  // reading `echo npm run verify:skills` satisfied the vouch while the guard
  // never executed — the cycle protecting nothing (Copilot).
  const scripts = scriptsRunning(ALL_SIBLINGS);
  scripts.validate = scripts.validate.replace(
    "npm run verify:skills",
    "echo npm run verify:skills",
  );
  const { status, out } = runWithScripts(scripts);
  assert.equal(status, 1, out);
  assert.match(out, /no longer runs `verify:skills`/);
});

test("vouch: passes when every sibling is still wired", () => {
  // The run still fails afterwards — the copied guard scripts are tracked and
  // no glob covers them — so assert on the *reason*, not the exit status: no
  // sibling may be reported missing.
  const { out } = runWithGuards(ALL_SIBLINGS);
  assert.doesNotMatch(out, /no longer runs/);
});

// --- workspaces (#4864) --------------------------------------------------------

const SERVER = {
  name: "server",
  scripts: {
    validate: "npm run format:check",
    "format:check":
      'prettier --check "**/*.{ts,mjs}" --ignore-path ../../.prettierignore',
  },
};

/** Root scripts with every sibling wired, plus `format:check:root` over scripts/. */
function wiredRoot(validateTail) {
  const scripts = scriptsRunning(ALL_SIBLINGS);
  scripts.validate = `npm run format:check:root && ${scripts.validate}${validateTail}`;
  scripts["format:check:root"] = 'prettier --check "scripts/**/*.mjs"';
  return scripts;
}

test("workspaces: a fully wired tree passes", () => {
  const { status, out } = runWithScripts(
    wiredRoot(" && npm run validate --workspaces"),
    {
      "src/server/package.json": JSON.stringify(SERVER),
      "src/server/index.ts": "export {};\n",
    },
  );
  assert.equal(status, 0, out);
  assert.match(out, /OK: all \d+ tracked source files are format-gated/);
});

test("workspaces: a workspace the root validate never runs fails", () => {
  const { status, out } = runWithScripts(wiredRoot(""), {
    "src/server/package.json": JSON.stringify(SERVER),
    "src/server/index.ts": "export {};\n",
  });
  assert.equal(status, 1, out);
  assert.match(out, /does not invoke 1 workspace validation/);
  assert.match(out, /src\/server/);
});

test("workspaces: --ignore-path's value is not read as a glob that covers files", () => {
  // Without the value-taking-flag skip, `../../.prettierignore` joined onto the
  // workspace dir is a path; this pins that it is not harvested at all, by
  // making it the ONLY argument that could cover the file.
  const onlyIgnorePath = {
    ...SERVER,
    scripts: {
      validate: "npm run format:check",
      "format:check": "prettier --check --ignore-path index.ts",
    },
  };
  const { status, out } = runWithScripts(
    wiredRoot(" && npm run validate --workspaces"),
    {
      "src/server/package.json": JSON.stringify(onlyIgnorePath),
      "src/server/index.ts": "export {};\n",
    },
  );
  assert.equal(status, 1, out);
  assert.match(out, /src\/server\/index\.ts/);
});

test("workspaces: a tracked source file no glob covers fails, naming it", () => {
  const { status, out } = runWithScripts(
    wiredRoot(" && npm run validate --workspaces"),
    {
      "src/server/package.json": JSON.stringify(SERVER),
      "src/server/index.ts": "export {};\n",
      "tools/gen.mjs": "export {};\n",
    },
  );
  assert.equal(status, 1, out);
  assert.match(out, /not covered by any prettier format glob/);
  assert.match(out, /tools\/gen\.mjs/);
});

test("workspaces: a matched directory with source but no manifest is ungated", () => {
  // npm skips a `src/*` match without a package.json, so nothing formats it.
  const { status, out } = runWithScripts(
    wiredRoot(" && npm run validate --workspaces"),
    { "src/orphan/index.ts": "export {};\n" },
  );
  assert.equal(status, 1, out);
  assert.match(out, /src\/orphan\/index\.ts/);
});
