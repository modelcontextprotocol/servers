# Agentic software factory: inception

Inventory of the MCP Inspector's agentic software factory, a verdict on how
each part carries over to this repo, and the ordered sub-issues that build our
own. Tracker: [#4858](https://github.com/modelcontextprotocol/servers/issues/4858).
This doc: [#4859](https://github.com/modelcontextprotocol/servers/issues/4859).

**Sources, as read for this doc**

| Source | Revision |
| --- | --- |
| [inspector#2498](https://github.com/modelcontextprotocol/inspector/pull/2498), "MCP Inspector: Our AI Software Factory" (`docs/ai-software-factory.md`) | `102344f5` (open PR) |
| Inspector `v2/main`: `AGENTS.md`, `.claude/skills/*`, `scripts/*`, `.github/*`, `docs/quality-gate.md`, `docs/skill-authoring.md` | `64a50d6f` |
| This repo `v2/main` (identical to `main` at the time of writing) | `f46d9578` |

The Inspector moves fast. Where a sub-issue below says "copy X", re-read X on
the Inspector's `v2/main` at the time, not this doc's summary of it.

## Contents

1. [What the factory is](#1-what-the-factory-is)
2. [Inventory and verdicts](#2-inventory-and-verdicts)
3. [What only this repo needs](#3-what-only-this-repo-needs)
4. [Retiring `CLAUDE.md`](#4-retiring-claudemd)
5. [Decisions carried over from #4473](#5-decisions-carried-over-from-4473)
6. [Reusable templates](#6-reusable-templates)
7. [Existing issues to reconcile](#7-existing-issues-to-reconcile)
8. [Findings along the way](#8-findings-along-the-way)
9. [Proposed sub-issues](#9-proposed-sub-issues)
10. [Open questions for maintainers](#10-open-questions-for-maintainers)

## 1. What the factory is

The Inspector's factory is not a separate tool. It is the repo's contribution
process, written precisely enough for a coding agent to run it for long
stretches without a human confirming each step. It has four parts:

- **Rules (`AGENTS.md`).** Conventions a reviewer cites against a diff. It is
  loaded in full on every turn, so it survives auto-compaction and must be
  complete enough to work from on its own.
- **Procedures (`.claude/skills/*/SKILL.md`).** Multi-step recipes with live
  commands, IDs and gotchas. They load on demand, either by description match or
  by `/name`. Claude Code and the Copilot CLI both read the same directory.
- **A gate strict enough to trust.** `npm run local:gate` runs every check CI
  runs, plus one. A green local gate is the best available predictor of green
  CI, and that is what makes unattended runs reasonable.
- **Issue-driven tracking.** Every PR closes an issue, every issue is a card on
  the board, and anything automated (dependency bumps, SDK releases) files an
  issue instead of opening a PR.

A session starts with a maintainer's `/goal create a PR for #N`. It then runs
branch → gate → PR → Copilot review loop → merge → close-out, with the rules
and skills supplying every step.

The split between rules and skills follows how each one fails. A skill can drop
out of context in a long session, and its description may simply not fire. So
anything that must never silently disappear goes in `AGENTS.md`, and anything
that can safely be re-read from disk goes in a skill.

## 2. Inventory and verdicts

Verdicts:

- **Transfer:** copy it, changing only names, IDs and paths.
- **Adapt:** keep the intent but change the mechanics. The adaptation is named.
- **N/A:** doesn't apply here, with the reason.

The **Sub-issue** column points into [§9](#9-proposed-sub-issues).

### 2.1 Rules: `AGENTS.md` sections

| Section | What it does | Verdict | Adaptation / reason | Sub-issue |
| --- | --- | --- | --- | --- |
| Header: rules vs procedures | States that `AGENTS.md` holds the rules and skills hold the recipes | Transfer | — | S1 |
| Skills index | Table of every skill, what it covers, how it loads | Transfer | Our skill list (§9) | S1, then each skill PR |
| Project Structure | Annotated tree of the repo | Adapt | 7 servers × 2 languages; package name and registry for each server | S1 |
| Every file carries a purpose header | Each source file opens with a comment stating its purpose and rationale, so `AGENTS.md` never duplicates it | Adapt | Our source files don't follow this today (e.g. `src/filesystem/index.ts`, `src/time/src/mcp_server_time/server.py`). The adaptation is **no bulk migration**: new files, and files a PR substantially rewrites, get a header. It spreads as the refactor in #4857 touches each server | S1 |
| Development setup | Root `npm install`, build, dev loop | Adapt | npm workspaces for TS, `uv sync` per Python server. Node 22, Python ≥ 3.10 | S1 |
| Dependency placement (+ its rationale in `local-dev`) | Rules for a non-workspace multi-install repo: root-only runtime deps, bundler externals, vitest pin trio, lockstep | N/A | This repo **is** an npm workspace for its four TS servers, each with its own `package.json`. The three Python servers use `pyproject.toml`, and every server publishes independently. The few general rules survive as S1 rules: pin transitive deps with `overrides`, never `npm audit fix`; one version of a shared devDependency across workspaces | S1 (the survivors), S11 (`local-dev`) |
| Dependency updates are issue-driven | Dependabot PRs off; scheduled sweeps file issues | Adapt | npm **and** uv/PyPI **and** Actions ecosystems. Dependabot security-fix PRs are currently **on** here (§8) | S13 |
| Action pinning (#2484) | SHA-pin actions in credentialed jobs, enforced by `verify:action-pins` | Transfer | `release.yml` holds `id-token: write` in `publish-npm` / `publish-pypi`, and `claude.yml` holds `id-token: write` + `ANTHROPIC_API_KEY`. Lands with the release split, **before** the first milestone release | S12 |
| SDK watch (third sweep) | Nightly issue per MCP SDK release we're behind; a hardened LLM-in-CI `analyze` job | Adapt | Two SDKs, two registries (npm `@modelcontextprotocol/*`, PyPI `mcp`). The security posture carries over unchanged | S13 |
| Contributing | External contributors file issues, not PRs, including org members with write access | Transfer | **Decided (§10): outside PRs are turned off, as in the Inspector.** External contributors, including org members with write access, file issues; maintainers open PRs. The existing backlog (316 open outside PRs) is handled per S8 | S8 |
| Issue forms | Bug and feature forms, blank issues off, security routed to a private advisory | Adapt | Needs a server dropdown (7 servers) and a spec-era/client field. We have no forms today | S8 |
| Every PR references an issue | `Closes #N` first line; no issue-less PRs | Transfer | Until S13 retires them, Dependabot still opens issue-less PRs. So S1 states the rule with an **explicit temporary exception for Dependabot PRs**, and S13 removes that exception | S1, S6, S13 |
| Project Status and Direction | Branch table: `v2/main` develop, `main` release, `v1/main` maintenance | Adapt | No `v1/main` line here. `v2/main` develops and `main` releases (the default branch, and what users see) | S1 |
| Maintenance rules | Keep READMEs and `AGENTS.md` in sync; procedures change in their skill | Transfer | Plus per-server READMEs and `RELEASING.md` (#4473) | S1 |
| Maintaining the skills | `verify:skills`, `disable-model-invocation` explicit and defaulting to `false`, eval cases, listing budget, `paths` only when a skill is useless outside the matched files (with the trade-off stated in the PR) | Transfer | — | S2 (rules land with the harness) |
| Issue-driven Work Style | Board invariants: real issues only, labels, milestones, Priority, `Incoming` ⇔ unmilestoned, `Done` = shipped, branch naming, Copilot loop, manual close on `v2/main` | Adapt | One board (#43), not two. The version label is always `v2`. Type labels need `chore` (§8). Server-scope labels already exist | S1 (rules), S5–S7 (recipes) |
| Responding to Code Reviews | Judge against the issue, decline scope creep, reply in each thread, then a PR-level summary | Transfer | — | S1 |
| Always test new or modified code | Per-file ≥ 90 on all four dimensions, justified `v8 ignore`, test placement | Adapt | The TS half (all four dimensions) comes from #4854. The Python half (per-file lines and branches, the dimensions coverage.py measures) comes from #4855: coverage.py, justified `# pragma: no cover`, per-file script | S10 |
| Test-gate timeouts | Budgets in one place, no `retry`, no fixed sleeps, `timeout-minutes` per CI job | Adapt | Keep **no retry**, **no scaled sleeps** and **`timeout-minutes` on every job**. The shared-budget machinery is sized for 6 Vitest projects and a browser, so defer it | S10 |
| Mandatory pre-push gate | `npm run format`, then `npm run local:gate`; `validate` is not a substitute; gate lease | Adapt | A two-language gate: TS workspaces plus `uv` per server | S3, S4, S10 |
| Waiting on long-running work | Arm a notifier; never poll per turn | Transfer | — | S1 |
| Build output is never a gate target | Lint/format/typecheck read only first-party source | Transfer | `src/*/dist`, `src/*/coverage`, Python `dist/` and `.venv/` | S3, S4 |
| Lint has no warning tier | `--max-warnings 0`; `no-floating-promises` at error | Transfer | TS only. For Python, ruff has no warning tier, so a finding is a finding | S3 |
| TypeScript instructions | Never `any`, no config-level suppression, avoid double casts, no floating promises | Transfer | Plus the server idioms from `CLAUDE.md` (§4) | S1 |
| Web source layout (`lib` vs `utils`) | Web-client directory rule | N/A | No web client | — |
| React instructions | Mantine, hooks, state stores | N/A | No UI | — |
| Web backend auth token | The Inspector's proxy auth | N/A | No backend proxy | — |

### 2.2 Procedures: skills

| Skill | What it does | Verdict | Adaptation / reason | Sub-issue |
| --- | --- | --- | --- | --- |
| `board-ops` | `gh project` recipes for two boards; ID tables; resolving option IDs by name; the option-deletion hazard and its recovery | Adapt | One board, #43. Its fields: Status (with **Incoming**) and Priority. Hazard and recovery copy unchanged | S5 |
| `issue-create` | Five-step create flow: version label, type label, milestone, card, Status + Priority; duplicate check across all states | Adapt | Version label is always `v2`. Add a **server-scope label** step (`server-<name>`). Milestone = nearest due v2.x | S5 |
| `issue-triage` | Two-pass sweep (board as Incoming, then human approval), priority rubric with a score comment, 12-check board audit | Adapt | The **highest-leverage skill here** given the inflow (§3.4). Add spam/registry-redirect classes, server-scope labelling, and outside-PR triage | S7 |
| `pr-flow` | Assign + In Progress, branch naming, DCO signoff, screenshots, `Closes #N`, `addCloseIssueReferences`, In Review, Copilot loop to exhaustion, per-thread replies, manual close-out | Adapt | Board #43; branch `v2/<type>/<N>-<slug>`. **DCO: on, as in the Inspector** (decided, §10). S6 installs the DCO app and requires `git commit -s`. **Screenshots → client evidence**: for a server-facing change, Inspector and LLM-client transcripts in both spec eras; otherwise a targeted probe (§3.2). The Copilot loop copies unchanged | S6 |
| `pre-push-gate` | Running `local:gate`; diagnosing each stage | Adapt | Rewrite around our stages: TS workspaces, Python per server, per-file coverage both sides | S10 |
| `project-structure` | Where a file goes; who owns what | Adapt | Per-server layouts (e.g. `everything`'s `tools/`, `resources/`, `prompts/`, `transports/`) | S11 |
| `local-dev` | Install/run each client; dependency-placement reasoning | Adapt | Workspaces + `uv`; running each server over the transports it implements (stdio for all seven; `everything` also serves SSE and Streamable HTTP); `npx`/`uvx` local builds | S11 |
| `testing` | Test placement, commands, tiers, coverage gate, `renderWithMantine` | Adapt | In-process protocol harness (`Client` ↔ server over in-memory transport; `ClientSession` for Python), per #4854/#4855 | S11 |
| `test-servers` | Picking and running the Inspector's fixture MCP servers | Adapt | Inverted: here the servers are the product. The equivalent is **driving a server with a client**: Inspector V2 (web/CLI) and an LLM client, in both spec eras (#4857). Proposed name: `client-smoke` | S11 |
| `release` | Name-only. Two PRs (audit + bump on `v2/main`; milestone merge to `main`), a ledger artifact, then a human-published GitHub Release | Adapt | Two registries, per-package versions, CalVer (Py) vs semver/changesets (TS, #4472), `release` environment approvals | S12 |
| `security-advisory` | Private advisory flow: draft `[GHSA-…]` card, ownership check, accept, private fork, publish, public tracking. Accept and publish are human-gated | Adapt | One release line. **61 advisories are in `triage`**, and `SECURITY.md` says the repo is ineligible for reports (§8) | S9 |

### 2.3 Scripts and gates

| Element | What it does | Verdict | Adaptation / reason | Sub-issue |
| --- | --- | --- | --- | --- |
| `validate` (+ per-client `check`/`validate`) | Fast inner loop: guards, format:check, lint, typecheck, build, test | Adapt | Root `validate` over TS workspaces (#4473 design) plus a Python equivalent per server | S3, S4 |
| `local:gate` / `local:gate:stages` / `local:validate` | Mandatory pre-push command; every CI check plus local-only extras, run once instrumented | Adapt | Chains the TS and Python validate, per-file coverage (both languages), skills CLI check | S10 |
| `coverage` / `coverage:*` | Per-client `test:coverage` at 90/90/90/90 per file | Adapt | TS from #4854; Python from #4855 (coverage.py `fail_under` is global, so a per-file check script is needed) | S10 |
| `format` / `format:check:*` | Prettier across every scope | Adapt | Root Prettier for TS; `ruff format` for Python | S3, S4 |
| `lint:*` (`--max-warnings 0`) | ESLint flat config, type-aware | Adapt | Root flat config across workspaces; `ruff check` for Python (not run in CI today) | S3, S4 |
| `gate-lease.mjs` | Machine-wide FIFO lease so concurrent sessions' gates queue | Transfer | Our gates are cheaper, but concurrent sessions still contend. Also needed if any stage binds a fixed port (HTTP transport tests) | S10 |
| `lib/workflow-gate.mjs` (+ tests) | Keeps the local gate out of CI: no workflow may invoke a `local:*` script, and `local:gate` stays exactly the lease wrapper | Adapt | Same invariant for our `local:*` namespace; the Inspector's engine-pass specifics drop out | S10 |
| `verify:skills` / `verify:skills:cli` / `lib/skill-manifest.mjs` | Frontmatter parse, explicit invocation mode, eval cases, listing budget; `claude plugin validate` at a pinned CLI | Transfer | — | S2 |
| `skills:eval` (`skill-eval.mjs`, `lib/claude-cli.mjs`) | Runs each skill's eval cases headless (Claude or Copilot); trigger rate, chains, negatives | Transfer | — | S2 |
| `verify:format-coverage` | Every first-party file is format-gated | Adapt | Workspace globs; Python via ruff config | S3 |
| `verify:typecheck-coverage` | Every tracked TS file gets a `tsc` pass | Adapt | Per-workspace `tsconfig` (tests are excluded in some servers today) | S3 |
| `verify:action-pins` | Credentialed jobs use SHA pins with `# vX.Y.Z` | Transfer | — | S12 |
| `verify:test-timeouts` | Resolves every Vitest project's budgets; asserts no `retry` | Adapt | Keep the no-retry assertion only. Defer the budgets machinery until a timeout problem shows up | S10 |
| `verify:dep-lockstep` | One version per install-crossing dependency across 5 installs | Adapt | A single workspace lockfile can still resolve different versions per workspace, and the manifests already declare different ranges (e.g. `typescript` `^5.6.2` / `^5.8.2` / `^5.3.3`). The adaptation is a smaller guard: every **shared TS devDependency** (`typescript`, `vitest`, `@vitest/coverage-v8`, `prettier`, `@types/node`) is declared with one range across workspaces, or hoisted to the root. Python servers stay independent by design | S3 |
| `verify:install-fresh` | `node_modules` matches its lockfile | N/A | Single workspace install; `npm ci` in CI already enforces it | — |
| `verify:bundle-externals` / `verify:build-gate` | Bundler guards for tsup/Vite output | N/A | Servers compile with plain `tsc` | — |
| `smoke:*` (launcher/cli/tui/web/engines), `local:storybook` | Built-artifact smokes of the three clients | Adapt | Inverted: a **boot smoke per server over each transport it implements** (stdio for all; SSE and Streamable HTTP for `everything`), from the built `dist/` (TS) and console script (Py): connect, list, call one tool. Only a thin spawn test, per #4854/#4855 | S10, S11 |
| `pack:verify` (`pack-and-verify.mjs`) | Installs the exact publish tarball into a throwaway consumer and runs the bin | Adapt | Per package: `npm pack` → install → `npx` boot; `uv build` → install wheel → console-script boot | S12 |
| `install-clients.mjs`, `install-smoke-browser.mjs`, `run-engine-smokes.mjs`, `docker-healthcheck.mjs` | Inspector-specific install/browser/Docker helpers | N/A | No non-workspace installs, browsers or Docker healthcheck. Our Dockerfiles aren't published by CI | — |

### 2.4 CI and release workflows

| Element | What it does | Verdict | Adaptation / reason | Sub-issue |
| --- | --- | --- | --- | --- |
| `main.yml` → `build` | `validate`, skills CLI, build guards, smokes, Storybook | Adapt | `typescript.yml` / `python.yml` run the new `validate` (and ruff), keeping the per-package matrix | S3, S4 |
| `main.yml` → `coverage` (parallel job, #2159) | **CI enforces the per-file gate** | Adapt | See §7: #4854/#4855 say "coverage stays local, as in the Inspector", but the Inspector now enforces it in CI | S10 |
| `main.yml` → `package` / `publish` split (#2483) | Build and `pack:verify` in a job with no `id-token`; publish downloads the tarball only | Adapt | `release.yml` today builds and publishes in the same job as `id-token: write` | S12 |
| `main.yml` → GHCR image | Publishes a container | N/A | We don't publish images | — |
| `timeout-minutes` on every job | Hung-job guard sized from observed runs | Transfer | None of our jobs declare one | S10 |
| `dependency-refresh.yml` | Monthly: `npm outdated` + action majors → one tracking issue | Adapt | npm workspaces + `uv lock --upgrade --dry-run`-style check per Python server + actions | S13 |
| `dependabot-alerts.yml` | Daily: alerts → one issue per bump, re-checked against `v2/main` | Adapt | npm + pip ecosystems | S13 |
| `sdk-watch.yml` | Nightly SDK-release issues + hardened LLM analysis (3 jobs split by permission, no Bash, scanned artifact) | Adapt | Two SDK groups (TS `@modelcontextprotocol/sdk` → v2 packages; Python `mcp`) | S13 |

### 2.5 Board, labels, milestones, docs, session practice

| Element | What it does | Verdict | Adaptation / reason | Sub-issue |
| --- | --- | --- | --- | --- |
| Two boards (v2 #28, v1 #11) | One board per release line | Adapt | One board: **Servers V2 (#43)** | S5 |
| Status: Incoming → Todo → In Progress → In Review → Done | Approval-aware lifecycle | Transfer | #43 already has all five options | S5 |
| Priority field + rubric | Scored, with a posted comment | Transfer | #43 has Urgent/High/Medium/Low | S7 |
| Version labels `v1`/`v2` | Line routing | Adapt | Only `v2`; it marks work tracked by the factory | S5 |
| Type labels (5) | Exactly one per issue | Adapt | `bug`/`enhancement`/`documentation`/`question` exist; **`chore` is missing** | S5 |
| Milestones = release buckets | `Incoming` ⇔ unmilestoned | Transfer | `v2.0.0`, `v2.1.0` exist | S5, S7 |
| `docs/ai-software-factory.md` | The overview for humans | Adapt | Write ours once the pieces exist, after Wave 6's automation lands | S13 (closing doc task) |
| `docs/quality-gate.md` | Canonical CI-vs-local split | Adapt | Two languages | S10 |
| `docs/skill-authoring.md` | How to write a description that fires; eval-case design | Transfer | — | S2 |
| `.claude/settings.json` | Enables the Playwright plugin | Adapt | Not for our own code, which has no UI, but `client-smoke` drives the Inspector V2 **web** client, which needs browser automation. S11 enables the plugin, or documents the Inspector CLI as the scripted path and the web client as the hand-driven one | S11 |
| `/goal` session start | Persistent sessions, one per issue | Transfer | Practice, not a file. Documented in the closing factory doc | — |
| Copilot review loop | Request via `requestReviews` (bot id `BOT_kgDOCnlnWA`), wait, answer, repeat until one clean round | Transfer | — | S6 |
| `Co-Authored-By` trailer | Attributes agent-authored commits | Transfer | — | S6 |

Board #43 also had a **Size** field (XS–XL) with no Inspector counterpart. It held no values and has been **deleted** (decided, §10).

## 3. What only this repo needs

### 3.1 Seven servers, two languages

- **Gates at two levels.** Every gate runs **per package** (CI already matrixes
  over packages) and **across the workspace** (one root command runs all of
  them). A Python server has no npm workspace, so the root gate orchestrates
  `uv` per server. `local:gate` is the one command for everything.
- **Python equivalents of every TS gate:**

  | TS gate | Python equivalent |
  | --- | --- |
  | `prettier --check` | `ruff format --check` |
  | `eslint --max-warnings 0` | `ruff check` (not in CI today) |
  | `tsc` | `pyright` (in CI) |
  | `vitest` | `pytest` (+ `pytest-asyncio`) |
  | `vitest --coverage` with per-file 90 | `pytest --cov` + branch coverage + a per-file check script (#4855) |
  | `verify:format-coverage` | ruff `include`/`exclude` reviewed so no first-party file drops out |

- **Per-file coverage in Python.** coverage.py's `fail_under` is global. #4855
  owns the check script (`coverage json` → fail any file below threshold, same
  semantics as the TS gate). The factory wires it into `local:gate` and CI.

### 3.2 Server-oriented testing

- **Protocol-level client harnesses, in-process**: an SDK `Client` (TS) or
  `ClientSession` (Py) over an in-memory transport, asserting on the wire. This
  is the design of #4854/#4855, and the `testing` skill (S11) documents it.
- **Client smoke tests in both spec eras**, per #4857: every change to
  **server behavior** is checked against a 2026-07-28 client and a 2025-11-25
  client, using **both** the Inspector V2 and an LLM client. This replaces the
  Inspector's screenshot rule. Instead of images, a server-facing PR carries
  **client evidence**: what each client was asked to do, and what it returned.
  A change with no client-observable surface (docs, skills, workflows, gate
  tooling) instead carries a **targeted probe**, as the Inspector's ledger
  allows: the thing that proves it, such as a guard made to fire or a
  before/after run. That gives the `client-smoke` skill (S11) and the
  `pr-flow` evidence step (S6).
- **Interface-diff CI** (#4860) gives interface-level evidence that a change
  is transparent. The gate sub-issue (S10) wires it in once #4860 lands.

### 3.3 Release and publish

- **`v2/main` → `main` milestone merges.** Same shape as the Inspector: bump on
  `v2/main` first, a pure merge PR, then the human release step.
- **Two registries, both on OIDC trusted publishing.** npm is bound to
  `release.yml` + environment `release` (#4463); PyPI uses
  `pypa/gh-action-pypi-publish` with `skip-existing`.
- **Per-package versions.** The Inspector has one version; we have seven.
  Today everything is CalVer, stamped at release time by `scripts/release.py`.
  #4472 moves TS to semver via changesets and keeps Python on CalVer, stamped
  by a `prepare-release` PR. The milestone-release flow (S12) is written
  against #4472's end state, so **#4472 lands first**.
- **Only changed packages publish.** Change detection by file extension since
  the last tag, today. Under #4472 it becomes a registry diff.

### 3.4 Triage under heavy community inflow

At the time of writing there are **245 open issues and 316 open PRs**, nearly
all from outside contributors. There are several distinct spam and misdirected
classes:

- "Add my server to the README / `ADDITIONAL.md`" PRs. `readme-pr-check.yml`
  already labels and redirects README-only PRs.
- New server implementations, which go to the
  [Registry](https://github.com/modelcontextprotocol/registry).
- Renames and no-op PRs (e.g. "Rename README.md to README.md").
- Duplicate fixes: several outside PRs often race for the same bug (e.g.
  #4809 and #4810).

`issue-triage` (S7) needs a class and a canned response for each, plus
server-scope labelling. The Inspector has neither, because it has no public
PR inflow. Outside PRs are being turned off (S8, §10), so the triage recipe's
PR half is short: close an outside PR with a pointer to the issue flow, after
harvesting anything worth doing into an issue.

### 3.5 Security advisories for servers with real reach

`filesystem`, `git` and `fetch` read and write the local disk, run git, and
make outbound requests. Advisories are real and frequent here (§8). The
`security-advisory` skill (S9) has to cover:

- **Ownership:** is it this repo's server, or the SDK underneath (route it to
  the SDK repo)?
- **Reach classes:** path traversal, symlink escape and Roots bypass
  (`filesystem`, `git`); SSRF and robots bypass (`fetch`).
- **The reference-implementation caveat.** `SECURITY.md` currently tells
  reporters this repo is ineligible, which contradicts the enabled private
  reporting and the 61-advisory backlog.

## 4. Retiring `CLAUDE.md`

`CLAUDE.md` will be **deleted**, with no pointer file left behind. Claude Code
reads `AGENTS.md` directly. S1 verifies this in a fresh session before
deleting. Every section goes somewhere:

| `CLAUDE.md` section | Destination | Sub-issue |
| --- | --- | --- |
| Project Overview | `AGENTS.md` intro (one paragraph: what this repo is, the rules-vs-skills split) | S1 |
| Monorepo Structure (7 servers, package names, registries) | `AGENTS.md` **Project Structure**: annotated `src/` tree with package name + registry per server. The fuller per-server map goes to the `project-structure` skill | S1, S11 |
| Build & Test Commands (TS) | `AGENTS.md` **Development setup** (the short form). The rest goes to the `local-dev` skill. `validate` / `local:gate` rules are added when S3 / S10 land | S1, S3, S10, S11 |
| Build & Test Commands (Python) | Same as TS: `uv sync --frozen --all-extras --dev`, `uv run pytest` / `pyright` / `ruff check .`. Hatchling / `uv build` go to `local-dev` | S1, S4, S11 |
| Code Style: TypeScript | `AGENTS.md` **TypeScript instructions**: the Inspector's rules plus our server idioms (ESM `.js` suffixes, Zod input schemas, naming, verb-first kebab-case tool names, import grouping). **2-space / trailing commas** become Prettier config and drop out of prose | S1, S3 |
| Code Style: Python | `AGENTS.md` **Python instructions**: pyright-clean type hints, ruff, async/await + `pytest-asyncio`, per-server module layout | S1 |
| Contributing Guidelines (accepted / selective / not accepted) | `AGENTS.md` **Contributing**, linking `CONTRIBUTING.md` rather than duplicating it. Rewritten for the issues-only policy (§10) | S1, S8 |
| CI/CD Pipeline (dynamic package detection, test → build → publish) | **Dropped** from `AGENTS.md` as derivable: the workflows describe themselves. The CI-vs-local split goes to `docs/quality-gate.md`; release goes to `RELEASING.md` + the `release` skill. (The "publish on release events" line is already stale: `release.yml` is dispatch-only, #4466) | S10, S12 |
| MCP Protocol Reference (`.mcp.json` docs server, schema repo) | `AGENTS.md`: a two-line rule to look protocol questions up via the `mcp-docs` server, with a link to the schema repo | S1 |
| Key Patterns: `registerTools`/`registerResources`/`registerPrompts` | `AGENTS.md` TS instructions (the rule). Where each server keeps them goes to `project-structure` | S1, S11 |
| Key Patterns: tool annotations | `AGENTS.md` (rule: set `readOnlyHint`, `idempotentHint`, `destructiveHint` on every tool) | S1 |
| Key Patterns: transports | `AGENTS.md`: stdio default, Streamable HTTP; **HTTP+SSE is deprecated** (still deprecated, not removed, in the 2026-07-28 spec, #4857) | S1 |
| Key Patterns: PR template checklist | `AGENTS.md` Contributing (MCP docs read, security practice, tested with an LLM client). The evidence step goes to `pr-flow` | S1, S6 |

`src/everything/AGENTS.md` (a per-server guide) also exists. S1 decides its
fate: move its generic style rules into the root file, keep its
extension-point guidance next to the server, and check whether a nested
`AGENTS.md` is picked up at all.

## 5. Decisions carried over from #4473

#4473 is closed and superseded by #4859. Each decision it recorded is mapped
here.

| #4473 decision | Where it goes | Note |
| --- | --- | --- |
| Reference is the Inspector's `v2/main` `AGENTS.md`, not `main` | S1 | — |
| Tool-agnostic rules, one document | S1, S2 | S2's eval runs against both Claude and Copilot (`AGENT=copilot`) |
| Project Structure: annotated `src/` tree with package name + registry | S1 | — |
| Development setup / build & test commands | S1, S11 | — |
| Repository & board: repo, base branch, single board #43 | S1 | **Base branch is `v2/main`**, not `main` (#4473 predates the `v2/main` flow) |
| `gh` recipes + stable-ID table | **S5 (`board-ops`), not `AGENTS.md`** | The Inspector keeps IDs in exactly one place, the skill, and resolves option IDs **by name** at run time, because option IDs change whenever the option list is edited. The #4473 table is also incomplete: it lacks **Incoming** (`9f267269`) and **Priority** |
| Issue-driven work style (created = labelled + boarded + Status; issues only; no drafts; dedupe; assign; status flow; `Closes #N` first line; new work → new issues) | S1 (rules), S5, S6 (recipes) | On `v2/main`, `Closes #N` does **not** auto-close. Close by hand, move to Done, and link with `addCloseIssueReferences` |
| Maintenance rules (READMEs, per-server READMEs, `RELEASING.md`, `AGENTS.md`; link, don't duplicate) | S1 | — |
| Always test new or modified code | S1 (baseline), S10 (the per-file 90 rule) | #4473's "no 90% gate on day one" is superseded by #4854/#4855 |
| Responding to code reviews (verbatim etiquette) | S1, S6 | — |
| Root Prettier + ESLint flat config; root `validate` = `format:check` → `lint` → `build` → `test`; format before commit, validate before push; CI runs `validate` | S3 | `validate` becomes the inner loop, and the push rule later becomes `local:gate` (S10) |
| Python equivalent documented per server | S4 | Upgraded from "documented" to "run in CI" (ruff isn't run in CI today) |
| TypeScript instructions + server idioms | S1 | `no-floating-promises` at error lands with S3 |
| Python instructions | S1 | — |
| Contribution boundaries + PR checklist | S1, S8 | — |
| Omit React/Mantine and web-auth-token sections | — | Confirmed N/A (§2.1) |

## 6. Reusable templates

Inspector files that can be copied in as starting points (paths on its
`v2/main`), and the edits each needs.

| Inspector file | Copy to | Edits needed | Sub-issue |
| --- | --- | --- | --- |
| `AGENTS.md` | `AGENTS.md` | Keep: header, Skills index, Maintenance rules, Maintaining the skills, Issue-driven Work Style, Responding to Code Reviews, Waiting on long-running work, Build output is never a gate target, Lint has no warning tier, TypeScript instructions. Rewrite: Project Structure, Development setup, Project Status (drop `v1/main`), Contributing. Drop: Dependency placement (keep the `overrides` rule), web layout, React, auth token, SDK-watch internals (they belong in the workflow's own comments). Add: Python instructions, MCP server idioms, protocol lookup | S1 |
| `.claude/skills/board-ops/SKILL.md` | same | Board #43 only; Status/Priority; drop #11 and the dual-Priority-field section; keep the option-deletion hazard and recovery verbatim | S5 |
| `.claude/skills/issue-create/SKILL.md` | same | `--repo modelcontextprotocol/servers`; no v1 rows; add a server-scope label step; `chore` type | S5 |
| `.claude/skills/issue-triage/SKILL.md` | same | One board; the rubric's severity axis reworded for servers ("reports something false about the protocol", "escapes an allowed root"); add spam/registry/duplicate-PR classes; audit checks for one board. **Update the total-issue-count `--limit`** (this repo has far more issues than 884) | S7 |
| `.claude/skills/pr-flow/SKILL.md` | same | Repo, board 43, branch naming; keep DCO (adopted, §10); drop screenshots; add client evidence; the Copilot loop copies as is | S6 |
| `.claude/skills/pre-push-gate/SKILL.md` | same | Rewrite the stage list for our gate; keep "verify by exit code, not by grepping" and "waiting on the lease" | S10 |
| `.claude/skills/release/SKILL.md` | same | Two registries; per-package versions; changesets / CalVer; the `release` environment approvals; keep the two-PR shape, "bump on `v2/main` first", "never back-merge `main`" and the ledger | S12 |
| `.claude/skills/security-advisory/SKILL.md` | same | One line (no v1 path); server reach classes; SDK routing | S9 |
| `.claude/skills/*/evals/evals.json` | same | Rewrite the prompts in our terms; keep ≥ 5 positives + negatives per model-invoked skill | S2 and each skill PR |
| `scripts/verify-skills.mjs`, `scripts/verify-skills-cli.mjs`, `scripts/skill-eval.mjs`, `scripts/lib/skill-manifest.mjs`, `scripts/lib/claude-cli.mjs` (+ their `*.test.mjs`) | `scripts/` | Paths and skill list; a budget recomputed for our skill set | S2 |
| `scripts/gate-lease.mjs` (+ test) | `scripts/` | Env var rename (`SERVERS_SKIP_GATE_LEASE`) | S10 |
| `scripts/lib/workflow-gate.mjs` (+ test) | `scripts/lib/` | Our workflow list and `local:*` scripts; drop the browser-engine rationale | S10 |
| `scripts/verify-format-coverage.mjs`, `scripts/verify-typecheck-coverage.mjs` | `scripts/` | Workspace globs instead of `clients/*` | S3 |
| `scripts/verify-action-pins.mjs` | `scripts/` | Workflow list | S12 |
| `scripts/dependency-refresh.mjs`, `scripts/dependabot-alerts.mjs`, `scripts/sdk-watch.mjs` + workflows | `scripts/`, `.github/workflows/` | Add the uv/PyPI ecosystem; SDK groups for TS and Python; board #43; labels | S13 |
| `docs/skill-authoring.md` | `docs/` | Paths only | S2 |
| `docs/quality-gate.md` | `docs/` | Rewrite for two languages; keep the structure (tiers table, local-only steps, lease) | S10 |
| `.github/ISSUE_TEMPLATE/*` | same | Server dropdown, spec-era/client fields, registry redirect in `config.yml` | S8 |
| `.github/pull_request_template.md` | same | Depends on the contribution-model decision | S8 |
| `.github/workflows/main.yml` (`coverage` job, `package`/`publish` split, `timeout-minutes`) | `typescript.yml`, `python.yml`, `release.yml` | Patterns only, not the file | S10, S12 |

## 7. Existing issues to reconcile

| Issue | Decision |
| --- | --- |
| **#4472**: release Phase 2, changesets (TS) + GitHub-Release-triggered publishing | **Fold in as a sub-issue of #4858, unchanged in scope, in Wave 5.** It is the versioning and publish half of the release flow; the milestone-merge half is new (S12) and depends on it. Two notes to add to #4472: it lands on `v2/main` like everything else, and its `release: [published]` trigger must fire from `main` after a milestone merge. |
| **#4854 / #4855**: per-file 90% coverage, TS / Python | **Stay under #4857** (they're the refactor's regression net). The factory depends on them and doesn't duplicate them: S10 wires their `coverage` commands into `local:gate` and CI and writes the `AGENTS.md` coverage rule (their carry-over task). **One correction to feed back:** both said the coverage gate stays local "following the Inspector", but the Inspector's CI now runs `coverage` as a parallel job (#2159). **Decided (§10): CI enforces coverage here too**, and #4854/#4855 are amended to match. |
| **#4857**: 2026-07-28 spec refactor tracker | Unchanged. Its "verify against both eras with the Inspector and an LLM client" rule becomes the `client-smoke` skill (S11) and the `pr-flow` evidence step (S6). |
| **#4860**: interface-diff CI for `everything` | Unchanged. S10 includes it in the gate once it lands. |
| **#4473**: `AGENTS.md` plan | Closed, superseded by #4859. Every decision is mapped in §5. |

## 8. Findings along the way

Facts discovered while writing this doc. Each is owned by a sub-issue.

1. **Dependabot security-fix PRs are enabled** (`automated-security-fixes:
   enabled`), and `.github/dependabot.yml` opens weekly Actions PRs. Both are
   issue-less PRs, the exception the Inspector removed. → S13.
2. **Private vulnerability reporting is on, with 61 advisories in `triage`**
   (6 published, 2 closed). Meanwhile `SECURITY.md` tells reporters the repo is
   "not eligible for security vulnerability reporting". → S9.
3. **`ruff` is a dev dependency of every Python server but is not run in CI.**
   → S4.
4. **No `chore` label.** The five-type taxonomy needs it. → S5.
5. **No issue forms.** Blank issues are the only path. → S8.
6. **No DCO app is installed**, so the Inspector's signoff rule has nothing to
   enforce it. DCO is adopted (§10). → S6.
7. **No CI job declares `timeout-minutes`.** → S10.
8. **`release.yml` builds, installs and publishes in the job holding
   `id-token: write`.** The Inspector split these after #2483. → S12.
9. **`CLAUDE.md`'s CI/CD section describes publish-on-release, which is gone.**
   `release.yml` is dispatch-only since #4466. → S1 (dropped section).

## 9. Proposed sub-issues

The sub-issues now exist under #4858. The S-ids used throughout this doc map to them as follows. #4472 sits in Wave 5, between S11 and S12, as Part 13.

| Id | Issue | Title prefix |
| --- | --- | --- |
| S1 | #4862 | Part 2 |
| S2 | #4863 | Part 3 |
| S3 | #4864 | Part 4 |
| S4 | #4865 | Part 5 |
| S5 | #4866 | Part 6 |
| S6 | #4867 | Part 7 |
| S7 | #4868 | Part 8 |
| S8 | #4869 | Part 9 |
| S9 | #4870 | Part 10 |
| S10 | #4871 | Part 11 |
| S11 | #4872 | Part 12 |
| S12 | #4873 | Part 14 |
| S13 | #4874 | Part 15 |

Each targets **`v2/main`**, carries the `v2` label and a milestone, and sits on
the Servers V2 board (#43). "After" means the listed issue must merge first.

```
W1  #4859 inception (this doc)
W2  S1 AGENTS.md · S2 skills harness · S3 TS validate · S4 Py validate
W3  S5 board-ops + issue-create · S8 contribution model · S9 security-advisory · then S6 pr-flow (after S5) and S7 issue-triage (after S5, S8)
W4  S10 local:gate + coverage + pre-push-gate (after S2, S3, S4, #4854, #4855) · S11 knowledge skills (after S2)
W5  #4472 changesets + Release-triggered publish → S12 milestone release flow + release skill (after #4472, S10, S11)
W6  S13 dependency & SDK sweeps replace Dependabot PRs; closing factory overview
```

### Wave 2: rules and scaffolding (parallel)

**S1 (#4862). `AGENTS.md`: the absolute rules; delete `CLAUDE.md`**
- Scope: write `AGENTS.md` from the Inspector's template (§6), holding only
  rules that are **true on the day it merges**. A rule whose machinery doesn't
  exist yet (`validate`, `local:gate`, per-file coverage) is added by the
  sub-issue that builds it. Map every `CLAUDE.md` section per §4 and every
  #4473 decision per §5. Settle `src/everything/AGENTS.md`. Delete
  `CLAUDE.md`.
- Acceptance:
  - `AGENTS.md` exists at the root; `CLAUDE.md` is deleted and no pointer file
    remains.
  - Every row of §4 and §5 marked S1 is present.
  - A fresh Claude Code session in the repo demonstrably follows an
    `AGENTS.md`-only rule, recorded in the PR.
  - The skills index lists only skills that exist; later skill PRs add their
    own rows.

**S2 (#4863). Skills infrastructure: `.claude/skills/`, `verify:skills`, `skills:eval`**
- Scope: port `verify-skills`, `verify-skills-cli`, `skill-eval` and their
  libs and tests (§6); root npm scripts; `docs/skill-authoring.md`. Add the
  "Maintaining the skills" rules to `AGENTS.md` (or to S1, if S1 hasn't
  merged).
- Acceptance:
  - The ported verifier keeps its **"no skills found" failure**. Because S2
    lands before any skill, it ships with an explicit, temporary bootstrap
    allowance for an empty `.claude/skills/`, and the **first skill PR
    removes it**: whichever of the skill-adding issues (S5, S6, S9, S10,
    S11) lands first. That removal is an acceptance criterion of each of
    them.
  - `npm run verify:skills` fails on a fixture with malformed frontmatter or a
    missing `disable-model-invocation`.
  - `npm run skills:eval` runs against Claude, and against Copilot with
    `AGENT=copilot`.
  - `verify:skills` runs in CI.

**S3 (#4864). TypeScript workspace gate: Prettier, ESLint, root `validate`, CI**
- Scope: the #4473 design. Root Prettier config and `format` /
  `format:check`; a root ESLint flat config, type-aware, `--max-warnings 0`,
  `no-floating-promises` at error, build output ignored. A **per-workspace
  `validate`** script in each TS server (`format:check` → `lint` → `build` →
  `test`, for that package only), and a root `validate` that **aggregates**
  them (`npm run validate --workspaces`) plus any root-only guards.
  `verify:format-coverage` and `verify:typecheck-coverage` adapted.
  `typescript.yml` keeps its per-package matrix, and each leg runs **only its
  own package's** `validate` rather than the whole monorepo. A separate
  **root-guards CI job** runs what no package leg covers: the root `format`
  and `lint` of root files, `verify:format-coverage`,
  `verify:typecheck-coverage`, and the shared-devDependency version guard
  adapted from `verify:dep-lockstep` (§2.3). Add the format/lint/validate
  rules to `AGENTS.md`. If S1 hasn't merged yet, hand these rules to S1
  instead, the same fallback as S2.
- Acceptance:
  - `npm run validate` passes on a clean checkout, and so does
    `npm run validate -w <package>` for each server.
  - Each CI matrix leg gates only its own package, and the root-guards job
    gates the rest.
  - CI fails a PR with a formatting or lint finding in a package or a root
    file, or with a divergent shared devDependency range.
  - `everything`'s per-package Prettier setup is folded into the root one.

**S4 (#4865). Python gate parity**
- Scope: for each of `fetch`, `git`, `time`: `ruff check`, `ruff format
  --check`, `pyright`, `pytest` and `uv build` (CI already gates the build),
  with a single per-server `validate`
  entry (a `uv run` chain, or a `scripts/` helper called from the root). A
  root `npm run validate:py` (or equivalent) runs all three. `python.yml` runs
  ruff. Add the Python rules to `AGENTS.md`. If S1 hasn't merged yet, hand
  them to S1 instead, the same fallback as S2.
- Acceptance:
  - One root command gates all Python servers.
  - CI fails on a ruff or format finding.
  - Existing findings are fixed, not suppressed through config.

### Wave 3: work-tracking and security skills (after S1, S2)

Whichever skill-adding issue merges first (S5, S6 or S9 here, or S10 or S11
in Wave 4) also removes S2's empty-skills bootstrap allowance. That is part of
each one's acceptance.

**S5 (#4866). `board-ops` and `issue-create` skills; label taxonomy**
- Scope: adapt both skills (§6). Create the `chore` label. Board #43's Size field
  is already deleted (§10), so the create flow sets only Status and Priority. Server-scope labels (`server-<name>`) are part of
  create **where the issue concerns one server** (repo-wide issues carry
  none). Board #43's IDs live **only** in `board-ops`, and option IDs are
  resolved by name.
- Acceptance:
  - Filing an issue through the skill yields labels (`v2` + type, plus a
    scope label when one applies),
    milestone, card, Status and Priority, verified by a query in the PR.
  - Eval cases pass the threshold.
  - The skills index is updated.

**S6 (#4867). `pr-flow` skill** (after S5, whose `board-ops` it uses)
- Scope: adapt §6. Branch `v2/<type>/<N>-<slug>` from `origin/v2/main`;
  assign and move to In Progress; the gate; `Closes #N` on the first line;
  `addCloseIssueReferences`; In Review; the Copilot review loop to exhaustion;
  per-thread replies plus a PR summary; manual close and Done on merge. A
  **client-evidence** step replaces screenshots (§3.2). **DCO is on** (§10):
  install the DCO app, sign off every commit with `git commit -s`, and add the
  signoff rule to `AGENTS.md` once the app enforces it.
- Acceptance:
  - The DCO app is installed and fails a PR with an unsigned commit.
  - A PR taken end to end through the skill.
  - The loop's exits (clean round / out-of-scope only / two silent rounds /
    timeout) documented.
  - Eval cases pass the threshold.

**S7 (#4868). `issue-triage` skill and board audit, for community inflow** (after
S5 and S8)
- Scope: adapt §6. Two-pass sweep (Incoming → approval), rubric with a posted
  score comment, the board audit. Add triage classes for server submissions,
  README/`ADDITIONAL.md` listing PRs, new-server implementations, duplicate
  racing fixes and no-op PRs, each with a canned response and close/label
  action. With outside PRs off (§10), every outside PR gets the same close
  with a pointer to the issue flow. Fold in `readme-pr-check.yml`'s behavior.
- Acceptance:
  - A triage pass over the current open backlog runs, and the audit prints all
    zeros afterwards.
  - Each spam class has a documented response.
  - Eval cases pass the threshold.

**S8 (#4869). Contribution model: outside PRs, `CONTRIBUTING.md`, templates, issue forms**
- Scope: **decided (§10): outside PRs are turned off, as in the Inspector.**
  External contributors, org members with write access included, file
  detailed issues (sharing the prompt they used, not a diff), and maintainers
  open every PR. Make `CONTRIBUTING.md`, `AGENTS.md`'s Contributing section,
  the PR template (the Inspector's "issues, not PRs" banner) and new issue
  forms (bug / feature, with a server dropdown and spec-era field; security →
  private advisory; new-server → Registry) say so. Decide how the open
  outside-PR backlog is handled (for example, close each with a pointer to the
  issue flow, filing an issue for any fix worth keeping); S7's triage pass
  carries it out.
- Acceptance:
  - The decision is recorded on the issue.
  - The docs and templates match it.
  - Forms are validated against GitHub's schema (they only go live after the
    next milestone merge to `main`).

**S9 (#4870). `security-advisory` skill; reconcile `SECURITY.md` and the advisory backlog**
- Scope: adapt §6: draft `[GHSA-…]` card, ownership check (this server vs the
  SDK), accept/reject, private fork, fix, publish, public tracking. **Accept
  and publish stay human-only.** Rewrite `SECURITY.md` so it matches the
  enabled private reporting. Plan how the 61-advisory triage backlog is worked
  (the plan only, not the triage itself).
- Acceptance:
  - The skill merged with eval cases.
  - `SECURITY.md` is consistent with repo settings.
  - A backlog-triage issue is filed.

### Wave 4: quality gate and knowledge skills

**S10 (#4871). `local:gate`, per-file coverage in CI, `pre-push-gate` skill** (after
S2, S3, S4, #4854, #4855)
- Scope: root `local:gate` (under `gate-lease`) chaining the TS and Python
  validate, `verify:skills:cli`, per-file coverage for both languages, a thin
  per-server boot smoke over each transport the server implements (stdio for all seven; SSE and Streamable HTTP for `everything`), and #4860's interface diff
  once landed. `workflow-gate` ported, so no workflow can invoke a
  `local:*` script. CI runs coverage as a **parallel job** (§7). `timeout-minutes`
  on every job. No test retries (asserted). `docs/quality-gate.md`. The
  `pre-push-gate` skill. The `AGENTS.md` rules: mandatory pre-push gate, and
  the per-file ≥ 90 coverage rule with justified ignores (the carry-over from
  #4854/#4855). For TypeScript that is all four Vitest dimensions (lines,
  statements, functions, branches). For Python it is the per-file metrics
  coverage.py measures, **lines and branches**: coverage.py has no native
  function dimension, so the rule doesn't invent one.
- Acceptance:
  - `npm run local:gate` runs every check CI runs.
  - A PR dropping any file below 90 fails CI.
  - Concurrent gates queue.
  - Skill eval cases pass.

**S11 (#4872). Knowledge skills: `project-structure`, `local-dev`, `testing`, `client-smoke`**
- Scope: adapt §6. `testing` documents the in-process harnesses from
  #4854/#4855. `client-smoke` drives a server with Inspector V2 and an LLM
  client in both spec eras (#4857). Driving the Inspector's **web** client
  needs browser automation, so this issue also enables the Playwright plugin
  in `.claude/settings.json`, or documents the Inspector CLI as the scripted
  path and the web client as the hand-driven one.
- Acceptance:
  - Four skills merged with eval cases.
  - A full `skills:eval` re-run shows no regression in the skills that
    already exist.

### Wave 5: release

**#4472. changesets (TS) + GitHub-Release-triggered publishing**: folded in
with its scope unchanged (§7). Its two bump PRs are why S12's preparation step
is more than one PR.

**S12 (#4873). `v2/main` → `main` milestone release flow and `release` skill** (after
#4472, S10, S11; the ledger uses S11's `client-smoke`)
- Scope:
  - The preparation PRs, all on `v2/main`: the audit report (npm and
    `uv`/pip) with any fixes it forces, plus the bumps. #4472 makes the bumps
    **two separate PRs**, the changesets "Version Packages" PR for TS and the
    `prepare-release` CalVer PR for Python, so a milestone touching both
    ecosystems has up to three preparation PRs rather than the Inspector's
    one. All of them merge before the merge PR opens.
  - The merge PR: a pure `v2/main` → `main` merge whose tree hash matches
    `origin/v2/main`, with a release ledger artifact: `local:gate`,
    per-package `pack:verify`, each server-facing milestone issue exercised
    via `client-smoke`, and a targeted probe for each issue with no client
    surface (§3.2).
  - The maintainer publishes the GitHub Release.
  - Split `release.yml` so build and verify run without `id-token`.
  - **Pin actions in every credentialed job before the first release through
    this flow**, with `verify:action-pins` enforcing it: `release.yml`'s
    publish jobs, **every job whose artifact a credentialed job downloads**
    (the build/pack jobs the split introduces), and `claude.yml`
    (`id-token: write`, `ANTHROPIC_API_KEY`). Add the `AGENTS.md`
    SHA-pinning rule.
  - The `release` skill (name-only).
  - `RELEASING.md` rewritten for the merged state.
- Acceptance:
  - `verify:action-pins` passes, and fails on a tag-pinned action in any
    credentialed or artifact-producing job.
  - One milestone released end to end through the skill.
  - The ledger is linked from the merge PR.

### Wave 6: automation

**S13 (#4874). Replace Dependabot PRs with issue-filing sweeps; SDK watch; the factory overview**
- Scope:
  - Turn off automated security-fix PRs (a repo setting) and delete
    `dependabot.yml`; keep alerts on.
  - Add `dependency-refresh` (monthly; npm workspaces, each `uv.lock`,
    Actions) and `dependabot-alerts` (daily; npm + pip, re-checked against
    `v2/main`).
  - Add `sdk-watch` (nightly; TS SDK packages and Python `mcp`), including the
    hardened analysis job's properties unchanged.
  - Keep S12's SHA pins current: `dependency-refresh` ranks each pin by its
    `# vX.Y.Z` comment, as the Inspector's sweep does.
  - Add the `AGENTS.md` "dependency updates are issue-driven" rules, and
    remove S1's temporary Dependabot exception to "every PR references an
    issue".
  - Work down the **existing Dependabot PR backlog** (six open at the time of
    writing): convert each still-needed bump into an issue for the sweep
    flow, and close the PR with a pointer to it.
- Acceptance:
  - No new Dependabot PRs open after merge.
  - Every Dependabot PR that was open at merge time is closed, with a pointer
    to its replacement issue or a reason.
  - Each sweep's dry run **writes nothing** and prints the issue payload it
    would file, with correct labels and milestone. Live filing is exercised
    by script tests with a mocked `gh`, not against the real tracker.
  - Script tests pass.
  - A closing `docs/ai-software-factory.md` for this repo, written once the
    whole factory, this automation included, has landed.

## 10. Maintainer decisions

These were open questions in the first draft of this doc; the maintainers
answered them on PR #4861.

1. **Outside PRs (S8): turned off, as in the Inspector.** External
   contributors file issues; maintainers open PRs. S8 rewrites the policy docs
   and templates and plans the open backlog; S7 carries it out.
2. **DCO (S6): on, as in the Inspector.** S6 installs the DCO app and requires
   `git commit -s` on every commit.
3. **Coverage in CI (S10): yes.** CI enforces the per-file gate in a parallel
   job, as the Inspector does. #4854 and #4855 are amended where they said the
   gate stays local.
4. **Size field (S5): removed.** Board #43's Size field held no values and has
   been deleted.
5. **Milestones: kept as is.** Every sub-issue stays in `v2.0.0`.
