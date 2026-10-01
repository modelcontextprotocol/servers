---
name: pre-push-gate
description: "Run this repo's pre-push gate and fix it when it goes red. Use when npm run local:gate fails or a stage of it does (verify:install-fresh, a root guard, lint, typecheck, ruff, pyright, pytest, verify:skills:cli, the boot smoke); when the gate says it is waiting on the gate lease; or when checking whether a gate run really passed."
disable-model-invocation: false
---

# The pre-push gate

**The rule** (stated in [`AGENTS.md`](../../../AGENTS.md#before-pushing)): run
**`npm run local:gate`** before every push, and push only when it exits 0.
`npm run validate` is the inner-loop check and is **not** a substitute.

What each stage covers, and how the gate relates to CI, is
[`docs/quality-gate.md`](../../../docs/quality-gate.md). The stage list is
written out there and nowhere else, on purpose. This skill is how to run the
gate and what to do when it goes red.

## Run it

```sh
cd <repo root>
npm run format                       # TypeScript. It rewrites files; the gate only checks.
npm run local:gate; echo "EXIT=$?"
```

In a Python server you changed, format with `uv run --frozen ruff format .`
from that server's directory.

**Verify by exit code, not by grepping the output.** A Prettier failure is a
few `[warn]` lines that match no obvious failure pattern, and `validate:py`
prints `PASS` for two servers above the `FAIL` for the third.

⚠️ If you run it as a background task, the harness's "exit code 0"
notification describes the _wrapper_ (the trailing `echo`), not the gate. Read
the `EXIT=` line.

**Background it and wait for the notification.** Do not spend turns tailing
the log; see `AGENTS.md` **Waiting on long-running work**.

The gate stops at the first failing stage, so the last stage header in the
output is the one that failed. Fix it, then **re-run the whole gate**, not just
that stage: the stages after it have not run yet.

## Diagnosing a failing stage

Each heading is a stage or guard name as it appears in the output.

### `verify:install-fresh`

An installed package's version disagrees with `package-lock.json`
(`node_modules` is older than the tree you pulled), or a `package.json`
declares a dependency the lockfile does not record. **Run `npm install` at the
repo root**, commit the lockfile if it changed, and re-run. It is the first stage because a stale install otherwise
passes every static check and fails later as a test reporting the _old_
dependency's behavior. Do not "fix" that test.

### `format:check` / `format:check:root`

Run `npm run format` at the **root**. It covers `scripts/`, the root configs
and every workspace; a single workspace's `format` does not.

### `verify:format-coverage`

A tracked source file is matched by no `format:check` glob, so nothing checks
its formatting. Put it where a glob reaches it, or extend the glob. Do not add
it to `.prettierignore` to make the guard pass.

### `verify:skills` / `verify:skills:cli`

A `.claude/skills` manifest does not parse, declares no
`disable-model-invocation`, a model-invoked skill lacks its eval cases, or the
listing is over budget. The message names the skill. The usual cause is an
unquoted `#` or `:` in a `description`.

`verify:skills:cli` is the authoritative validator. It fetches the pinned
Claude Code CLI with `npx` when the installed one is a different version, so it
**fails offline**. (`validate:py`'s `sync` step is the other stage that can:
`uv sync --locked` downloads when a server's environment is missing or stale.)

### `verify:typecheck-coverage`

A tracked `.ts` file lands in no `tsc` program. Usually a new test or config
file outside the server's `tsconfig.test.json` `include`. Add it there.

### `verify:dep-lockstep`

Two workspaces declare different ranges of a shared toolchain package
(`typescript`, `vitest`, `@vitest/coverage-v8`, `prettier`, `@types/node`).
Bump it in **every** workspace that declares it, then `npm install`.

### `verify:no-test-retries`

A test declares a retry: Vitest's `retry:` option or `--retry` flag, a pytest
rerun plugin, or a `flaky` marker. Remove it and fix why the test fails. A race
is fixed with fake timers or an awaited condition; a port collision with a port
the OS hands out.

The guard matches spellings, not semantics, so an unrelated `retry:` property
in server source trips it too. Rename the property, or restructure so the key
is not written as `retry:` at the start of an expression.

### `verify:action-pins`

A job that holds a credential, or one whose artifact such a job downloads, uses
an action by a tag (`actions/checkout@v6`) or by a SHA with no exact-version
comment. The finding names the workflow, the job and the `uses:` value. Pin it
as `owner/repo@<40-hex sha> # vX.Y.Z`, resolving both from one lookup:

```sh
ACTION=actions/checkout TAG=v6.1.0
echo "uses: $ACTION@$(gh api "repos/$ACTION/commits/$TAG" --jq .sha) # $TAG"
```

If the job should not have become credentialed, that is the real fix: the
guard counts `id-token: write` or `packages: write` (the job's own, or the
workflow's when the job declares none), any secret other than `GITHUB_TOKEN`,
and an `upload-artifact` that a credentialed job `needs` and downloads. A YAML
alias in such a job is reported too; spell the ref out. The rule is in
`AGENTS.md` **Credentialed workflow jobs**.

### `test:scripts`

A guard's own unit test failed. Two of these are about the gate itself and
mean a change broke one of its invariants
(`scripts/lib/workflow-gate.test.mjs`):

- **"GitHub CI must not run a local-only script"**: a workflow invokes a
  `local:*` script. Call the underlying checks as their own steps instead.
- **"every CI job needs a timeout"**: a job was added without
  `timeout-minutes`.
- **"local:gate must run …"**: a stage was dropped from `local:gate:stages`,
  or `local:gate` is no longer exactly the lease wrapper.

Do not edit the guard to make these pass; the split they enforce is the design.

### `lint`

**There is no warning tier.** Every `lint` script runs `--max-warnings 0`, so
a warning fails exactly as an error does. Fix the finding. If a rule genuinely
must be waived on one line, use its inline disable comment **with a one-line
justification**; never widen an ignore list or turn the rule off.

### `typecheck` / `build`

`typecheck` runs `tsc -p tsconfig.test.json` (source and tests); `build` runs
the server's own `tsc`. An error in a test file only shows in `typecheck`.

### `test` (a TypeScript workspace)

Re-run just that suite to iterate: `npm test -w src/<server>`. Read the failure
before changing a timeout: an assertion that races is a bug in the test.

### `validate:py`

The summary at the end names the failing server, and the step that failed is
the last `[validate:py] <server>: <step>` line above it. Re-run one server with
`npm run validate:py -- <server>`.

| Step | Fix |
| --- | --- |
| `sync` | `uv.lock` no longer matches `pyproject.toml`. Run `uv lock` in that server and commit the lockfile |
| `ruff check` | Fix the finding; `uv run --frozen ruff check --fix .` handles the mechanical ones |
| `ruff format --check` | `uv run --frozen ruff format .` |
| `pyright` | A type error. Add the missing hint rather than an ignore |
| `pytest` | `uv run --frozen pytest -k <name>` in that server to iterate |
| `build` | A packaging error in `pyproject.toml` |

`uv: command not found` means `uv` is not installed. Never substitute `pip`.

### `smoke`

`smoke — FAIL  <server> over <transport>` followed by the reason and the tail
of the server's stderr. Re-run a subset with
`node scripts/smoke-servers.mjs <server> [<server> …]`.

- **"dist/index.js does not exist — build first"**: you ran the smoke on its
  own before building. `npm run build -w src/<server>`. Inside the gate this
  cannot happen, since `validate` builds first.
- **".venv does not exist — sync first"**: the same for a Python server. The
  smoke never creates an environment; `npm run validate:py -- <server>` does.
- **The server exited before answering**: the stderr tail shows why. This is
  what the smoke is for: the unit tests import the source, so a wrong `bin`
  path, a file missing from `dist/`, or an import that only resolves under the
  test runner passes them and fails here.
- **"tools/list does not include …"**: a tool was renamed or removed. A
  published tool is never renamed (`AGENTS.md` **MCP protocol**); if the change
  is intended, update that server's entry in `SERVERS`.
- **A new server fails `test:scripts`** with "every server directory in the
  repo has a smoke entry": add it to `SERVERS` in `scripts/smoke-servers.mjs`.

## Waiting on the lease

A gate that starts with

```
gate-lease: pid 12345 in /path/to/other-worktree, running for 40s holds the gate lease; waiting for its turn so the gates do not contend. SERVERS_SKIP_GATE_LEASE=1 runs anyway.
```

is queued behind another worktree's gate. That is normal: it starts once the
holder (and any gate that arrived before it) finishes. The line names the
holder's pid and worktree, so you can tell whether to wait or to stop that
gate.

- A holder that was **killed** stops refreshing its lock and is taken over
  after 30 seconds. Nothing needs cleaning up.
- A waiter that prints `gave up after 45m` names a lock path. Check whether
  the holder it names is alive and hung (stop it), or dead with a lock
  directory that could not be removed (remove that directory).
- Do **not** set `SERVERS_SKIP_GATE_LEASE=1` to get a result sooner. Two
  overlapping gates each take longer than one queued behind the other.
- Do **not** write your own "wait until no gate is running" loop. Two of them
  deadlock on each other, and a `pgrep` for the gate's command line matches the
  loop itself.

The details of the lease are in
[`docs/quality-gate.md`](../../../docs/quality-gate.md#the-gate-lease).

## Not part of the gate

`npm run skills:eval` (real model calls), `npm run coverage` (a report; no
threshold is enforced yet) and `npm run pack:verify` (installs each package's
publish artifact and boots it; needs the network, and belongs to the release
flow) are separate commands. Run the eval suite when you
add a skill or change a description.
