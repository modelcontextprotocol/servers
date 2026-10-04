# MCP reference servers

This repository holds the official Model Context Protocol reference servers:
seven standalone packages under `src/`, four in TypeScript (published to npm)
and three in Python (published to PyPI). They are reference implementations,
meant to show how each part of the protocol is used, not general-purpose
products.

**This file holds the _rules_: the conventions a reviewer cites against a diff.**
It is loaded in full at the start of every session, so it stays resident and must
be complete enough to work from on its own. Procedures (multi-step recipes with
commands and live IDs) belong in skills under `.claude/skills/`, which load on
demand. A rule that must never silently drop out of context goes here; a recipe
that can be re-read from disk goes in a skill.

Every rule in this file is true of the repository as it stands. A rule whose
machinery does not exist yet is added by the change that builds that machinery,
not in advance.

## Skills index

| Skill                                                  | Covers                                                                                                                                                  | How it loads                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [`board-ops`](.claude/skills/board-ops/SKILL.md)       | `gh project` recipes and the IDs for the Servers V2 board (#43); resolving option IDs by name; the option-deletion hazard and its recovery               | Model-invoked, or `/board-ops`    |
| [`issue-create`](.claude/skills/issue-create/SKILL.md) | The create flow: duplicate check, `v2` + type + server-scope labels, milestone, board card, Status + Priority, and the query that verifies them          | Model-invoked, or `/issue-create` |
| [`pr-flow`](.claude/skills/pr-flow/SKILL.md)           | Issue to PR: branch, DCO signoff and repair, the gate, client evidence, `addCloseIssueReferences`, the Copilot loop and its exits, close-out on merge    | Model-invoked, or `/pr-flow`      |
| [`issue-triage`](.claude/skills/issue-triage/SKILL.md) | Inflow: the class check and canned responses (listings, new servers, duplicates, outside PRs), pass 1 onto the board as Incoming, the priority rubric and its score comment, the board audit | Model-invoked, or `/issue-triage` |
| [`pre-push-gate`](.claude/skills/pre-push-gate/SKILL.md) | Running `npm run local:gate` and reading its result; what each stage checks and how to fix it when it fails; waiting on the gate lease | Model-invoked, or `/pre-push-gate` |
| [`security-advisory`](.claude/skills/security-advisory/SKILL.md) | A privately reported vulnerability end to end: the `[GHSA-…]` draft card, server or SDK ownership, the reach classes, accepting, the private fork, publishing, public tracking | Model-invoked, or `/security-advisory` |
| [`project-structure`](.claude/skills/project-structure/SKILL.md) | What is inside each server: the TypeScript and Python layouts, where each server registers its features, and where a new file goes | Model-invoked, or `/project-structure` |
| [`local-dev`](.claude/skills/local-dev/SKILL.md) | Install, build and run each server from the checkout over the transports it implements; local `npx`/`uvx` and client-config runs; stale builds and fresh worktrees; the `overrides`, lockstep and `uv.lock` procedures | Model-invoked, or `/local-dev` |
| [`testing`](.claude/skills/testing/SKILL.md) | The in-process protocol-level harness, test placement, the commands per suite, `test` versus `coverage`, and clearing the per-file coverage gate | Model-invoked, or `/testing` |
| [`release`](.claude/skills/release/SKILL.md) | A milestone release end to end: the release issue, the preparation PRs on `v2/main` (audit, Version Packages, Python CalVer), the pure `v2/main` → `main` merge PR, the release ledger, and what a maintainer publishes | **Name-only**: `/release` |
| [`client-smoke`](.claude/skills/client-smoke/SKILL.md) | Driving a built server with the Inspector CLI (the scripted path), the Inspector web UI (by hand) and an LLM client; the CLI's argument split and exit codes; protocol eras and what can be exercised today | Model-invoked, or `/client-smoke` |

A PR that adds a skill under `.claude/skills/<name>/SKILL.md` adds its row to
this table in the same change, and the table never lists a skill that does not
exist. How skills are kept reachable is under
[Maintaining the skills](#maintaining-the-skills).

## Project structure

```
servers/
├── src/                      One directory per server; each publishes on its own
│   ├── everything/           TS  @modelcontextprotocol/server-everything          npm   Exercises every MCP feature; the protocol showcase
│   ├── filesystem/           TS  @modelcontextprotocol/server-filesystem          npm   File operations, access limited to allowed directories / Roots
│   ├── memory/               TS  @modelcontextprotocol/server-memory              npm   Knowledge-graph persistence
│   ├── sequentialthinking/   TS  @modelcontextprotocol/server-sequential-thinking npm   Step-by-step reasoning
│   ├── fetch/                Py  mcp-server-fetch                                 PyPI  Fetches web content and converts it for LLMs
│   ├── git/                  Py  mcp-server-git                                   PyPI  Git repository operations
│   └── time/                 Py  mcp-server-time                                  PyPI  Time and timezone conversion
├── .claude/skills/            On-demand procedures (see the Skills index above)
├── .changeset/               Pending changesets for the TypeScript servers, and the changesets config
├── scripts/                  The pre-push gate (gate-lease, smoke-servers, validate-py), its guards (verify-*),
│                             the skills tooling, and release tooling (npm-publish-guard, prepare-python-release,
│                             pack-and-verify, release-manifest)
├── docs/                     Design documents; quality-gate.md is the gate's reference (stages, CI vs local, the lease);
│                             contribution-model.md holds the outside-PR backlog plan
├── .github/workflows/        typescript.yml, python.yml (per-package CI), release.yml (publishes on a GitHub Release),
│                             version-packages.yml (the changesets PR), prepare-python-release.yml (the CalVer PR),
│                             claude.yml (@claude mentions)
├── .github/ISSUE_TEMPLATE/   Bug and feature issue forms; config.yml routes security and new servers away
├── .github/pull_request_template.md   The "issues, not PRs" banner that turns outside PRs away
├── RELEASING.md              How packages are versioned and published, and how to recover a failed publish
└── CONTRIBUTING.md           The contribution policy: issues, not PRs; what is accepted
```

The four TypeScript servers are **npm workspaces** of the root `package.json`.
The three Python servers are independent `uv` projects, each with its own
`pyproject.toml`, `uv.lock` and `.python-version`. Every server versions and
publishes independently.

A server may carry its own `AGENTS.md` for guidance that only applies inside it
(`src/everything/AGENTS.md` does). Claude Code loads a nested `AGENTS.md` when
it reads a file in that directory, not at session start, so **a rule that
applies repo-wide goes in this file, never only in a nested one.**

### New and rewritten source files open with a purpose header

A source file you create, or substantially rewrite (code, tests, scripts,
workflows, configuration in a format that has comments), opens with a comment
stating what the file is for
and the reasoning behind it: the first comment in the file,
**after any shebang**. `#!/usr/bin/env node` must stay on line 1 of an
executable entry point, or the published bin stops working. This is not a bulk
migration: files you only touch in passing keep their current form. Read that
header rather than restating its reasoning in this file, since a duplicated
rationale goes stale silently. A Markdown document states its purpose in its
opening paragraph instead, as this one does. A format with no comment syntax
(JSON, such as `package.json`) is exempt.

## Development setup

Node **22** for the TypeScript servers. Python **>= 3.10** for the Python
servers, at the version each server's `.python-version` pins. Python
dependencies are managed with **`uv`, never `pip`**.

```sh
# TypeScript: one install at the root covers all four workspaces
npm install
npm run build                           # every workspace
npm test -w src/<server>                # one workspace (vitest)
npm run coverage -w src/<server>        # the same suite, with the per-file coverage gate

# Python: per server
cd src/<server>
uv sync --frozen --all-extras --dev
uv run pytest
uv run --frozen pyright
uv run ruff check .
uv build

# Both languages: the pre-push gate (see Before pushing)
npm run local:gate
```

### Before pushing

**Run `npm run local:gate` before every push, and push only when it exits 0.**
It runs every check CI runs, for both languages, in one command:
`verify:install-fresh`, the root `validate` (the guards, then each TypeScript
workspace's format check, lint, typecheck, build and tests), `coverage` (each
TypeScript workspace's per-file coverage gate), `validate:py`
(each Python server's locked sync, `ruff check`, `ruff format --check`,
pyright, pytest and build), `verify:skills:cli`, and `smoke` (every server
booted over each transport it implements). The stage-by-stage reference, and
what CI runs where, is [`docs/quality-gate.md`](./docs/quality-gate.md);
diagnosing a red stage is the `pre-push-gate` skill.

- **`npm run validate` and the per-package commands above are the inner loop,
  not a substitute.** They skip the other language, the pinned skills validator
  and the boot smoke.
- **Format before committing**: `npm run format` at the root (TypeScript), and
  `uv run --frozen ruff format .` in a Python server you changed. The gate only
  checks formatting; it never rewrites files.
- **Judge the gate by its exit code**, not by reading its output: a Prettier
  failure prints `[warn]` lines that look like nothing.
- **The gate runs under a machine-wide lease**, so a second gate started in
  another worktree queues behind the first instead of contending with it. A
  "waiting" line is normal; do not bypass it to save time.
- **No test may retry.** A retry reports a test that sometimes fails as
  passing. `verify:no-test-retries` fails on Vitest's `retry` and on pytest's
  rerun plugins; fix what makes the test fail.
- **`npm run pack:verify` is not a gate stage.** It installs each package's
  publish artifact into an empty directory and boots it, which needs the
  network. `release.yml` runs it before anything publishes, and the `release`
  skill runs it by hand for the ledger.
- **`local:*` scripts never run in a workflow, and every CI job declares
  `timeout-minutes`.** The script tests enforce both
  (`scripts/lib/workflow-gate.mjs`). A check added to CI is added to
  `local:gate:stages` in the same change, so the first sentence of this section
  stays true.

### Credentialed workflow jobs

A workflow job **holds a credential** when it can mint an OIDC token or push a
package (`id-token: write`, `packages: write`), or is handed any secret other
than `GITHUB_TOKEN`. Today that is `release.yml`'s publish jobs and
`claude.yml`.

- **Every action in a credentialed job is pinned to a full commit SHA, with the
  release it was resolved from in a trailing comment**:
  `uses: actions/checkout@<40-hex sha> # v6.1.0`. A tag can be moved, and a
  moved tag runs new code next to the credential with no change in this
  repository. The same holds for **a job whose artifact a credentialed job
  downloads**, since what it builds is what gets published, and for **a job
  whose outputs a credentialed job reads**, since the reader acts on them.
  `verify:action-pins` enforces both. Other jobs keep moving major tags.
- **A job that holds a publish credential does not install dependencies or
  build.** `release.yml` builds, tests and verifies each package in a job
  with no `id-token`, and the publish job only downloads that artifact and
  hands it to the registry.

### Dependencies

- **Pin a transitive dependency with an `overrides` entry** in the root
  `package.json`, not with `npm audit fix`, which "resolves" an advisory with no
  upward escape by silently downgrading.
- **When you bump a devDependency that several TypeScript workspaces declare**
  (`typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`, …), bump it in
  every workspace that declares it. Their ranges already differ; do not widen the
  skew.
- **A Python dependency change updates that server's `uv.lock`** in the same
  commit (`uv lock`). CI installs with `--frozen` / `--locked` and fails on a
  stale lockfile.

## Project status and direction

| Branch    | Role                                                                           | PRs target it?                                           |
| --------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `v2/main` | **Develop.** All active work lands here.                                       | **Yes**, every PR                                        |
| `main`    | **Release.** The default branch, and what users see. Not a development branch. | **No**, it only receives milestone merges from `v2/main` |

Cut feature branches from **`origin/v2/main`**. **Never open a PR against
`main`**, with one exception: a milestone's merge PR, which the `release`
skill opens. There is no `v1` line in this repository.

- **Repo**: https://github.com/modelcontextprotocol/servers
- **Project board**: [Servers V2 (#43)](https://github.com/orgs/modelcontextprotocol/projects/43)

Versioning and publishing are described in [`RELEASING.md`](./RELEASING.md).
Publishing is a deliberate maintainer action (`release.yml` runs only when a
maintainer publishes a GitHub Release), never a side effect of a merge.

### Versions

- **A version changes only in a version PR, never by hand and never at release
  time.** The TypeScript servers are semver, bumped by the changesets
  "Version Packages" PR; the Python servers are CalVer, stamped by the
  "Prepare Python Release" PR. No workflow computes a version, and a release
  publishes whatever version it finds that the registry does not have.
- **A PR that changes what a TypeScript server publishes carries a changeset**
  (`npm run changeset`): patch for a fix; minor for a new tool, prompt, resource
  or option; major for a breaking change (a tool removed or renamed, a schema
  change that breaks clients, a protocol or Node floor bump). A change with no
  effect on a published TypeScript package (docs, skills, workflows, scripts,
  tests, a Python server) carries none.
- **A TypeScript server reports its version from its `package.json`** (the
  `SERVER_VERSION` its `version.ts` exports), never from a literal in the
  source: the version PR edits `package.json` only.

## Contributing

What the repository accepts is in [`CONTRIBUTING.md`](./CONTRIBUTING.md). Read it
rather than a summary. In short: bug fixes, usability improvements and changes
that demonstrate MCP protocol features (Resources, Prompts, Roots, not just
Tools) are welcome; other new features are selective; **new server
implementations are not accepted** (they belong in the
[MCP Server Registry](https://github.com/modelcontextprotocol/registry)), and
neither are README server-listing changes.

**Pull requests are opened by the repository maintainers.** Anyone else, org
members with write access included, files a detailed issue instead: the problem,
how to reproduce it, the expected behavior, and, if a fix was prototyped, the
prompt that produced it rather than a diff. An agent working for someone who is
not a maintainer produces that issue, not a PR. The maintainers decided this on
#4861. `CONTRIBUTING.md`, the PR template's banner and the issue forms in
`.github/ISSUE_TEMPLATE/` all say so; a change to the policy changes all of them
together.

- **An outside PR is closed, not reviewed or merged**, with a pointer to the
  issue flow. If it holds a fix worth keeping, file an issue for it first and
  credit the PR's author there. How the open backlog of outside PRs is worked,
  and the comment to close them with, is in
  [`docs/contribution-model.md`](./docs/contribution-model.md).
- **Issue forms are served from the default branch** (`main`), so a change under
  `.github/ISSUE_TEMPLATE/` goes live at the next milestone merge, not when its
  PR merges to `v2/main`. The server dropdown in each form does not label the
  issue; triage applies the `server-<name>` scope label from it.

**Every PR references an issue.** The PR body's first line is
`Closes #<ISSUE_NUMBER>`. A PR with no linked issue has no board card, so the
work is invisible to the board. If there is no issue yet, create it first. This
holds for a maintainer's own one-line fix as much as for a feature.

- **Temporary exception: Dependabot PRs.** Dependabot still opens its own PRs
  (weekly GitHub Actions bumps, and security-fix PRs), against `main`, with no
  linked issue, no `v2` label and no checklist. They are exempt from the PR rules
  in this file (issue link, base branch, labels, checklist, board) until the
  change that replaces them with issue-filing sweeps lands and removes this
  exception.
- **Exception: a security advisory's fix, in its private fork.** A PR in the
  advisory's temporary private fork (`servers-ghsa-xxxx-yyyy-zzzz`) links no
  public issue, carries no labels, and is tracked by the advisory's `[GHSA-…]` draft
  card rather than an issue's card, because each of those would disclose the
  vulnerability before a fix ships. For the same reason the work-start rules
  on assigning an issue and naming the branch `v2/<type>/<ISSUE_NUMBER>-<slug>`
  do not apply: its branch is `v2/fix/<ghsa-id>`, with **no descriptive
  slug**. It still targets `v2/main`, and it is reviewed inside the fork. The
  flow is the `security-advisory` skill.

- **Exception: a milestone's merge PR.** It is the one PR that targets `main`.
  It is a pure merge of `v2/main` (its branch is `origin/v2/main` with no
  commits of its own, and the merged tree equals `origin/v2/main`'s), and its body's first line is
  **`Part of #N`** for the milestone's release issue, not `Closes #N`: on the
  default branch a closing keyword would close that issue at merge, before
  anything is published. The release issue is closed by hand once the Release
  is published. In place of the checklist it links the **release ledger**. It
  is merged with a merge commit, never squashed. The flow is the `release`
  skill.
- **Exception: the two version PRs that automation opens.** Each changes
  version metadata only, so neither answers the PR checklist below, and each
  is tied to its milestone's **release issue** rather than to an issue of its
  own.
  - The **Prepare Python Release** PR follows the rest of the rules: the
    workflow takes the release issue's number, writes `Closes #N` as the
    body's first line, names the branch `v2/chore/<N>-python-calver-<date>`
    and labels it `v2`.
  - The changesets **"Version Packages"** PR cannot carry a `Closes` line: the
    action rewrites its body on every push to `v2/main`, and its branch is the
    action's own (`changeset-release/v2/main`). The workflow labels it `v2`.
    Tie it to the release issue with a **comment** (`Part of #N`), which an
    update does not overwrite.

No other PR is exempt.

Every PR answers the PR checklist in its body: the MCP documentation was read
for the feature touched, the change follows MCP security best practices, the
server's README is updated, and a **server-facing change was tested with an LLM
client**, with the scenarios tested named under the body's "How Has This Been
Tested?" heading. The body's sections and the full checklist are in the
`pr-flow` skill. [`.github/pull_request_template.md`](./.github/pull_request_template.md)
is only the "issues, not PRs" banner; it does not carry them.

## Maintenance rules

- When adding, removing, renaming, or changing the purpose of a file or folder,
  update the entry that describes it: the root `README.md`, the server's own
  `README.md`, and the tree in this file.
- A change to a server's tools, resources, prompts, configuration or environment
  variables updates **that server's `README.md`** in the same PR.
- A change to how packages are versioned or published updates
  [`RELEASING.md`](./RELEASING.md).
- When a rule changes, update this file. When a procedure changes, update the
  skill that owns it, not this file. Link to a document rather than copying it:
  two copies of a command sequence or an ID are worse than one, because the stale
  copy is indistinguishable from the live one.

### Maintaining the skills

Skills are conditional: a skill's body loads only when it is invoked, so a skill
that stops being reachable loses behavior **silently**. Four rules keep that
from happening. How to write a description that fires, and eval cases that
measure it, is [`docs/skill-authoring.md`](./docs/skill-authoring.md).

1. **`npm run verify:skills` must pass.** It runs inside `validate:guards`, and
   CI runs it with `verify:skills:cli` (the authoritative `claude plugin
   validate`, at a pinned CLI version) on every push and pull request. It parses
   each `SKILL.md`'s frontmatter the way Claude Code does. Malformed YAML loads
   the body with an _empty_ description, so `/name` still works while the skill
   can never auto-fire; an unquoted `#` truncates the description silently.
   **Quote any description containing `#` or `:`**, and keep the opening `---`
   on the file's first line.
2. **Every skill declares `disable-model-invocation` explicitly. Default it to
   `false`.** Invoking a skill has no side effects (it loads instructions), and
   work is usually asked for in prose, which a `true` skill can never answer. A
   `true` skill also cannot be reached from another skill's body. Reserve `true`
   for a procedure only ever started deliberately by name.
3. **A model-invoked skill carries committed eval cases** at
   `.claude/skills/<name>/evals/evals.json`: at least five positives and at
   least one negative. `npm run skills:eval` runs them (it needs the `claude`
   CLI, or `copilot` with `AGENT=copilot`, and spends real model calls, so it is
   **not** in the gate). Run the **whole** suite when adding a skill or editing a
   description, since a new skill can lower the trigger rate of the others, and
   aim each case at what only the skill holds, never at something this file
   already answers.
4. **Keep the listing inside its budget.** Claude Code truncates the skill
   listing when it overflows, dropping the least-invoked entries first.
   `verify:skills` prints this repo's share against the budget in
   `scripts/lib/skill-manifest.mjs` and fails when it is exceeded. Put the key
   use case first in each description.

A rule that must never drop out of context stays in this file: in a long
session, auto-compaction can drop an older skill's body entirely.

## Issue-driven work style

All work is driven by items on the Servers V2 board (#43). The _recipes_ for
the flows below are in the `issue-create` and `board-ops` skills; the rules are
here.

- **Before starting work, check the board for the relevant item.**
- **Every board item is a real GitHub issue.** No draft cards. Before creating an
  issue, search for a matching one in every state; **never create a duplicate**.
  - **The one exception is a private security advisory**, tracked by a **draft
    card** titled with the bare id, `[GHSA-xxxx-yyyy-zzzz]`, because a real
    issue would disclose the vulnerability before a fix exists. The title stays
    that opaque until publication: board access is wider than advisory access,
    and a summary can name the server or the attack. It becomes a public
    issue by conversion **once the advisory is published**, never merely once
    the fix ships. The `[GHSA-` prefix is load-bearing: **any other draft card
    is still a defect to delete**. The flow is the `security-advisory` skill.
    **Accepting, closing and publishing an advisory, and replying to its
    reporter, are human-only; never automate or bulk-apply any of them.**
- **Only issues go on the board, never PRs.** A PR is tracked through its linked
  issue's card.
- **Label every issue and every PR `v2`**, at create time. It marks work tracked
  by this workflow.
- **Label every issue with exactly one type label**: `bug`, `enhancement`,
  `documentation`, `chore` or `question`. A PR needs no type label; it is classified
  through the issue it closes.
- **Label an issue that concerns one server with its scope label**
  (`server-everything`, `server-filesystem`, `server-memory`,
  `server-sequentialthinking`, `server-fetch`, `server-git`, `server-time`).
  An issue that concerns the repository as a whole carries none.
- **Every issue you create gets a milestone.** Milestones are release buckets,
  so pick by when the work ships. The one exception: an issue that arrives
  unboarded stays unmilestoned in `Incoming` until a maintainer approves it.
- **Every board item has a Priority** (a board field, not a label).
- **`Incoming` ⇔ no milestone; every Status past it ⇔ milestoned.** Assigning
  the milestone _is_ the approval act, so the two go together. `Todo` asserts a
  maintainer signed off, so never park an unreviewed issue there. An issue you
  create through the normal flow skips `Incoming`, because filing it was the
  approval.
  A `[GHSA-` advisory draft is exempt: a draft card cannot carry a milestone,
  so its approval act is **accepting the advisory**, which moves it
  `Incoming` → `Todo`. Its milestone arrives with the public issue after
  publication.
- **`Done` means the work shipped**: its PR merged, or it is a parent whose last
  sub-issue closed. A duplicate, won't-fix, not-planned or superseded issue
  shipped nothing, so its card is **deleted** rather than moved to Done.
- **When work begins**, assign the issue to yourself, set Status to
  **In Progress**, and create a branch named
  `v2/<type>/<ISSUE_NUMBER>-<slug>` (for example
  `v2/fix/4810-filesystem-symlink-escape`) from `origin/v2/main`.
- **When work is complete**, run the checks under
  [Before pushing](#before-pushing), open a PR against `v2/main` labeled `v2`
  with `Closes #<ISSUE_NUMBER>` as the body's first line, and set Status to
  **In Review**.
- ⚠️ Closing keywords only auto-link and auto-close for PRs targeting the
  default branch (`main`). A PR against `v2/main` gets a cross-reference only,
  so **link it explicitly** with the `addCloseIssueReferences` GraphQL mutation
  right after opening it. **On merge, close the issue by hand and move its card
  to Done.** Keep the `Closes` line anyway.
- **After opening a PR, run a Copilot review loop to convergence, unprompted.**
  Request a review, wait for the round to post or for Copilot's session to end
  without one, answer every comment, and request again only when you pushed a
  fix or the last round ended without a review. Stop on the **first** clean
  round (no confirming round), a round holding only out-of-scope findings, or
  two rounds in a row that end without a review. **There is no round cap**: a
  loop ends for one of those reasons, never because of how many rounds it has
  run. The recipe is the `pr-flow` skill.
  - ⚠️ **Copilot does not converge on its own.** Every fix it talks you into
    beyond the issue is fresh surface for the next round, so accepting scope
    creep is what makes a review cycle protracted. **Weigh each finding against
    the issue the PR closes and decline scope expansion**: pre-existing
    behavior, new capabilities, and hardening the issue did not ask for. A
    declined finding that is worth doing gets its own issue, linked in the
    reply. The rule is under
    [Responding to code reviews](#responding-to-code-reviews).
- **If new tasks are discovered during development, create issues** for them
  and put them on the board, rather than widening the current PR.

## Responding to code reviews

- It is not necessary to implement every suggestion.
- **Judge each suggestion against the issue the PR closes.** Fix defects in what
  the PR added. Decline, with a reason, suggestions that expand the PR beyond
  what the issue calls for (pre-existing behavior, new capabilities, hardening
  the issue did not ask for), and file an issue for any that is worth doing on
  its own.
- You may implement a suggestion differently, or skip one for a good reason.
- **Reply to each review comment in its own thread**, saying what was done or
  why it was not. A rollup comment elsewhere cannot be connected back to the
  thread it answers, so the thread stays open showing a finding and no reply.
  Then post a PR-level summary **in addition**, because inline replies go hidden
  once the fix is pushed. A finding in a review's "Suppressed comments" block has
  no thread, so the summary is the only place to answer it.

## Always test new or modified code

- **New or changed behavior comes with tests.** TypeScript servers use
  **vitest** (with `@vitest/coverage-v8`), with tests in the server's
  `__tests__/` directory. Python servers use **pytest** (`pytest-asyncio` where
  the server is async), with tests in the server's `tests/` directory (`test/` in
  `time`).
- **Coverage is gated per file.** The rule for each language:
  - **TypeScript**: every file in a server clears **≥ 90 on all four
    dimensions** (lines, statements, functions and branches). The thresholds
    are set in each server's `vitest.config.ts` (`perFile: true`). A PR that
    drops any file below 90 on any dimension fails CI (`typescript.yml` →
    **Coverage \<server\>**) and `npm run local:gate`.
- **A genuinely unreachable branch is annotated at the source, never waved
  through by lowering the gate.** Every ignore carries its reason:
  `/* v8 ignore next -- <reason> */` in TypeScript. Reach for one only when the
  code cannot be exercised (a defensive guard for a value the types already
  rule out, say), never because a test is hard to write.
- **`coverage` is its own command, separate from `test` and `validate`.**
  `npm run coverage -w src/<server>` (or the root `npm run coverage` for every
  TypeScript server) runs the suite instrumented and enforces the gate;
  `test` and `validate` stay fast and do not. CI and `npm run local:gate` run
  it as a stage of its own.
- **Test at the protocol level where you can**: drive the server through an MCP
  client over an in-memory transport and assert on what comes back, rather than
  only calling internal functions.
- **In tests that expect error output, suppress it from the console.**

## Waiting on long-running work

**When you are waiting for something to finish, arm a notifier and stop. Never
spend turns polling.** The harness re-invokes you when a backgrounded task exits,
so a per-turn `echo`, `tail` or `grep` of a log delivers nothing the notification
would not, burns turns, and buries the result under no-op turns.

- **One notification ("tell me when this finishes")**: background the command
  itself, or a single loop that exits on the condition.
- **Many ("tell me on each occurrence")**: a monitor over a stream that emits one
  line per event.
- **State the harness cannot observe** (a CI run, a remote review queue) does
  need polling, but inside **one backgrounded loop that exits when the condition
  holds**, at an interval matched to how fast the state changes (30s or more for
  a remote API).
- ⚠️ **If a notifier is already armed, wait for it.** Re-checking by hand
  alongside it is the polling this rule forbids.

## MCP protocol

- **Look protocol questions up; do not answer them from memory.** The repo
  configures the `mcp-docs` MCP server (`.mcp.json`,
  `https://modelcontextprotocol.io/mcp`). For schema details use the versioned
  schemas (JSON and TypeScript) in
  [modelcontextprotocol/schema](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/schema).
- **Transports**: stdio is the default and every server supports it.
  `everything` also serves Streamable HTTP and HTTP+SSE. **HTTP+SSE is
  deprecated**: keep what exists working, and never make it the default or the
  recommended option in new code or docs.
- **Tool annotations**: every tool you add or change sets `readOnlyHint`,
  `idempotentHint` and `destructiveHint` to values that match what it actually
  does.
- **Tool names**: verb-first (`get-file-info`, not `file-info`). A new tool
  follows the naming convention of the server it joins: kebab-case in
  `everything`, snake_case in the others. **Never rename a published tool**: a
  tool name is part of the server's interface, and renaming it breaks every
  client configuration and prompt that uses it.
- **Resources and prompts** registered in `everything` are kebab-case too.
- **Registration**: in `everything`, each feature area exports a
  `registerTools(server)` / `registerResources(server)` /
  `registerPrompts(server)` function and is wired into that area's `index.ts`.
  The other TypeScript servers register directly on the server
  (`server.registerTool(...)`). Follow the pattern of the server you are in.

## TypeScript instructions

- Use TypeScript for all new code, with strict typing for every function and
  variable.
- **ES modules**: relative imports carry the `.js` extension
  (`import { x } from "./lib.js"`).
- **Validate tool input with Zod schemas**, with descriptions on the fields.
- **Naming**: camelCase for variables and functions, PascalCase for types and
  classes, UPPER_CASE for constants, kebab-case for new file names.
- **Imports** at the top of the file, external packages first, then internal
  modules.
- Prefer `async`/`await` over callbacks and raw promise chains.
- **NEVER use `any` as a type.**
- **NEVER suppress errors in the TypeScript configuration or with a lint
  directive** as a way of satisfying the compiler.
- **AVOID double casts (`as unknown as T`).** Prefer a type guard, a narrower
  single cast, or fixing the underlying type. When one is genuinely unavoidable
  (a documented gap in a third-party type, for example), it carries an inline
  comment saying why it is safe and why nothing better works.
- **NEVER leave a promise floating.** Every promise is awaited, returned,
  terminated with `.catch(…)`, or explicitly discarded with `void` plus a
  one-line comment saying why the caller cannot await it. A floated call reads
  like an awaited one minus a keyword, and its unhandled rejection surfaces
  somewhere else entirely.
- **Clean up** timers, intervals, subscriptions and child processes when the
  server shuts down or a transport closes.
- Handle errors with `try`/`catch` and return clear error messages to the
  client, as an MCP error result where the protocol calls for one.

## Python instructions

- **Type hints everywhere, and pyright-clean**: CI runs `uv run --frozen pyright`
  on every Python server.
- **Lint with `ruff`** (`uv run ruff check .`).
- Follow the server's existing module layout
  (`src/<server>/src/mcp_server_<name>/`) and its async style; test async code
  with `pytest-asyncio` where the server already uses it.
- Manage dependencies with `uv` and commit the updated `uv.lock` (see
  [Dependencies](#dependencies)).
- Builds use **hatchling** through `uv build`; do not add another build backend.
