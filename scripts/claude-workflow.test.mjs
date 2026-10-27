// Tests for the trusted-author gate on `.github/workflows/claude.yml` (#4795).
// The `claude` job holds a shell, the API key and `id-token: write`, and it
// reads the text that mentions it, so who may start it is a security
// property. These tests evaluate the job's `if:` against a synthetic payload
// for every event the workflow listens to, rather than matching its text, so
// a disjunct that loses its author check, or checks the wrong author, fails
// here. Run via `npm run test:scripts`.
//
// The evaluator covers only the expression subset the condition uses
// (`==`, `&&`, `||`, `!`, parentheses, string literals, `github.*` paths,
// `contains` and `fromJSON`), with `contains` case-insensitive as in Actions.
// It refuses any other token, so widening the condition past that subset
// fails loudly instead of being evaluated wrongly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workflow = parse(
  readFileSync(path.join(repoRoot, ".github/workflows/claude.yml"), "utf8"),
);
const condition = workflow.jobs.claude.if;

const TOKEN =
  /\s+|'(?:[^']|'')*'|==|&&|\|\||!|\(|\)|,|contains|fromJSON|github(?:\.[A-Za-z_][A-Za-z0-9_-]*)+/y;

/** Compiles the expression subset above into a function of `github`. */
function compile(expr) {
  let js = "";
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < expr.length) {
    const at = TOKEN.lastIndex;
    const match = TOKEN.exec(expr);
    if (!match) {
      throw new Error(`unsupported expression syntax at: ${expr.slice(at)}`);
    }
    const tok = match[0];
    if (tok.startsWith("'")) {
      js += JSON.stringify(tok.slice(1, -1).replaceAll("''", "'"));
    } else if (tok.startsWith("github.")) {
      // A missing property reads as null, as it does in Actions.
      js += `(${tok.replaceAll(".", "?.")} ?? null)`;
    } else if (tok === "==") {
      // Only `event_name` is compared, against exact event names.
      js += "===";
    } else {
      js += tok;
    }
  }
  return new Function("github", "contains", "fromJSON", `return (${js});`);
}

const fold = (v) => (typeof v === "string" ? v.toLowerCase() : v);
const eq = (a, b) => fold(a) === fold(b);
const contains = (haystack, needle) =>
  Array.isArray(haystack)
    ? haystack.some((item) => eq(item, needle))
    : haystack != null &&
      String(haystack).toLowerCase().includes(String(needle).toLowerCase());

const evaluate = (github) =>
  Boolean(compile(condition)(github, contains, JSON.parse));

// One payload per event the workflow listens to, with the mention placed in
// the text that event carries, and `who` as that text's author association.
// The surrounding issue or pull request is always opened by a maintainer, so
// a gate that read the wrong author would let an outsider through.
const EVENTS = {
  issue_comment: (who) => ({
    event: {
      issue: { body: "", title: "", author_association: "OWNER" },
      comment: { body: "@claude review this", author_association: who },
    },
  }),
  pull_request_review_comment: (who) => ({
    event: {
      pull_request: { author_association: "OWNER" },
      comment: { body: "@claude fix this line", author_association: who },
    },
  }),
  pull_request_review: (who) => ({
    event: {
      pull_request: { author_association: "OWNER" },
      review: { body: "@claude summarize", author_association: who },
    },
  }),
  issues: (who) => ({
    event: {
      issue: {
        body: "@claude look at this",
        title: "",
        author_association: who,
      },
    },
  }),
};

const TRUSTED = ["OWNER", "MEMBER", "COLLABORATOR"];
const UNTRUSTED = [
  "CONTRIBUTOR",
  "FIRST_TIME_CONTRIBUTOR",
  "FIRST_TIMER",
  "MANNEQUIN",
  "NONE",
];

test("every event the workflow listens to has a payload here", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), Object.keys(EVENTS).sort());
});

for (const [name, payload] of Object.entries(EVENTS)) {
  const run = (who) => evaluate({ event_name: name, ...payload(who) });

  test(`${name}: a trusted author's mention starts the job`, () => {
    for (const who of TRUSTED) assert.equal(run(who), true, who);
  });

  test(`${name}: an untrusted author's mention starts nothing`, () => {
    for (const who of UNTRUSTED) assert.equal(run(who), false, who);
  });

  test(`${name}: a trusted author without a mention starts nothing`, () => {
    const github = { event_name: name, ...payload("OWNER") };
    const text =
      github.event.comment ?? github.event.review ?? github.event.issue;
    text.body = "no mention here";
    assert.equal(evaluate(github), false);
  });
}

test("an outsider's issue title mention starts nothing", () => {
  const github = {
    event_name: "issues",
    event: {
      issue: { body: "", title: "@claude do it", author_association: "NONE" },
    },
  };
  assert.equal(evaluate(github), false);
  github.event.issue.author_association = "MEMBER";
  assert.equal(evaluate(github), true);
});

test("the evaluator refuses syntax it does not model", () => {
  assert.throws(() => compile("github.event_name != 'x'"), /unsupported/);
  assert.throws(() => compile("startsWith(github.ref, 'x')"), /unsupported/);
});
