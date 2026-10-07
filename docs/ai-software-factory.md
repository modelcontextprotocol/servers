# MCP reference servers: the AI software factory

This document is the overview of how work gets done in this repository: the
rules, the procedures, the gates and the scheduled automation that let a
coding agent, driven by a maintainer, take an approved issue to a merged PR. It
is written for someone who was not part of building it. It describes; the
rules themselves live in [`AGENTS.md`](../AGENTS.md) and the procedures in
[`.claude/skills/`](../.claude/skills), and where this page and those disagree,
they win.

The model was adapted from the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector)'s, which
built it first. The inventory of what was taken, adapted or left behind, and
why, is [`agent-guidance-inception.md`](./agent-guidance-inception.md); the
work was tracked as #4858.

## The headline change

- **Outside contributors file issues, never PRs.** Pull requests are opened by
  the repository maintainers only; write access does not change that. Anyone
  else files a detailed issue (the problem, how to reproduce it, the expected
  behavior, and the prompt behind any prototype rather than a diff), and a
  maintainer takes it from there. The policy is in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md); the backlog of outside PRs it left
  is worked by [`contribution-model.md`](./contribution-model.md).
- **The process is written down precisely enough for an agent to execute.**
  It is not a tool bolted onto the repository. It is the repository's own
  contribution process, `AGENTS.md` plus the skills, loaded automatically by
  Claude Code, versioned and tested like code.
- **Nothing happens without an issue.** Every PR closes one, every issue is on
  the board, and the one thing that used to open PRs without an issue,
  Dependabot, now files issues instead.
- **A gate strict enough to trust.** `npm run local:gate` runs every check CI
  runs, for both languages, before anything is pushed.

