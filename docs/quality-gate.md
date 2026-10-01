# The quality gate

This is the reference for what is checked before code reaches `v2/main`: the
stages of the pre-push gate, what GitHub CI runs and where, and how the two
relate. The rule itself (run the gate before every push) is in
[`AGENTS.md`](../AGENTS.md#before-pushing). Diagnosing a failing stage is the
`pre-push-gate` skill. This file is the only place the stage list is written
out; everything else points here.

## Two tiers, one set of checks

| Tier | Command | Where | When |
| --- | --- | --- | --- |
| Inner loop | `npm run validate -w src/<server>`, `npm run validate:py -- <server>` | Your machine | While iterating on one server |
| Pre-push gate | `npm run local:gate` | Your machine, under a lease | Before every push |
| CI | `.github/workflows/typescript.yml`, `python.yml` | GitHub, on every push and pull request | Before merge |

**`npm run local:gate` runs every check CI runs.** CI splits the same checks
into parallel jobs on a fresh install; the gate runs them in sequence on your
checkout. So a green gate means every check CI applies has already passed on
your machine. It is the strongest predictor of a green CI there is here, though
not a proof: CI runs on Linux, on a fresh `npm ci`, with Node 22 and each
Python server's pinned interpreter.

The inner-loop commands are subsets. They are for speed while working, and are
never a substitute for the gate.

## The stages of `local:gate`

`local:gate` is exactly `node scripts/gate-lease.mjs npm run local:gate:stages`:
the [lease](#the-gate-lease) around the stages, and nothing else. The stages run
in this order, and the first failure stops the run.

| # | Stage | What it checks | CI counterpart |
| --- | --- | --- | --- |
| 1 | `verify:install-fresh` | Every package in `node_modules` is at the version `package-lock.json` records | None needed: CI installs with `npm ci` |
| 2 | `validate` → `validate:guards` | The root guards, listed [below](#the-root-guards) | `typescript.yml` → **Root guards** |
| 3 | `validate` → each workspace's `validate` | Per TypeScript server: `format:check`, `lint` (`--max-warnings 0`), `typecheck`, `build`, `test` | `typescript.yml` → **Validate \<server\>** (one leg each) |
| 4 | `validate:py` | Per Python server: `uv sync --locked`, `ruff check`, `ruff format --check`, `pyright`, `pytest`, `uv build` | `python.yml` → **Test \<server\>** (one leg each) |
| 5 | `verify:skills:cli` | `claude plugin validate` on `.claude/skills`, at the pinned CLI version | `typescript.yml` → **Root guards** |
| 6 | `smoke` | Every server boots over each transport it implements and answers one tool call | `typescript.yml` → **Boot smoke** |

Notes on the stages:

- **`verify:install-fresh` is first on purpose.** The gate never runs
  `npm ci`, so a checkout whose `node_modules` predates a pulled dependency
  bump would be tested against dependencies CI does not use, and the failure
  would show up later as a test reporting the old dependency's behavior. The
  Python servers need no counterpart: stage 4 begins each server with
  `uv sync --locked`, which brings its environment to its lockfile.
- **`validate:py` carries on after a failing server**, so one run reports all
  three verdicts, and exits non-zero if any failed. Within a server it stops
  at the first failing step.
- **`verify:skills:cli` needs the network** when the pinned Claude Code CLI is
  not the one installed: it fetches it with `npx`. It is the one stage that
  fails offline.
- **`smoke` launches what a user launches**: the built `dist/index.js` for a
  TypeScript server, the console script through `uv run --frozen` for a Python
  one. stdio for all seven; HTTP+SSE and Streamable HTTP as well for
  `everything`. It touches neither the network nor your files: `fetch` is
  pointed at a page the smoke serves on the loopback interface, and the HTTP
  transports listen on ports the OS hands out. It runs after `validate`
  because it needs the build.
- `python.yml` also has a **Build \<server\>** job per server that re-runs
  pyright and `uv build` and uploads the built distribution. It checks nothing
  stage 4 does not.

### The root guards

`npm run validate:guards` is the part of `validate` that no per-server check
covers: the repo-wide tooling and the guards that keep the gate itself honest.

| Guard | Fails when |
| --- | --- |
| `format:check:root`, `lint:root` | A file under `scripts/` or a root config is unformatted or has a lint finding |
| `verify:format-coverage` | A tracked source file is covered by no `format:check` glob |
| `verify:skills` | A skill's frontmatter does not parse, declares no invocation mode, lacks eval cases, or the listing exceeds its budget; or a skills gate has come unwired |
| `verify:typecheck-coverage` | A tracked TypeScript file lands in no `tsc` program |
| `verify:dep-lockstep` | Two workspaces declare different ranges of a shared toolchain package |
| `verify:no-test-retries` | A test declares a retry (Vitest's `retry`, a pytest rerun plugin or marker) |
| `test:scripts` | A guard's own unit tests fail. These include the workflow guard: a workflow invokes a `local:*` script, a CI job has no `timeout-minutes`, or `local:gate` is no longer exactly the lease wrapper around stages that include every check above |

## What is in neither tier

- **`npm run skills:eval`** spends real model calls and is non-deterministic,
  so it is in neither the gate nor CI. Run the whole suite when adding a skill
  or editing a description ([`skill-authoring.md`](./skill-authoring.md)).
- **`npm run coverage`** runs each TypeScript server's tests instrumented and
  prints a report. No threshold is enforced today. Per-file coverage thresholds,
  and their stages in the gate and in CI, arrive with #4854 (TypeScript) and
  #4855 (Python).
- **`npm run format`** rewrites files, so it is something you run, not
  something the gate does. The gate only checks.
- **Publishing** (`release.yml`) runs on `workflow_dispatch` only. See
  [`RELEASING.md`](../RELEASING.md).

## Keeping the two tiers in step

The claim "the gate runs every check CI runs" is only worth something if it
cannot go stale quietly, so the script tests hold it in place:

- **A check added to CI is added to `local:gate:stages` in the same change.**
  `scripts/lib/workflow-gate.test.mjs` asserts the gate still reaches each of
  the stages above; a new CI job gets a line in that list.
- **No workflow invokes a `local:*` script.** The prefix means local-only. CI
  runs the same checks as separate jobs, and a workflow that ran the gate
  itself would queue on a lease nothing else shares and collapse the parallel
  legs into one.
- **Every CI job declares `timeout-minutes`**, so a hung job goes red in
  minutes instead of holding a runner for GitHub's six-hour default. The
  current values are 10 to 30 times the observed run time of each job.
- **No test retries**, in either language. A retry turns a test that fails
  some of the time into a green one, on the only gate between that test and
  `v2/main`.

## The gate lease

Agent sessions work in separate worktrees of one checkout, and each runs the
gate before pushing. Two gates at once compete for every core, so both slow
down and any time-sensitive test is measured on a machine it was not written
for. `local:gate` therefore runs under a **machine-wide lease**
(`scripts/gate-lease.mjs`, ported from the MCP Inspector): one gate runs, and
any other started meanwhile waits its turn.

What you see when another gate holds the lease:

```
gate-lease: pid 12345 in /path/to/other-worktree, running for 40s holds the gate lease; waiting for its turn so the gates do not contend. SERVERS_SKIP_GATE_LEASE=1 runs anyway.
```

- **Waiters start in arrival order.** A waiting gate re-checks every 2 seconds
  and prints `still waiting` once a minute.
- **A holder that is killed releases by itself.** It stops refreshing its lock,
  which goes stale after 30 seconds and is taken over by the next waiter.
  Nothing needs cleaning up by hand, with one exception: a dead holder's lock
  directory that cannot be removed (a stray file in it, or permissions). The
  waiter then names the path when it gives up.
- **A waiter gives up after 45 minutes** in total, with a message naming the
  holder. That budget is not reset as the queue ahead drains.
- **The lease never fails the gate.** If the lease directory cannot be created
  or written, the gate runs without it and says so.
- **`SERVERS_SKIP_GATE_LEASE=1`** runs without the lease. It does not get a
  result sooner than waiting would: an overlapped run is slower than a queued
  one. `SERVERS_GATE_LEASE_DIR` moves the lease directory, which lives under
  `$XDG_RUNTIME_DIR` or the system temp directory by default, never inside a
  worktree.

The lease covers `local:gate` only. A bare `npm run validate` or `npm test` in
another session does not take it.
