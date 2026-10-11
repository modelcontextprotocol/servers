// Tests for the npm registry-diff guard (#4472). `decide` is driven with the
// registry answers that matter; `main` with a stubbed `fetch` and a throwaway
// package directory, so the step output and the exit status are covered with no
// network.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decide, main, packageUrl } from "./npm-publish-guard.mjs";

const published = { versions: { "0.6.2": {}, "2026.7.4": {} } };

test("a scoped name is escaped the way the registry routes it", () => {
  assert.equal(
    packageUrl("@modelcontextprotocol/server-memory"),
    "https://registry.npmjs.org/@modelcontextprotocol%2Fserver-memory",
  );
  assert.equal(packageUrl("plain"), "https://registry.npmjs.org/plain");
});

test("a version the registry lists is skipped", () => {
  assert.equal(decide({ status: 200, body: published }, "0.6.2").skip, true);
  assert.equal(decide({ status: 200, body: published }, "2026.7.4").skip, true);
});

test("a version the registry does not list is published", () => {
  assert.equal(decide({ status: 200, body: published }, "1.0.0").skip, false);
  // A prefix of a published version is not that version.
  assert.equal(decide({ status: 200, body: published }, "0.6").skip, false);
  // Nor is an inherited property name.
  assert.equal(
    decide({ status: 200, body: published }, "constructor").skip,
    false,
  );
});

test("a package the registry has never seen is published", () => {
  assert.equal(decide({ status: 404, body: null }, "1.0.0").skip, false);
});

test("an answer it cannot read throws rather than guessing", () => {
  assert.throws(() => decide({ status: 503, body: null }, "1.0.0"), /503/);
  assert.throws(() => decide({ status: 200, body: {} }, "1.0.0"), /versions/);
  assert.throws(() => decide({ status: 200, body: "x" }, "1.0.0"), /versions/);
});

async function withPackage(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "publish-guard-"));
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "@scope/pkg", version: "1.0.0" }),
    );
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const respond = (status, body) => async (url, init) => {
  assert.equal(url, "https://registry.npmjs.org/@scope%2Fpkg");
  assert.match(init.headers.accept, /npm\.install-v1/);
  return { status, json: async () => body };
};

const quiet = (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
};

test("main writes skip=false for a new version and exits 0", async (t) => {
  quiet(t);
  await withPackage(async (dir) => {
    const out = path.join(dir, "output");
    const code = await main([dir], {
      fetch: respond(200, published),
      env: { GITHUB_OUTPUT: out },
    });
    assert.equal(code, 0);
    assert.equal(readFileSync(out, "utf8"), "skip=false\n");
  });
});

test("main writes skip=true for a published version", async (t) => {
  quiet(t);
  await withPackage(async (dir) => {
    const out = path.join(dir, "output");
    const code = await main([dir], {
      fetch: respond(200, { versions: { "1.0.0": {} } }),
      env: { GITHUB_OUTPUT: out },
    });
    assert.equal(code, 0);
    assert.equal(readFileSync(out, "utf8"), "skip=true\n");
  });
});

test("main publishes a never-published package", async (t) => {
  quiet(t);
  await withPackage(async (dir) => {
    const out = path.join(dir, "output");
    assert.equal(
      await main([dir], {
        fetch: respond(404, null),
        env: { GITHUB_OUTPUT: out },
      }),
      0,
    );
    assert.equal(readFileSync(out, "utf8"), "skip=false\n");
  });
});

test("main fails, and writes no verdict, when the registry is unreadable", async (t) => {
  quiet(t);
  await withPackage(async (dir) => {
    const out = path.join(dir, "output");
    writeFileSync(out, "");
    assert.equal(
      await main([dir], {
        fetch: respond(503, null),
        env: { GITHUB_OUTPUT: out },
      }),
      1,
    );
    const offline = async () => {
      throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    };
    assert.equal(
      await main([dir], { fetch: offline, env: { GITHUB_OUTPUT: out } }),
      1,
    );
    assert.equal(readFileSync(out, "utf8"), "");
  });
});

test("main needs a package directory", async (t) => {
  quiet(t);
  assert.equal(await main([]), 2);
});
