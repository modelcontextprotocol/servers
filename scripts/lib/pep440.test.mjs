// Tests for the PEP 440 reader the Python halves of the sweeps use (#4874):
// ordering across pre, post and dev releases, the specifier operators that
// Dependabot ranges and `pyproject.toml` bounds use, and the refusal to guess
// on input it cannot read. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareVersions,
  isPrerelease,
  normalizeName,
  parseVersion,
  satisfies,
} from "./pep440.mjs";

test("parseVersion reads release, pre, post and dev segments", () => {
  assert.deepEqual(parseVersion("2.0.0a1"), {
    epoch: 0,
    release: [2, 0, 0],
    pre: [0, 1],
    post: null,
    dev: null,
  });
  assert.deepEqual(parseVersion("4.6.2.post1").post, 1);
  assert.deepEqual(parseVersion("1.0-1").post, 1);
  assert.deepEqual(parseVersion("1.0.dev3").dev, 3);
  assert.deepEqual(parseVersion("1!2.0").epoch, 1);
  assert.deepEqual(parseVersion("v1.2rc2").pre, [2, 2]);
  assert.deepEqual(parseVersion("1.2+local.7").release, [1, 2]);
  assert.throws(() => parseVersion("not-a-version"), /not a PEP 440 version/);
});

test("compareVersions follows PEP 440 ordering", () => {
  const ordered = [
    "1.0.dev1",
    "1.0a1",
    "1.0a2.dev1",
    "1.0a2",
    "1.0b1",
    "1.0rc1",
    "1.0",
    "1.0.post1",
    "1.0.1",
    "1.1",
    "2026.1.14",
    "1!0.1",
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.ok(
      compareVersions(ordered[i], ordered[i + 1]) < 0,
      `${ordered[i]} < ${ordered[i + 1]}`,
    );
  }
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("2.13.0", "2.13"), 0);
});

test("satisfies reads Dependabot ranges, comma-separated", () => {
  assert.equal(satisfies("2.13.0", ">= 2.0.0a1, <= 2.14.0"), true);
  assert.equal(satisfies("2.15.0", ">= 2.0.0a1, <= 2.14.0"), false);
  assert.equal(satisfies("2.13.0", "<= 2.13.0"), true);
  assert.equal(satisfies("2.14.0", "< 2.14.0"), false);
  assert.equal(satisfies("3.1.61", "<= 3.1.61"), true);
  assert.equal(satisfies("2.0.0", "= 2.0.0"), true);
  assert.equal(satisfies("1.29.0", ">=1.29.0,<2"), true);
  assert.equal(satisfies("2.3.0", ">=1.29.0,<2"), false);
});

test("satisfies handles ==, !=, wildcards, ~= and the empty specifier", () => {
  assert.equal(satisfies("1.2.5", "==1.2.*"), true);
  assert.equal(satisfies("1.3.0", "==1.2.*"), false);
  assert.equal(satisfies("1.2.5", "!=1.2.5"), false);
  assert.equal(satisfies("1.4.2", "~=1.4.1"), true);
  assert.equal(satisfies("1.5.0", "~=1.4.1"), false);
  assert.equal(satisfies("1.9", "~=1.4"), true);
  assert.equal(satisfies("2.0", "~=1.4"), false);
  assert.equal(satisfies("1.0", "===1.0"), true);
  assert.equal(satisfies("1.0", ">1.0"), false);
  assert.equal(satisfies("9.9", ""), true);
});

test("exclusive bounds follow PEP 440's pre- and post-release rules", () => {
  assert.equal(satisfies("2.0rc1", "<2.0"), false);
  assert.equal(satisfies("2.0.dev1", "<2.0"), false);
  assert.equal(satisfies("1.9", "<2.0"), true);
  assert.equal(satisfies("2.0a1", "<2.0rc1"), true);
  assert.equal(satisfies("2.0.0rc1", "<2"), false);
  assert.equal(satisfies("1.0.post1", ">1.0"), false);
  assert.equal(satisfies("1.0.post2", ">1.0.post1"), true);
  assert.equal(satisfies("1.0.1", ">1.0"), true);
  // The inclusive forms are plain ordering.
  assert.equal(satisfies("2.0rc1", "<=2.0"), true);
  assert.equal(satisfies("1.0.post1", ">=1.0"), true);
});

test("satisfies throws instead of guessing", () => {
  assert.throws(() => satisfies("1.0", "about 1.0"), /specifier clause/);
  assert.throws(() => satisfies("1.0", "~=1"), /two release segments/);
  assert.throws(() => satisfies("garbage", "<2"), /not a PEP 440 version/);
});

test("isPrerelease and normalizeName", () => {
  assert.equal(isPrerelease("2.0.0a1"), true);
  assert.equal(isPrerelease("2.0.0.dev1"), true);
  assert.equal(isPrerelease("2.0.0"), false);
  assert.equal(normalizeName("PyJWT"), "pyjwt");
  assert.equal(normalizeName("Typing_Extensions"), "typing-extensions");
  assert.equal(normalizeName("zope.interface"), "zope-interface");
});
