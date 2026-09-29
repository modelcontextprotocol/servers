---
name: issue-create
description: "Create a tracked issue in this repo end to end — duplicate check, v2 label, type label, server-scope label, milestone, board card, Status and Priority. Use when asked to file, create, open or raise an issue; when picking its labels or its milestone; when checking whether one already exists; or when work discovered mid-task needs an issue of its own."
disable-model-invocation: false
---

# Creating an issue

An issue **you** create is not "created" until every step below is done. A
label is a repo tag, the milestone is a release bucket, and the board is a
separate org project: `--label v2` does **not** add a board card, and adding a
card does **not** set a Status or a Priority.

| # | Step | Applies |
| --- | --- | --- |
| 1 | **`v2` label** | Always |
| 2 | **Type label**: exactly one of `bug` / `enhancement` / `documentation` / `chore` / `question` | Always |
| 3 | **Scope label**: `server-<name>` | Only when the issue concerns **one** server |
| 4 | **Milestone** | Always |
| 5 | **A card on the Servers V2 board (#43)** | Always |
| 6 | **Status** on that card: `Todo` (or `In Progress` if you start now) | Always |
| 7 | **Priority** on that card | Always |

The rules behind each row are in [`AGENTS.md`](../../../AGENTS.md) under
**Issue-driven work style**; this skill is the procedure. Rows 5–7 need the
board's IDs, which only the `board-ops` skill holds, so **load `board-ops`
before step 5**; it is step 5's first action.

Set the labels and milestone at **create time**, never by backfilling: an
unlabeled issue appears in no `v2`-filtered query, and an unmilestoned one drops
out of release planning silently.

**Never create a duplicate.** **Never create a draft card** (a board card with
no issue number): every board item is a real GitHub issue. The one exception, a
private security advisory's `[GHSA-…]` card, is the `security-advisory` skill's.

## 0. Check for an existing issue first

Search **all** states, not just open. A closed issue is still a duplicate: it
may have been completed, rejected, or filed and superseded, and refiling it
loses that history. When one matches, the call is whether to reopen it or file
genuinely new work; either way you need to have seen it.

```sh
gh issue list --repo modelcontextprotocol/servers --state all --limit 200 \
  --search "<keywords>" --json number,title,state,stateReason,labels,milestone
```

This repository has thousands of issues, most from outside contributors, so
search with two or three phrasings (the symptom, the tool or server name, the
error text) before concluding there is none. Also check the board itself, where
approved work already has a card:

```sh
BOARD=$(gh project item-list 43 --owner modelcontextprotocol --format json --limit 2000)
# --limit truncates silently: trust the listing only when it is complete.
if jq -e '(.items | length) == .totalCount' <<<"$BOARD" >/dev/null; then
  jq -r '.items[] | "\(.content.number)\t\(.status)\t\(.title)"' <<<"$BOARD" \
    | grep -i "<keyword>"
else
  echo "board listing incomplete or failed — raise --limit; not concluding anything" >&2
fi
```

## 1. Pick the labels

**`v2`.** Every issue created through this flow carries it. It marks work
tracked by this workflow; there is no other version label in this repository.

**Type.** Exactly one:

| Type | Use for | Not for |
| --- | --- | --- |
| `bug` | Something is broken, wrong, or regressed against its intended behavior, including a server that reports something false about the protocol | A missing capability that was never built |
| `enhancement` | A new capability, or extending an existing one: features, protocol-feature demonstrations, tracking issues | A cleanup with no behavior change |
| `documentation` | Prose deliverables: READMEs, `docs/`, `AGENTS.md` rules, skills | Code that happens to need a doc update |
| `chore` | Maintenance with no user-facing behavior change: dependencies, build and CI tooling, refactors, release plumbing | Anything a user of a server would notice |
| `question` | An open question or discussion with no agreed deliverable yet | Work someone has already decided to do |

**Don't force the binary.** `bug` and `enhancement` are the two most reached
for, and pressing a docs task or a dependency pin into `enhancement` degrades it
to "not a bug", at which point filtering by it stops telling you anything.

**Scope.** When the issue concerns exactly one server, add its label:

| Server directory | Scope label |
| --- | --- |
| `src/everything/` | `server-everything` |
| `src/filesystem/` | `server-filesystem` |
| `src/memory/` | `server-memory` |
| `src/sequentialthinking/` | `server-sequentialthinking` |
| `src/fetch/` | `server-fetch` |
| `src/git/` | `server-git` |
| `src/time/` | `server-time` |

An issue about the repository as a whole (CI, root scripts, `AGENTS.md`,
skills, release tooling) carries **no** scope label. An issue that really spans
two or three servers takes each of their labels; one that spans them all is
repository-wide and takes none.

## 2. Pick the milestone

If the user didn't name one, use the **current** milestone: the open `v2.x`
milestone with the nearest due date.

```sh
gh api repos/modelcontextprotocol/servers/milestones --jq \
  'map(select(.state=="open" and (.title|startswith("v2")))) | sort_by(.due_on == null, .due_on)
   | .[] | "\(.title)\tdue \(.due_on // "none" | .[0:10])\topen=\(.open_issues)"'
```

The first line is the default. Milestones are **release** buckets, so pick by
_when the work ships_, not by size. If a new issue plainly can't make the
current milestone, say so and put it in the next one rather than leaving it
blank. A sub-issue normally inherits its parent's milestone.

## 3. Pick the Priority

Priority is a board field (Urgent / High / Medium / Low), not a label. Pick it
by impact and urgency, and say in one line why:

| Priority | For |
| --- | --- |
| Urgent | A security problem, a broken release, or something blocking other work now |
| High | A real defect users hit, or work other planned work depends on |
| Medium | The default for planned work |
| Low | Nice to have; nothing waits on it |

This table is the short form of the scored rubric in `issue-triage`, which is
how triage prioritizes inflow. When the choice here is not obvious, score it
with that rubric instead.

## 4. Create it

```sh
gh issue create --repo modelcontextprotocol/servers \
  --title "<title>" \
  --label v2 --label "<type from step 1>" --label "<server-name from step 1>" \
  --milestone "<milestone from step 2>" \
  --body "<body>"
```

Drop the `server-…` label for a repository-wide issue, and repeat it for each
server when an issue spans a few. `gh issue create` prints
the new issue's URL; keep it for the next step.

A good body states the problem, how to reproduce it (the server, its
configuration, the client, the request), the expected behavior, and which spec
era it concerns when that matters.

## 5. Board it, in Todo, with its Priority

Filing an issue for work you intend to happen **is** approving it, so it starts
in **Todo** with its milestone already set, not in `Incoming`, which is the queue
for issues nobody has evaluated yet. Work you are starting immediately goes
straight to **In Progress**.

**Load the `board-ops` skill now** and run its add-card recipe with the Status
and the Priority from step 3. This file cannot board the issue on its own: the
project, field and option IDs live in `board-ops` and only there. An
option ID is regenerated whenever its field's option list is edited, so a
second copy here would go stale silently and break issue creation even after
`board-ops` was fixed.

## 6. Verify

Read the issue back and confirm every row of the table at the top:

```sh
N=<ISSUE_NUMBER>
gh api graphql -F n="$N" -f query='query($n:Int!){
  repository(owner:"modelcontextprotocol",name:"servers"){issue(number:$n){
    number title milestone{title} labels(first:20){nodes{name}}
    projectItems(first:100){nodes{project{number owner{... on Organization{login}}}
      fieldValues(first:20){nodes{... on ProjectV2ItemFieldSingleSelectValue{
        name field{... on ProjectV2SingleSelectField{name}}}}}}}}}}' \
  --jq '.data.repository.issue | {number, title, milestone: .milestone.title,
        labels: [.labels.nodes[].name],
        board: [.projectItems.nodes[]
                | select(.project.number==43 and .project.owner.login=="modelcontextprotocol")
                | [.fieldValues.nodes[] | select(.field) | {(.field.name): .name}] | add]}'
```

The issue is created when `labels` holds `v2`, exactly one type and the scope
label if one applies, `milestone` is set, and `board` holds exactly one entry
with both a `Status` and a `Priority`. The filter matches the board's owner as
well as its number, because project numbers are only unique per owner.

## Issues that arrive from elsewhere

An issue opened through the GitHub UI, by an outside reporter or by a
maintainer, arrives with **no milestone and no card**, and with no labels unless
it came through an issue form (the forms apply `v2` and `bug` or `enhancement`,
never a scope label). That is
normal on arrival, not a defect to fix the moment it lands: it is not approved
yet, so it enters the board in **Incoming**, unmilestoned, through triage (the
`issue-triage` skill), never through this flow.
