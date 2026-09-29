# Contribution model: issues, not pull requests

This document records the repository's contribution model and the plan for the
open backlog of outside pull requests it leaves behind. The policy itself is
stated for contributors in [`CONTRIBUTING.md`](../CONTRIBUTING.md) and for agents
in [`AGENTS.md`](../AGENTS.md) (Contributing); this document does not restate it
beyond what the plan needs. The plan was written for
[#4869](https://github.com/modelcontextprotocol/servers/issues/4869) (Part 9 of
the agentic software factory, tracker
[#4858](https://github.com/modelcontextprotocol/servers/issues/4858)) and is
carried out by
[#4868](https://github.com/modelcontextprotocol/servers/issues/4868), the
`issue-triage` skill and its first triage pass.

## The decision

The maintainers decided on PR #4861 (recorded on #4869 and in
[`docs/agent-guidance-inception.md`](./agent-guidance-inception.md) §10) that
**outside pull requests are turned off, as in the MCP Inspector.** Anyone who is
not a repository maintainer, organization members with write access included,
files a detailed issue: the problem, a reproduction, the expected behavior, and,
if they prototyped a fix, the prompt they used rather than a diff. The
maintainers open every PR, and every PR closes an issue.

Where the policy is stated:

| Where                                       | What it says                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTRIBUTING.md`                           | The policy, why it exists, what issues are acted on, and what makes a good issue                                                                        |
| `AGENTS.md`, Contributing                   | The rule an agent follows, and the pointer to this plan                                                                                                 |
| `.github/pull_request_template.md`          | The "issues, not PRs" banner every new PR opens with                                                                                                    |
| `.github/ISSUE_TEMPLATE/`                   | Bug and feature forms (server dropdown, protocol era, client); `config.yml` disables blank issues and routes security reports and new servers elsewhere |
| `src/fetch/README.md`, `src/time/README.md` | Their Contributing sections, which are published to PyPI                                                                                                |

⚠️ **GitHub serves the issue forms and `config.yml` from the default branch**
(`main`). Development happens on `v2/main`, so the forms go live at the first
milestone merge that contains them. Until then the chooser offers a blank issue,
and the close comments below point at the policy on `v2/main`, where it already
applies.

## The backlog at the time of writing

A snapshot of the open PRs on 2026-09-29, classified by author and by the files
each PR touches. The classes are heuristic and the numbers will have moved;
#4868 re-snapshots and re-classifies before acting.

| Class                                                                                      | Open PRs | With a linked issue |
| ------------------------------------------------------------------------------------------ | -------: | ------------------: |
| Dependabot                                                                                 |        4 |                   0 |
| Maintainer-authored                                                                        |        9 |                   3 |
| Listing only (touches only `README.md` / `ADDITIONAL.md`)                                  |       24 |                   2 |
| New server (adds a directory under `src/` that is not one of the seven servers)            |        9 |                   1 |
| Server change (touches one or more of the seven servers)                                   |      255 |                 126 |
| Repository-level (CI workflows, root `package.json`, scripts, translations, no-op renames) |       18 |                   6 |
| **Total**                                                                                  |  **319** |             **138** |

So **306 outside PRs** fall under the plan. By server, the most-touched are
`filesystem`, `git` and `fetch`, the servers with real reach (local disk, git,
outbound requests). Several outside PRs often race each other for the same bug.

## The plan

The guiding rule: **no fix worth keeping is lost, and no outside PR stays open.**
Harvesting happens before closing, so a PR is closed only once whatever is worth
doing in it is tracked by an issue.

### Not touched by the sweep

- **Dependabot PRs.** They are the temporary exception in `AGENTS.md` and are
  retired by
  [#4874](https://github.com/modelcontextprotocol/servers/issues/4874), which
  replaces them with issue-filing sweeps.
- **Maintainer-authored PRs.** The policy does not close them. Their authors
  decide, one by one, whether each is retargeted at `v2/main` with an issue to
  close (as every PR must be) or closed. At the time of writing seven of the nine
  still target `main`; the sweep lists them for the maintainers and does nothing
  else with them.
- **An outside PR that an open issue already names as the thing to decide**, such
  as #3260 under #4860 (interface-diff CI). That issue owns its fate; the sweep
  leaves it open and says so in its report.

### 1. Snapshot and classify

List every open PR, with a limit that has headroom, and check that the count
matches the repository's total, as the `board-ops` whole-board dump does; a
truncated list is a silent partial sweep. Write the snapshot and the working
manifest **outside the repository** (a `mktemp -d` directory), like every other
bulk dump.

Classify each outside PR into exactly one of these, by reading it, not only by
its paths:

| Class                          | Recognized by                                                                                                                   | Harvest?                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Listing**                    | Adds or edits a server entry in `README.md` or `ADDITIONAL.md`                                                                  | No. Close with the Registry comment         |
| **New server**                 | Adds a server implementation, in or outside `src/`                                                                              | No. Close with the Registry comment         |
| **No-op or spam**              | No effective change, a rename to the same name, unrelated or generated content                                                  | No. Close with the general comment          |
| **Duplicate**                  | Races another open PR, or an existing issue, for the same fix                                                                   | Once per group, through its best member     |
| **Security fix**               | Fixes a vulnerability: path traversal, symlink or Roots escape, SSRF, injection, a vulnerable dependency                        | See [Security fixes](#security-fixes)       |
| **Fix or enhancement to keep** | A bug fix, or an in-scope enhancement (`CONTRIBUTING.md`, "What we act on"), to one of the seven servers or the repo            | Yes, unless an open issue already covers it |
| **Out of scope**               | A feature `CONTRIBUTING.md` is selective about and a maintainer would not take, or a fix for behavior already gone on `v2/main` | No. Close with the general comment          |

**The manifest (PR, class, the issue it will point at) is reviewed by a
maintainer before anything is closed.** Closing about three hundred PRs is not
reversible in any practical sense, and the manifest is where a wrong class is
cheap to fix.

### 2. Harvest

For each PR marked for harvest:

- **If an open issue already covers the change** (the PR's linked issues first,
  then a search of open and closed issues), file nothing. The issue is the
  pointer in the close comment. Add the PR to that issue as a prototype in the
  same comment that credits its author, so the work is findable from the issue.
- **Otherwise file one issue**, following `issue-create` for the labels (`v2`,
  exactly one type label, the server's `server-<name>` scope label where one
  applies) and the board card, with one difference: **board it as `Incoming`,
  with no milestone.** Harvesting preserves a fix; it does not approve it. The
  issue then goes through triage's approval pass like any other inflow.
  The issue states the problem in its own words (not "see the PR"), links the PR
  as a prototype, and credits its author.
- **A duplicate group** gets one issue, linking every PR in the group.

### Security fixes

A PR that fixes a vulnerability is public already, but the vulnerability may
also sit in the private advisory backlog. Before filing anything public, check
that backlog for a matching advisory. If one matches, link the PR from the
advisory and track the fix there, following the `security-advisory` flow that
[#4870](https://github.com/modelcontextprotocol/servers/issues/4870) adds;
don't file a public issue that re-describes an unpublished advisory. If none
matches, harvest it like any other fix, and include the security impact in the
issue so triage can score it.

### 3. Close

Close each outside PR with the comment for its class, naming the harvest issue
where there is one. Pace the closes (a pause of a few seconds between them, in
batches) to stay under GitHub's secondary rate limit on content creation, and
stop on the first failed call rather than carrying on blind.

Closing a PR does not delete it: its branch, diff and discussion stay readable,
and the harvest issue links it.

**The general comment** (every class except listings and new servers):

> Thank you for this pull request. This repository now accepts **issues, not
> pull requests**, from anyone but its maintainers: design and implementation
> are done by the maintainers through a prompt-driven workflow, so outside PRs
> are closed rather than reviewed. The policy is in
> [`CONTRIBUTING.md`](https://github.com/modelcontextprotocol/servers/blob/v2/main/CONTRIBUTING.md).
>
> This change is tracked in #NNNN, which links back to this PR and
> credits you. _(Or, where nothing was harvested:)_ If you'd like this change
> considered, please open an issue describing the problem, how to reproduce it
> and the expected behavior, and, if you prototyped the fix, share the prompt you
> used rather than a diff.

**The Registry comment** (listings and new servers):

> Thank you for this pull request. This repository does not accept new server
> implementations or server listings, and it now accepts **issues, not pull
> requests**, from anyone but its maintainers
> ([`CONTRIBUTING.md`](https://github.com/modelcontextprotocol/servers/blob/v2/main/CONTRIBUTING.md)).
> To make your server discoverable, publish it to the
> [MCP Server Registry](https://github.com/modelcontextprotocol/registry) by
> following its
> [quickstart guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx).

`issue-triage` keeps these as its canned responses, so the sweep and later
triage passes answer each class the same way.

### 4. Verify

The pass is complete when:

- every open PR is maintainer-authored, a Dependabot PR, or named in the report
  as left open by an issue that owns it;
- every closed PR marked for harvest points, in its close comment, at an open or
  closed issue that links back to it;
- every harvest issue carries `v2` and exactly one type label, plus its
  `server-<name>` scope label when it concerns exactly one server (a
  repository-level or multi-server issue carries none), and sits in `Incoming`
  with no milestone.

The report lists the counts per class, the harvest issues filed, and the
maintainer-authored PRs still targeting `main`.

## New outside PRs after the sweep

Nothing in this change stops new outside PRs from being opened. Until a
maintainer decides otherwise, each triage pass handles new ones by the same
classes and comments. Two related pieces are separate decisions, not part of
this plan:

- **`readme-pr-check.yml`** still invites README-only PRs to continue with
  `/i-promise-this-is-not-a-new-server`, which no longer matches the policy.
  #4868 folds its behavior into `issue-triage` and changes or retires the
  workflow.
- **Automatic closing** of outside PRs (a workflow, as maintainer PR #4528
  proposes for new-server PRs, or a repository setting where GitHub offers one)
  is a maintainer decision about repository settings and workflows.
