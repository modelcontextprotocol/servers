import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "./ci-state-classifier.mjs";

test("no checks", () => {
  assert.equal(classify([]), "no checks");
});

test("pending", () => {
  assert.equal(classify([{ status: "in_progress" }]), "pending");
});

test("failed", () => {
  assert.equal(classify([{ conclusion: "failure" }]), "failed");
});

test("policy blocked wins", () => {
  const checks = [{ conclusion: "failure", summary: "Resource not accessible by integration" }];
  assert.equal(classify(checks), "policy-blocked");
});
