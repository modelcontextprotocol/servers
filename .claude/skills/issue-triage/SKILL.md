---
name: issue-triage
description: "Triage this repo's inflow — sweep unboarded issues onto the Servers V2 board (#43) as Incoming, score Priority with the rubric and post the score, classify outside PRs and spam (server listings, new servers, duplicates, no-ops) and close them with their canned comments, and run the board audit. Use for \"triage new issues\" or \"triage the PRs\"; when scoring an issue's Priority; when answering or closing an outside PR; or when auditing the board for drift."
disable-model-invocation: false
---

# Triaging issues and outside PRs

This repository receives far more outside issues and pull requests than it
opens itself, much of it misdirected (server listings, new servers, questions
for the SDK) and much of it racing (several PRs for the same bug). This skill is
the procedure for all of it: classify first, answer the classes that do not
belong here with a canned response, sweep the rest onto the board unapproved,
and check the board afterwards.

The **rules** it carries out are in [`AGENTS.md`](../../../AGENTS.md), under
**Contributing** and **Issue-driven work style**. The board's IDs, and the
recipes that add, move and delete cards, are in `board-ops`, and only there:
**load `board-ops` before the first board write.** Labels for an issue you file
come from `issue-create`. The plan for the outside-PR backlog is
[`docs/contribution-model.md`](../../../docs/contribution-model.md), "The plan";
[Outside PRs](#outside-prs) below is how it is carried out.

**"Triage new issues" means:** the [class check](#step-0--classify-before-boarding)
and [pass 1](#pass-1--sweep-onto-the-board-no-approval-implied) over every
unboarded open issue, then the [board audit](#the-board-audit). **"Triage the
PRs" means:** snapshot and classify the open outside PRs into a manifest and
stop for a maintainer's review ([Outside PRs](#outside-prs)). Pass 2 and every
close of an outside PR need a human, and neither is done unprompted.

The one-time sweep of the existing backlog is tracked in #4875 (#4876 for
issues, #4877 for PRs). It uses this skill's classes and responses, plus the
conventions that tracker sets for the sweep, such as a close label and a
reference to #4875 in each close comment.

## Outward-facing actions

Every label, comment and close lands on someone else's issue or PR, and a
reporter is notified of each one. So:

- **A batch of closes happens only after a maintainer has reviewed the
  manifest** that lists each item, its class, and the issue it will point at.
  A wrong class is cheap to fix in a file and expensive to fix after a
  notification went out. Closing a single item the maintainer named is fine.
- **Pace every write loop**: a few seconds between calls, and **stop on the
  first failed call** rather than carrying on blind. GitHub's secondary rate
  limit on content creation trips well before its primary one, and a loop that
  keeps going after a 403 leaves a half-applied batch nobody can see.
- **Never restate a vulnerability in public**, not even to summarize a report
  that was already filed publicly. See [Security reports](#security-reports).
- **Keep dumps outside the repository.** Every snapshot and manifest below goes
  in a `mktemp -d` directory. The board is private, and a dump left in the
  working tree is one `git add -A` away from being published.

## Step 0 — classify before boarding

Read each unboarded issue before sweeping it in. Most are real reports, but some
belong elsewhere, and boarding one of those would park it in a review queue for
work this repository does not do. A class whose Action is **Close** is closed
with its [canned response](#canned-responses), gets **no card** (`Done` means
shipped, and closed-not-planned work never goes on the board), and needs no
labels. A security report is never closed by triage.

| Class | Recognized by | Action | Response |
| --- | --- | --- | --- |
| **Server listing or submission** | Asks for a server to be listed here, in the README or `ADDITIONAL.md` | Close, `not planned` | [Registry, issue](#registry-issue) |
| **New server request** | Asks this repository to build or host a new server | Close, `not planned` | [Registry, issue](#registry-issue) |
| **Archived server** | About a server in [`servers-archived`](https://github.com/modelcontextprotocol/servers-archived) (GitHub, Slack, Postgres, Puppeteer, …) | Close, `not planned` | [Archived](#archived) |
| **SDK or specification** | Reproduces against the SDK directly, or asks for a protocol change | Close, `not planned` | [Elsewhere](#elsewhere) |
| **Duplicate** | An open or closed issue already reports it (search all states, as in `issue-create` step 0) | Close as `duplicate` (the `board-ops` API call); delete its card if it has one | [Duplicate](#duplicate) |
| **Spam or empty** | No content, unrelated or generated content | Close, `not planned` | None |
| **Security report** | Describes a vulnerability in one of the seven servers | **Stop. A maintainer decides** | [Security reports](#security-reports) |
| **Everything else** | A bug, a usability problem, an enhancement, a question about these servers | [Pass 1](#pass-1--sweep-onto-the-board-no-approval-implied) | None; the score comment |

When a class is a judgment call (a feature a maintainer might still take, a
report that could be the SDK or the server), sweep it in rather than closing
it. Pass 1 approves nothing, and a maintainer reading `Incoming` can still close
it; a wrong close cannot be quietly undone. For the same reason, closes follow
[Outward-facing actions](#outward-facing-actions): when a run finds more than
one, list them with their classes for a maintainer to confirm, and go on with
pass 1 for the rest meanwhile.

```sh
# The run's temp dir; create it once, before the first close, and reuse it.
D=${D:-$(mktemp -d)}
# Copy the class's response from Canned responses into "$D/response.md" (the
# text inside the quote, with #ORIGINAL or the SDK link filled in) first.
# Close as not planned, with that response (body in a file, so quoting is
# safe). NOT for a duplicate: post the Duplicate response with `gh issue
# comment`, close it with the `board-ops` state_reason=duplicate call, and
# delete its card if it has one (`board-ops`, Delete a card). An empty or missing response stops here instead of closing silently.
BODY=$(cat "$D/response.md") && [ -n "$BODY" ] \
  && gh issue close <N> --repo modelcontextprotocol/servers --reason "not planned" --comment "$BODY" \
  || { echo "no response or close failed for #<N> — stop and check it" >&2; false; }
# Spam or empty, the one class with no response:
gh issue close <N> --repo modelcontextprotocol/servers --reason "not planned"
```

## Pass 1 — sweep onto the board (no approval implied)

**An issue needs triage when it has no card on #43, whoever filed it.** The test
is about state, not authorship. An outside reporter cannot board anything, but a
maintainer who opens an issue in the web UI instead of through `issue-create`
leaves it unboarded too, and write access makes the board reachable, not
automatic. The milestone is not part of the test; it decides where the card
lands.

For each unboarded open issue left after step 0:

1. **Labels.** `v2`, **exactly one** type label (`bug` / `enhancement` /
   `documentation` / `chore` / `question`; the table is in `issue-create`), and
   the server's **scope label** (`server-<name>`) when it concerns one server.
   The issue forms apply `v2` and `bug` or `enhancement` on their own, but not
   the scope label, which triage reads off the form's server dropdown. Check
   the preset type too: a "bug report" that is a usage question is `question`.
2. **Board it** with the `board-ops` add-card recipe, Status **`Incoming`**.
3. **Priority** from [the rubric](#the-priority-rubric), and **post the score as
   a comment** ([Recording the score](#recording-the-score)). That is an
   assessment for ordering the queue, not an approval.
4. **Leave the milestone unset.** An empty milestone is what marks it as
   awaiting review.

**The one exception is an unboarded issue that already has a milestone.**
Someone recorded the approval and only the card is missing, so it goes straight
into **`Todo`**, keeping the milestone. Otherwise triage would silently
un-approve work a maintainer had already scheduled.

### Finding the unboarded ones

```sh
D=$(mktemp -d); R=modelcontextprotocol/servers
# --limit has headroom over the repo's open issues, and a listing that fills it
# is treated as truncated: gh does not say when it stops early.
gh issue list --repo $R --state open --limit 5000 \
  --json number,title,milestone,labels > "$D/open.json"
jq -e 'length < 5000' "$D/open.json" >/dev/null \
  || { echo "issue listing truncated or failed — raise --limit" >&2; rm -f "$D/open.json"; }
# item-list truncates SILENTLY past --limit, and a card missing from the dump
# reads as an unboarded issue that then gets a second card.
gh project item-list 43 --owner modelcontextprotocol --format json --limit 2000 > "$D/b43.json"
jq -e '(.items | length) == .totalCount' "$D/b43.json" >/dev/null \
  || { echo "board #43 listing INCOMPLETE — raise --limit and re-run" >&2; rm -f "$D/b43.json"; }
# An org board can hold other repositories' issues; keep this repo's only.
jq -r --slurpfile b "$D/b43.json" --arg R "$R" '
  [$b[0].items[] | select(.content.type=="Issue" and .content.repository==$R)
   | .content.number] as $boarded
  | .[] | select(.number as $n | $boarded | index($n) | not)
  | "#\(.number)\t→ \(if .milestone then "Todo (has milestone \(.milestone.title))" else "Incoming" end)\t\(.title[0:70])"' \
  "$D/open.json"
```

A failed or truncated listing deletes its file, so the last step fails on the
missing file instead of reporting every issue as unboarded.

The finder is only half the resume point. An issue whose card was added but
whose Priority or score comment then failed has left the finder's list, and the
audit catches a missing Priority but not a missing comment. So after an
interrupted batch, **finish the last issue you were working on first** (read its
card back with `board-ops` and check its comments), then resume from the
finder's output, never from memory.

## Pass 2 — approve what should ship

A maintainer reads the `Incoming` column and, for each issue worth doing,
**assigns a milestone** and moves the card to **`Todo`** (or **`In Progress`**
when picking it up now). That is the whole approval gesture.

**Pass 2 is reserved for a human.** Deciding what ships in which release is not
something to infer from a rubric score, so never promote a card out of
`Incoming` as part of a routine sweep. An issue that should not ship stays in
`Incoming` or is closed, and a closed one has its card deleted.

## The priority rubric

Score it rather than assert it: rate two axes 1–5, add the signal bonuses, and
read the band off the table. Two people triaging the same issue should land in
the same place, and the reasoning should survive in a form someone can argue
with later.

**Axis 1: severity and impact (1–5).** How bad is it when it happens?

| Score | Means |
| --- | --- |
| 1 | Cosmetic: a typo in a README or a tool description, a wording nit. |
| 2 | Minor friction with an easy workaround. |
| 3 | A tool, resource or prompt is broken or missing, and the workaround is annoying or partial. |
| 4 | A server's core function is unusable, or a server **reports something false about the protocol** (a result or schema a conforming client rejects or misreads). |
| 5 | Data loss; a security vulnerability, such as an operation that **escapes an allowed root**, SSRF, or command or argument injection; or a release broken on arrival for everyone. |

**Axis 2: urgency and staleness (1–5).** How time-sensitive or neglected is it?

| Score | Means |
| --- | --- |
| 1 | No time pressure; nothing waits on it. |
| 2 | Wanted eventually. |
| 3 | Wanted this milestone, or has sat more than 90 days with no activity. |
| 4 | Blocking other work, or tied to a dated external dependency (an SDK release, a spec revision's date). |
| 5 | Blocking a release, or hurting users of a published version right now. |

**Signal bonuses (+1 each, not an axis of their own).** Corroborating evidence
the two axes may have undercounted:

- Carries the `bug` label, or concerns security.
- Has a milestone, meaning it is **already approved**. This is the
  _re-scoring_ case: an issue scored in pass 1 has no milestone by rule, so it
  never earns this bonus. If every issue in a batch is earning it, the milestone
  is being treated as a formality.
- High engagement (many comments, reactions, or linked outside PRs racing to
  fix it).
- Assigned to someone.
- A sub-issue of a larger tracker.
- The reporter set **Fields → Priority** to `Urgent` or `High`: **+1, flat**,
  whichever of the two.

**Bands.** The axes give 2–10 and there are six bonuses, so totals run 2–16.

| Total | Priority | Meaning |
| --- | --- | --- |
| 12+ | **Urgent** | Drop what you're doing. |
| 9–11 | **High** | Next up after current work. |
| 6–8 | **Medium** | Scheduled normally. |
| ≤5 | **Low** | Nice to have; may sit. |

Severity alone does not reach Urgent: a 5/5 with no corroborating signal totals
10 and lands **High**. Urgent is for a severe problem that something _else_ also
says is burning. Override the band when it is plainly wrong, and say why in the
score comment; a rubric nobody may overrule is a rubric people route around.

### Trust boundary: who can set what

**Board #43 is private.** Its Status and Priority are visible only to people
with project access. It is the maintainers' working queue, not a published
commitment. The **score comment** below is public, though: it is how the
reasoning survives, so write it for the reporter to read too.

**Fields → Priority** on the issue page is the opposite: an org-level issue
field, public, and settable by people outside maintainer triage (the two fields
are compared in `board-ops`). A value there is a preference, not an assessment,
so it earns the flat +1 and nothing more. It can lift an issue at most one band,
and nothing a reporter sets reaches Urgent by itself, because Urgent needs 12
and the issue would already need 11 from the maintainer-assessed axes (at most
10) plus at least one other bonus. **Never copy
the value across:** a reporter choosing `Urgent` does not make the card Urgent,
or the queue would sort by assertiveness instead of impact.

### Recording the score

The board stores only the result, and the board is private. So **post the
arithmetic as a comment on the issue**; without it, a later re-scoring cannot
tell a considered judgment from a guess.

```sh
gh issue comment <N> --repo modelcontextprotocol/servers --body \
'**Triage:** Priority **Medium** (total 7)

- Severity 3: `directory_tree` fails on a symlinked root; workaround is listing by hand
- Urgency 2: wanted eventually, nothing blocked on it
- Bonuses: +1 `bug` label, +1 reporter set Fields → Priority to High

Board: Servers V2 (#43), Status `Incoming`, awaiting maintainer review (no milestone yet).'
```

Name each bonus you claimed rather than only summing them. The milestone bonus
in particular should be conspicuously absent from a pass-1 comment; a comment
that lists it shows the approval semantics were misapplied.

## Security reports

A vulnerability in one of the seven servers is reported privately, through the
[advisory form](https://github.com/modelcontextprotocol/servers/security/advisories/new),
and worked in the `security-advisory` flow (#4870). When one arrives as a public
issue or a public PR anyway:

- **Do not restate or discuss the details**, in a comment, in a harvest issue,
  or in a triage score. The score comment for such an issue names only the
  bands.
- **Check the private advisory backlog first** (a maintainer, or an agent with
  access, reads it; the listing is private data and stays out of the repo). A
  public report of something already under advisory must not be answered in a
  way that confirms the advisory.
- **Hand it to a maintainer.** Whether to close it, move it into a private
  advisory, or fix it in the open is theirs to decide. The response below is
  the one they usually post.

<a id="security-response"></a>

> Thank you for reporting this. Please don't add further details here: this
> repository takes vulnerability reports privately, through
> [the advisory form](https://github.com/modelcontextprotocol/servers/security/advisories/new).
> A maintainer will follow up.

## Outside PRs

**An outside PR is closed, not reviewed or merged**, with a pointer to the issue
flow, after anything worth keeping in it is tracked by an issue (`AGENTS.md`,
Contributing). An outside PR is any open PR whose author is **not a repository
maintainer and not Dependabot**. A maintainer is an author whose role on this
repository is `admin` or `maintain`; write access alone is not enough, which is
the policy's point.

Not touched by triage:

- **Dependabot PRs**, the temporary exception in `AGENTS.md`, until #4874
  replaces them.
- **Maintainer-authored PRs.** List any that target `main` for their authors to
  retarget or close; do nothing else with them.
- **An outside PR an open issue already names as the thing to decide** (for
  example #3260 under #4860). That issue owns its fate; leave the PR open and
  name it in the report.

### 1. Snapshot and pre-classify

```sh
D=$(mktemp -d); R=modelcontextprotocol/servers
gh pr list --repo $R --state open --limit 2000 \
  --json number,author,baseRefName,title,files,closingIssuesReferences,labels,createdAt \
  > "$D/prs.json"
jq -e 'length < 2000' "$D/prs.json" >/dev/null \
  || { echo "PR listing truncated or failed — raise --limit" >&2; rm -f "$D/prs.json"; }
# Captured first, so a failed page fails the step instead of yielding a short
# list that would turn maintainers into outside authors.
RAW=$(gh api "repos/$R/collaborators?per_page=100" --paginate --slurp) \
  && jq '[.[][] | select(.role_name=="admin" or .role_name=="maintain") | .login]' \
       <<<"$RAW" > "$D/maintainers.json" \
  || { echo "maintainer list failed" >&2; rm -f "$D/maintainers.json"; }
# A first-guess class from the paths alone. It is a HINT for the reading below,
# never the manifest: a "server change" can be a no-op, a racing duplicate or a
# security fix, and only reading the diff tells which.
jq -r --slurpfile m "$D/maintainers.json" '
  ["everything","filesystem","memory","sequentialthinking","fetch","git","time"] as $seven
  | .[] | .author.login as $a | [.files[].path] as $p
  | (if $a == "app/dependabot" then "dependabot"
     elif ($m[0] | index($a)) then "maintainer"
     elif ($p | length) > 0 and ($p | all(. == "README.md" or . == "ADDITIONAL.md")) then "listing?"
     elif ($p | any(startswith("src/") and ((split("/")[1]) as $d | $seven | index($d) | not))) then "new-server?"
     elif ($p | any(startswith("src/"))) then "server-change?"
     else "repo-level?" end) as $c
  | [.number, $c, ([.closingIssuesReferences[].number] | map("#\(.)") | join(" ")), .title[0:70]]
  | @tsv' "$D/prs.json" > "$D/pre.tsv" \
  && cut -f2 "$D/pre.tsv" | sort | uniq -c \
  || { echo "pre-class failed (a missing input above?)" >&2; rm -f "$D/pre.tsv"; }
```

`gh pr list` stops early without saying so, so a listing that fills its limit
is treated as truncated, like the issue listing in pass 1. The
`collaborators` call needs push access to the repository.

### 2. Classify and write the manifest

Read each outside PR (its description, its diff, its linked issues) and give it
exactly one class. The manifest is a TSV in `$D`, four fields per line: PR
number, the class **slug** from the table, the issue its close comment will
name **or `-`** when nothing is harvested, and a one-line reason. Every field is
filled: `read` collapses adjacent tabs, so an empty field would shift the reason
into the issue column.

| Class | Slug | Recognized by | Harvest? | Close with |
| --- | --- | --- | --- | --- |
| **Listing** | `listing` | Adds a server entry to `README.md` or `ADDITIONAL.md`, or promotes one (a correction to an existing entry is read on its merits, and may be `keep`) | No | [Registry, PR](#registry-pr) |
| **New server** | `new-server` | Adds a server implementation, under `src/` or anywhere else | No | [Registry, PR](#registry-pr) |
| **Archived server** | `archived` | Changes a server that moved to `servers-archived` (it pre-classifies as `new-server?`, since its directory is gone) | No | [Archived](#archived) |
| **No-op or spam** | `no-op` | No effective change (a rename to the same name, whitespace, a README "rename" to itself), or unrelated or generated content | No | [General, PR](#general-pr), without a tracking issue |
| **Duplicate** | `duplicate` | Races another open PR, or an existing issue, for the same fix | Once per group, through its best member | [General, PR](#general-pr), naming the group's issue |
| **Security fix** | `security` | Fixes a vulnerability: path traversal, symlink or Roots escape, SSRF, injection, a vulnerable dependency | See [Security reports](#security-reports) first | **Not by the loop**: a maintainer's call |
| **Fix or enhancement to keep** | `keep` | A bug fix, or an in-scope enhancement (`CONTRIBUTING.md`, "What we act on"), to one of the seven servers or the repository | Yes, unless an open issue already covers it | [General, PR](#general-pr), naming the issue |
| **Out of scope** | `out-of-scope` | A feature `CONTRIBUTING.md` is selective about and a maintainer would not take, or a fix for behavior already gone on `v2/main` | No | [General, PR](#general-pr), without a tracking issue |

**Finding duplicate groups.** Racing PRs usually share a linked issue or the
same changed files, so group by those first, then read each group to confirm
they fix the same thing:

```sh
# Outside PRs grouped by their exact set of changed files; each line is a candidate group.
jq -r --slurpfile m "$D/maintainers.json" '
  [.[] | select(.author.login != "app/dependabot")
       | select(.author.login as $a | $m[0] | index($a) | not)
       | {n: .number, key: ([.files[].path] | sort | join(" "))}]
  | group_by(.key)[] | select(length > 1)
  | "\(map("#\(.n)") | join(" "))\t\(.[0].key[0:100])"' "$D/prs.json"
```

**A maintainer reviews the manifest before anything is closed.** Stop here and
hand it over, with the counts per class and the list of maintainer PRs still
targeting `main`.

### 3. Harvest

For each PR marked for harvest, once the manifest is approved:

- **If an issue already covers the change** (the PR's linked issues first, then
  a search of open and closed issues), file nothing. Comment on that issue
  naming the PR as a prototype and crediting its author, and point the close
  comment at the issue.
- **Otherwise file one issue**, with `issue-create`'s labels (`v2`, one type,
  the scope label where one applies) and its board card, with one difference:
  **board it `Incoming`, with no milestone.** Harvesting preserves a fix; it
  does not approve it. The body states the problem in its own words (never just
  "see the PR"), links the PR as a prototype, and credits its author. Then score
  it in pass 1 like any other inflow.
- **A duplicate group gets one issue**, linking every PR in the group.

### 4. Close

Close each PR with its class's comment, filling in the harvest issue. Closing
keeps the PR, its branch and its discussion readable; the harvest issue links
it.

```sh
# manifest.tsv: <PR>\t<slug>\t<issue or ->\t<reason>, AFTER maintainer review.
# responses/general-tracked.md holds the general comment with "#ISSUE" where the
# issue goes; general-untracked.md, registry.md and archived.md hold the others.
# For the backlog sweep only (#4875): set SWEEP_LABEL to the close label it
# settled on (it must already exist) and SWEEP_REF to "#4875"; leave both empty
# on a routine pass.
SWEEP_LABEL=; SWEEP_REF=
while IFS=$'\t' read -r PR CLASS ISSUE _; do
  ISSUE=${ISSUE#\#}   # accept "#123" as well as "123"
  case "$CLASS" in
    listing|new-server) BODY=$(cat "$D/responses/registry.md") ;;
    archived) BODY=$(cat "$D/responses/archived.md") ;;
    duplicate|keep) [ "$ISSUE" != "-" ] \
        || { echo "#$PR is $CLASS but names no issue — stopping; harvest first" >&2; break; }
      BODY=$(sed "s/#ISSUE/#$ISSUE/" "$D/responses/general-tracked.md") ;;
    no-op|out-of-scope)
      if [ "$ISSUE" != "-" ]; then BODY=$(sed "s/#ISSUE/#$ISSUE/" "$D/responses/general-tracked.md")
      else BODY=$(cat "$D/responses/general-untracked.md"); fi ;;
    security) echo "skipping #$PR: a security fix closes only on a maintainer's call" >&2; continue ;;
    *) echo "unknown class '$CLASS' on #$PR — stopping; fix the manifest" >&2; break ;;
  esac
  # A missing or unfilled response must never become a close with no explanation.
  case "$BODY" in ""|*"#ISSUE"*) echo "no usable response for #$PR — stopping" >&2; break ;; esac
  [ -n "$SWEEP_REF" ] && BODY="$BODY"$'\n\n'"This is part of the backlog triage in $SWEEP_REF."
  if [ -n "$SWEEP_LABEL" ]; then
    gh pr edit "$PR" --repo modelcontextprotocol/servers --add-label "$SWEEP_LABEL" </dev/null \
      || { echo "label FAILED on #$PR — stopping" >&2; break; }
  fi
  gh pr close "$PR" --repo modelcontextprotocol/servers --comment "$BODY" </dev/null \
    || { echo "close FAILED on #$PR — stopping; re-snapshot to see what is left" >&2; break; }
  sleep 5
done < "$D/manifest.tsv"
```

The step 0 issue closes take the same two sweep additions during the backlog
sweep: the close label (`gh issue edit <N> --add-label`) and the `#4875`
sentence at the end of the response, in the original comment rather than a
later edit.

### 5. Verify

The pass is complete when every open PR is maintainer-authored, a Dependabot
PR, or named in the report as left open by an issue that owns it; every closed
PR marked for harvest names an issue that links back to it; and every harvest
issue carries `v2`, one type label, its scope label where one applies, and sits
in `Incoming` with no milestone. Re-run step 1: every remaining line should be
`maintainer`, `dependabot`, or a PR the report names.

### README-only PRs: what `readme-pr-check.yml` did

Until this skill, a workflow answered every PR whose only changed file was
`README.md`: it labeled it `readme: pending`, posted a Registry redirect, and let
the author continue by replying `/i-promise-this-is-not-a-new-server`, which
swapped the label for `readme: ready for review`. That escape hatch invited
exactly the outside PR the policy now closes, so the workflow was retired and
its behavior folded in here. ⚠️ It is deleted on `v2/main` only: a
`pull_request_target` workflow runs from the PR's base branch and an
`issue_comment` one from the default branch, so the copy on `main` keeps
answering PRs against `main` until the next milestone merge.

- Its test, "only `README.md` changed", is the **listing** pre-class above,
  widened to `ADDITIONAL.md`.
- Its Registry redirect is the [Registry, PR](#registry-pr) response.
- A PR carrying `readme: pending` or `readme: ready for review` was labeled by
  it. Treat the label as a hint, not a verdict: a PR that only corrects an
  existing entry (a dead link in the archived list, say) is a fix to keep if it
  is worth doing, and is harvested like any other.

## Canned responses

Each class answers the same way on every pass, so a reporter hears one policy,
not whichever wording a given triager chose. Post them as written; adjust a
sentence only when the class is right but a detail is not.

<a id="general-pr"></a>

**General, PR** (every PR class except listings, new servers and archived
servers). Keep the
sentence for the case that applies:

> Thank you for this pull request. This repository now accepts **issues, not
> pull requests**, from anyone but its maintainers: design and implementation
> are done by the maintainers through a prompt-driven workflow, so outside PRs
> are closed rather than reviewed. The policy is in
> [`CONTRIBUTING.md`](https://github.com/modelcontextprotocol/servers/blob/v2/main/CONTRIBUTING.md).
>
> _(Tracked:)_ This change is tracked in #ISSUE, which links back to this PR and
> credits you.
>
> _(Not tracked:)_ If you'd like this change considered, please open an issue
> describing the problem, how to reproduce it and the expected behavior, and, if
> you prototyped the fix, share the prompt you used rather than a diff.

<a id="registry-pr"></a>

**Registry, PR** (listings and new servers):

> Thank you for this pull request. This repository does not accept new server
> implementations or server listings, and it now accepts **issues, not pull
> requests**, from anyone but its maintainers
> ([`CONTRIBUTING.md`](https://github.com/modelcontextprotocol/servers/blob/v2/main/CONTRIBUTING.md)).
> To make your server discoverable, publish it to the
> [MCP Server Registry](https://github.com/modelcontextprotocol/registry) by
> following its
> [quickstart guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx).

<a id="registry-issue"></a>

**Registry, issue** (a listing request, a server submission, or a request for a
new server):

> Thank you for the suggestion. This repository holds only a small set of
> reference servers maintained by the MCP steering group, and it does not add
> new servers or list third-party ones. To make a server discoverable, publish
> it to the [MCP Server Registry](https://github.com/modelcontextprotocol/registry)
> by following its
> [quickstart guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx);
> published servers can be browsed at
> [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/).

<a id="archived"></a>

**Archived** (an issue or a PR about a server in `servers-archived`):

> Thank you for this. This server is no longer maintained here: it was
> moved to [`servers-archived`](https://github.com/modelcontextprotocol/servers-archived),
> which is read-only, and the README's Archived section links to any official
> replacement. Please check the Registry at
> [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/)
> for a maintained alternative.

<a id="elsewhere"></a>

**Elsewhere** (the SDK or the specification):

> Thank you for the report. This looks like it belongs to
> _(the [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) /
> the [Python SDK](https://github.com/modelcontextprotocol/python-sdk) /
> [the specification](https://github.com/modelcontextprotocol/modelcontextprotocol/issues))_
> rather than to the reference servers, which are built on it. Please file it
> there. If it turns out to reproduce only through one of these servers, reopen
> this with the steps.

<a id="duplicate"></a>

**Duplicate:**

> Thank you for the report. This is already tracked in #ORIGINAL, so I'm closing
> this one as a duplicate. Please add anything new you've found there.

## The board audit

Sweeping in unboarded issues fixes the most visible defect. A board drifts in
other ways that no single-issue rule catches, so **finish every triage run with
this audit; every check should print `0`.** A non-zero count means the board
contradicts a rule in `AGENTS.md`, not that the rule needs revisiting. The audit
is read-only.

| Check | Invariant | Fix |
| --- | --- | --- |
| Non-Issue on #43 | **Only issues go on the board**: no PRs, no drafts, _except_ a `[GHSA-…]` advisory **draft** | Delete the item |
| GHSA draft missing Status/Priority | An exempted advisory draft still carries both | Set them, per `security-advisory` |
| Open issue, no card | Every open issue has been triaged | Pass 1 |
| No Status | Every card carries a Status | Set one: `Incoming` if unmilestoned, else where it actually is |
| `Incoming` **with** a milestone | `Incoming` ⇔ no milestone | The approval was never finished: move to `Todo`, or clear the milestone |
| Past `Incoming` **without** a milestone | Everything past `Incoming` is milestoned | Claims an approval nobody made: milestone it, or move it back |
| Open, no `v2` | Every issue is labeled `v2` | Apply it |
| Open, not exactly one type label | Exactly one of the five types | Classify it, or remove the extra |
| Open, no Priority | Every board item is prioritized | Score it with the rubric |
| Closed unshipped, still carded | **`Done` means the work shipped** | Delete the card |
| Open, but carded `Done` | A card in `Done` means its issue is closed | Close the issue, or move the card back |
| Closed as completed, not in `Done` | Shipped work sits in `Done` | Move the card to `Done` |

```sh
D=$(mktemp -d); R=modelcontextprotocol/servers; LIMIT=5000
# --limit must exceed the repo's TOTAL issue count (1,250 on 2026-09-29), not
# just the open ones: the last checks read closed issues' state reasons. A
# listing that fills the limit is treated as truncated and deleted.
gh issue list --repo $R --state all --limit $LIMIT \
  --json number,state,stateReason,labels,milestone > "$D/i.json"
jq -e --argjson l $LIMIT 'length < $l' "$D/i.json" >/dev/null \
  || { echo "issue listing truncated or failed — raise LIMIT" >&2; rm -f "$D/i.json"; }
gh project item-list 43 --owner modelcontextprotocol --format json --limit 2000 > "$D/b43.json"
jq -e '(.items | length) == .totalCount' "$D/b43.json" >/dev/null \
  || { echo "board #43 listing INCOMPLETE — raise --limit and re-run" >&2; rm -f "$D/b43.json"; }
jq -nr --slurpfile o "$D/i.json" --slurpfile a "$D/b43.json" --arg R "$R" '
  ($o[0] | map({key: (.number|tostring), value: {st: .state, sr: (.stateReason // ""),
                lab: [.labels[].name], ms: (.milestone.title // null)}}) | from_entries) as $M
  # A DRAFT card has no .content.repository, so an equality filter alone would
  # drop the very items the non-Issue check exists to find. Admit items with no
  # repository; exclude only cards that name a different one.
  | [$a[0].items[] | select((.content.repository // null) == null or .content.repository == $R)] as $own
  | def I($n): ($M[($n|tostring)] // null);
    def ms($n): (I($n).ms // null);
    def isopen($n): (I($n).st == "OPEN");
    def shipped($n): (I($n).sr == "COMPLETED");
    def isghsa: .content.type == "DraftIssue" and ((.content.title // "") | startswith("[GHSA-"));
    [$own[] | select(.content.type == "Issue") | {n: .content.number, s: .status, p: .priority}] as $B
  | [$B[].n] as $carded
  | {
    "non-Issue on #43":      [$own[] | select(.content.type != "Issue" and (isghsa | not))
                              | (.content.title // "(untitled)")],
    "GHSA draft missing Status/Priority":
                             [$own[] | select(isghsa) | select(.status == null or .priority == null)
                              | .content.title[0:24]],
    "open issue, no card":   [$o[0][] | select(.state == "OPEN") | .number
                              | select(. as $n | $carded | index($n) | not)],
    "no Status":             [$B[] | select(.s == null) | .n],
    "Incoming w/ milestone": [$B[] | select(.s == "Incoming" and ms(.n) != null) | .n],
    "past Incoming, no ms":  [$B[] | select(.s != null and .s != "Incoming" and .s != "Done"
                                            and isopen(.n) and ms(.n) == null) | .n],
    "open, no v2":           [$o[0][] | select(.state == "OPEN")
                              | select([.labels[].name] | index("v2") | not) | .number],
    "open, not exactly 1 type label":
                             [$o[0][] | select(.state == "OPEN")
                              | select(([.labels[].name]
                                        | map(select(IN("bug","enhancement","documentation","chore","question")))
                                        | length) != 1)
                              | .number],
    "open, no Priority":     [$B[] | select(.p == null and isopen(.n)) | .n],
    "closed unshipped, still carded":
                             [$B[] | select(I(.n) != null and (isopen(.n) | not)
                                            and (shipped(.n) | not)) | .n],
    "open, but carded Done": [$B[] | select(.s == "Done" and isopen(.n)) | .n],
    "closed completed, not Done":
                             [$B[] | select(I(.n) != null and (isopen(.n) | not) and shipped(.n)
                                            and .s != "Done") | .n]
  } | to_entries[] | "\(.value|length)\t\(.key)\t\(.value[0:10])"'
```

What the queries account for:

- **Filter by repository.** #43 is an **org** project and can hold cards from
  any repository in the org. Without the filter, another repository's card reads
  as a defect here, and "fixing" it would edit someone else's tracking.
- **Advisory drafts are carved out by type, title and board together.** A
  private security advisory is tracked by a draft card titled
  `[GHSA-xxxx-yyyy-zzzz]`, the one exception to "no draft cards", added with
  the `security-advisory` flow (#4870). Counting them would pin the non-Issue
  check permanently above zero, and a check that never prints `0` stops being
  read. The exemption is `DraftIssue` **and** the `[GHSA-` prefix, nothing
  broader: a draft titled anything else is still reported (by title, since a
  draft has no number), and so is a **PR** whose title happens to start
  `[GHSA-`, a plausible title for a security fix.
- **The exemption comes with its own check.** `$B` holds Issue items only, so
  the Status and Priority checks never see a draft. Exempting drafts from the
  non-Issue check alone would make a half-made advisory card invisible to the
  whole audit; `GHSA draft missing Status/Priority` reads the item-level
  `.status` and `.priority` that `item-list` exposes for a draft as for an
  issue. The milestone checks read Issue items only too, which is what exempts
  an advisory draft past `Incoming`: its approval is the advisory's acceptance,
  which lives on the advisory, not the board.
- **Count the type labels; don't test for presence.** The invariant is
  _exactly one_, and a presence test passes an issue labeled both `bug` and
  `enhancement`.
- **`Done` is checked from all sides.** One check catches a card for work that
  never shipped; one catches an issue still **open** under a `Done` card; and
  one catches an issue closed as completed whose card never reached `Done`.
  Priority is checked on open issues only: a closed card's Priority no longer
  orders any queue. Closing keywords do not fire on `v2/main`, so every issue is
  closed by hand after its PR merges, and forgetting that is the usual way this
  breaks.
- **`$M` holds closed issues too**, because the last checks read closed issues'
  state reasons. `isopen` is there because the invariants are about open work:
  a closed issue legitimately sits in `Done` with whatever milestone it had.

**Do not "fix" a `Done` card that is missing a milestone.** Cards that predate a
rule are not defects to backfill in bulk: the audit exists to stop new drift,
and rewriting settled history destroys the record of when a rule started being
enforced.