As of 2026-10-07, in the nine days since the inception doc merged (#4861),
64 PRs have merged into `v2/main`, every one opened by a maintainer, and 173 of
their 181 commits carry an agent co-author trailer.

## Seven servers, two languages, one process

The repository holds seven reference servers: four in TypeScript, published to
npm and built as npm workspaces of one root, and three in Python, published to
PyPI as independent `uv` projects. Every server versions and publishes on its
own. That shape is what most of the adaptation from the Inspector was about:
every rule, gate and sweep here has to cover both ecosystems, per package and
across the repository.

## Two layers of documentation: rules and procedures

| Layer          | Where                                                     | Holds                                                                                                                       | Loaded                                                |
| -------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Rules**      | [`AGENTS.md`](../AGENTS.md)                               | The conventions a reviewer cites against a diff: branches, versions, dependencies, testing, protocol idioms, language rules | In full, at the start of every session                |
| **Procedures** | [`.claude/skills/*/SKILL.md`](../.claude/skills) (eleven) | Multi-step recipes with live commands and IDs: creating an issue, triage, board mechanics, the PR flow, releases            | On demand, when a description matches or by `/<name>` |

The split exists because the two fail differently. A skill loads conditionally
and can drop out of a long session's context when it is compacted, so a rule
that must never silently disappear lives in `AGENTS.md`. A recipe that can be
re-read from disk whenever it is needed lives in a skill.

| Skill               | Covers                                                                               | Invoked                |
| ------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| `project-structure` | Where each server registers its features, and where a new file goes                  | Model-invoked          |
| `local-dev`         | Building and running each server over each transport; worktrees; stale builds        | Model-invoked          |
| `testing`           | The in-process protocol-level harness, test placement, the per-file coverage gate    | Model-invoked          |
| `client-smoke`      | Driving a built server with the Inspector CLI, the Inspector UI, and an LLM client   | Model-invoked          |
| `issue-create`      | The create flow: labels, milestone, board card, Status and Priority                  | Model-invoked          |
| `issue-triage`      | Inflow onto the board as Incoming, the priority rubric, outside PRs, the board audit | Model-invoked          |
| `board-ops`         | `gh project` mechanics and IDs for the Servers V2 board; the option-deletion hazard  | Model-invoked          |
| `pr-flow`           | Branch, DCO signoff, the gate, client evidence, the Copilot review loop, close-out   | Model-invoked          |
| `pre-push-gate`     | Running `npm run local:gate` and fixing a red stage                                  | Model-invoked          |
| `security-advisory` | A privately reported vulnerability, from draft card to publication                   | Model-invoked          |
| `release`           | A milestone release: the preparation PRs, the merge to `main`, the ledger            | Name-only (`/release`) |

Whether a skill fires when it should is measured, not assumed:
`npm run skills:eval` runs committed cases against a real agent session and
scores the hit rate, and `verify:skills` (in the gate) parses every skill's
frontmatter the way Claude Code does and keeps the listing inside its budget.
[`skill-authoring.md`](./skill-authoring.md) is how a description gets tuned.

## Issue-driven work, end to end

There is one board, [Servers V2 (#43)](https://github.com/orgs/modelcontextprotocol/projects/43),
and two branches: `v2/main`, where all work lands, and `main`, the default
branch, which only receives milestone merges.

An issue's lifecycle:

1. **Filed and labeled**: `v2`, exactly one type label (`bug`, `enhancement`,
   `documentation`, `chore`, `question`), and a `server-<name>` scope label
   when it concerns one server.
2. **Boarded.** An issue a maintainer files through `issue-create` is approved
   by filing it, so it goes straight to a milestoned **Todo**. Anything else (an
   outside report, an issue filed by hand, an issue a scheduled sweep filed)
   arrives with no card until `issue-triage` sweeps it in: unmilestoned into
   **Incoming**, or into **Todo** if it already carries a milestone.
3. **Scored.** Priority is scored on a rubric (severity, urgency, small capped
   bonuses) and the arithmetic is posted as a comment, since the board is
   private and a reporter otherwise cannot see or contest it.
4. **Approved.** A maintainer assigns a milestone, which **is** the approval,
   and moves the card to Todo. `Incoming` ⇔ no milestone, and the board audit
   checks it.
5. **Worked.** The issue is assigned, its card moves to In Progress, and a
   branch `v2/<type>/<N>-<slug>` is cut from `origin/v2/main`.
6. **Sent for review.** The gate passes, every commit is signed off (DCO), and
   a PR opens against `v2/main` with `Closes #N` on its first line, linked to
   the issue explicitly (closing keywords only fire on the default branch).
   The card moves to In Review.
7. **Reviewed.** A Copilot review loop runs to convergence: every comment
   answered in its own thread, and scope creep declined with a reason, since
   every fix accepted beyond the issue is fresh surface for the next round.
8. **Merged.** The issue is closed by hand and its card moved to **Done**,
   which means the work shipped. A duplicate or won't-fix shipped nothing, so
   its card is deleted rather than parked in Done.

### How a working session starts

Nothing in the repository starts a session. A maintainer picks an item off the
board and opens a Claude Code session naming it:

```
/goal in a worktree, create a PR for #123
/goal create an issue for <problem description>
```

`/goal` keeps the session working until the goal is actually met, rather than
stopping at the first plausible attempt, which is what lets several sessions
run at once and be checked on later. Each works in its own git worktree.
Because several can reach the gate at once on one machine, the gate runs under
a machine-wide lease (`scripts/gate-lease.mjs`) and queues rather than racing.

## The quality gate

`npm run local:gate` is the mandatory pre-push command, and its exit code is
the verdict. It runs the fresh-install check, the DCO check, the root guards,
each TypeScript workspace's format, lint, typecheck, build and tests, each
Python server's locked sync, ruff, pyright, pytest and build, both languages'
per-file coverage gates, the pinned skills validator, and a boot smoke of
every server over each transport it implements. Among its rules:

- **Per-file coverage of at least 90**: on all four dimensions in TypeScript,
  and on lines and branches in Python. A genuinely unreachable branch is
  annotated at the source with its reason; the gate is never lowered.
- **No test may retry**, so a flaky test cannot pass on a second attempt.
- **Every action in a credentialed workflow job is pinned to a commit SHA**,
  with the release it came from in a comment (`verify:action-pins`).
- **A check added to CI is added to the local gate in the same change**, so
  "it passed locally" keeps meaning "CI will pass".

[`quality-gate.md`](./quality-gate.md) is the stage-by-stage reference.

## Releases

Versions change only in version PRs: the changesets "Version Packages" PR for
the TypeScript servers (semver) and the "Prepare Python Release" PR for the
Python ones (CalVer). A milestone ships through the `release` skill: the
preparation PRs on `v2/main`, then a pure merge of `v2/main` into `main`, then
a **release ledger** a maintainer reviews before publishing a GitHub Release,
which is what runs `release.yml`. Publishing is never a side effect of a merge.
[`RELEASING.md`](../RELEASING.md) has the details.

## Three sweeps replace Dependabot PRs

Dependabot used to be the one thing that opened PRs with no issue and no board
card, a standing exception to "every PR references an issue". Rather than keep
the exception, its PRs were switched off (`.github/dependabot.yml` deleted, and
the `automated-security-fixes` setting turned off) and replaced by scheduled
workflows that only ever **file issues**:

| Sweep             | Workflow → script                                   | Cadence | Files                                                                                    |
| ----------------- | --------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| Version updates   | `dependency-refresh.yml` → `dependency-refresh.mjs` | Monthly | One tracking issue: npm workspaces, each `uv.lock`, and each workflow action             |
| Security updates  | `dependabot-alerts.yml` → `dependabot-alerts.mjs`   | Daily   | One issue per vulnerable package per lockfile, npm and pip, re-checked against `v2/main` |
| SDK release watch | `sdk-watch.yml` → `sdk-watch.mjs`                   | Nightly | One issue per MCP SDK group behind (npm and PyPI), with an automated analysis comment    |

Every sweep issue still ends at an ordinary issue-driven PR; the sweeps remove
the "remembering to check" step, not the review. Each takes `--dry-run`, which
prints what it would file and writes nothing.

The SDK watch's analysis job runs a model over untrusted upstream text in
public CI, so it is constrained by capability rather than by prompt: it is
split into three jobs by permission (only the read-only one runs the model),
the model gets no shell at all, the release notes are fetched for it by a
deterministic step, and its output is scanned for credentials before it leaves
the job and again before it is posted. The Inspector arrived at that shape
after two narrower tool grants were each found exploitable, and this repository
kept it unchanged.

### Where the automation stops: the board

**No workflow can put an issue on the board.** Board #43 is an organization
project, and writing to it needs `organization projects: write`, a permission a
workflow's `GITHUB_TOKEN` cannot hold. So each sweep files its issue labeled
and milestoned, and a maintainer running `issue-triage` boards it.

The Inspector shows why this repository does not paper over that. Its alert
sweep shipped board-write code that read a `PROJECT_TOKEN` secret, and the
secret was never created, so the code never ran and every issue waited for
triage anyway (inspector#2547). It is now putting all its board automation on
one **GitHub App** credential (inspector#2543, #2544). This repository ships
no board-write code until that credential exists here; creating the App is an
org-admin act, tracked as #5061, along with teaching the sweeps to board what
they file. Until then, a sweep-filed issue sitting unboarded is the normal
outcome, not a failure.

## Security vulnerabilities: a separate, human-gated track

A privately reported vulnerability is tracked by a draft board card titled
with the bare advisory id, `[GHSA-xxxx-yyyy-zzzz]`, because a public issue
would disclose it before a fix exists. The `security-advisory` skill covers
checking whether the code is this repository's or the SDK's underneath, the
private fork the fix is built in, and turning the card into public tracking
once the advisory is published. **Accepting, closing and publishing an
advisory, and replying to its reporter, are human-only acts**, never automated
or bulk-applied.

## What makes it work

1. **Every piece of work is issue-linked and board-tracked**, so there is
   always a defined unit of work with a recorded approval, a priority and a
   release bucket.
2. **The gate predicts CI**, because it runs everything CI runs, for both
   languages, and a check added to one is added to the other.
3. **Rules and procedures are engineered for their own failure modes**: rules
   survive a compacted context, and procedures stay reachable through
   descriptions whose firing is measured.
4. **Automation that could bypass the review model was redesigned to file
   issues**, rather than carved out as an exception.
5. **Anything outward-facing or irreversible stays human-gated**: approving an
   issue, publishing a release, handling an advisory, creating the credential
   the board automation will need.
6. **The one model that runs in CI treats its input as hostile**, and is
   limited by job permissions and tool capability rather than by instructions.

## Where this is headed

The process is still maintainer-initiated, one issue per session. The
direction, as in the Inspector, is an orchestrator that pulls approved work
from the board, runs the sessions and merges the result after automated review
and QA, leaving a person two decisions: whether an issue is worth doing, and
whether a milestone is ready to release. None of that exists here yet. The
nearest step is the GitHub App (#5061), which lets the sweeps place their own
issues on the board instead of waiting for a triage pass.
