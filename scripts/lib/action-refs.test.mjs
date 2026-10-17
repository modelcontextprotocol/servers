// Tests for the action-reference matcher (#4873).
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EXACT_VERSION, SHA_REF, isPinned, parseUses } from "./action-refs.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

test("only a full-length lowercase hex SHA is an immutable ref", () => {
  assert.equal(SHA_REF.test(SHA), true);
  for (const ref of [
    "v7",
    "v7.0.1",
    "main",
    SHA.slice(0, 7),
    SHA.toUpperCase(),
    `${SHA}0`,
  ])
    assert.equal(SHA_REF.test(ref), false, ref);
});

test("a version comment names an exact release", () => {
  assert.equal(EXACT_VERSION.test("v7.0.1"), true);
  for (const v of ["v7", "v7.0", "7.0.1", "release/v1", "pinned"])
    assert.equal(EXACT_VERSION.test(v), false, v);
});

test("parseUses splits at the last @ and skips what has no ref", () => {
  assert.deepEqual(parseUses(`actions/checkout@${SHA}`), {
    action: "actions/checkout",
    ref: SHA,
  });
  assert.deepEqual(parseUses("org/repo/.github/workflows/x.yml@main"), {
    action: "org/repo/.github/workflows/x.yml",
    ref: "main",
  });
  assert.equal(parseUses("./.github/actions/local"), null);
  assert.equal(parseUses("docker://alpine:3.20"), null);
  assert.equal(parseUses("actions/checkout"), null);
});

test("isPinned needs both the SHA and the exact-version comment", () => {
  assert.equal(isPinned(`actions/checkout@${SHA}`, " v7.0.1"), true);
  assert.equal(isPinned(`actions/checkout@${SHA}`, " v7"), false);
  assert.equal(isPinned(`actions/checkout@${SHA}`, undefined), false);
  assert.equal(isPinned("actions/checkout@v7", " v7.0.1"), false);
  assert.equal(isPinned("actions/checkout", " v7.0.1"), false);
});
