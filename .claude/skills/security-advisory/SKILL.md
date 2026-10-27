---
name: security-advisory
description: "Take a privately reported vulnerability through this repo's security advisory flow: board it as a draft card, check whether the code is this repo's server or the SDK underneath, accept or reject, fix it in the private fork, release, publish, then turn the card into public tracking. Use when a vulnerability is reported privately; when deciding whether an advisory is ours to fix or belongs to an SDK; when looking up or creating its private fork; when answering a reporter; or when a GHSA-titled board card needs handling."
disable-model-invocation: false
---

# Handling a security advisory

Private vulnerability reporting is enabled on this repository and
[`SECURITY.md`](../../../SECURITY.md) routes every report to it. A report
therefore arrives as a **repository security advisory**, never as an issue, and
for most of its life it must **not** become one: a public issue would disclose
the vulnerability before a fix exists.

Two steps in this flow are **outward-facing, and both stay human-only**:
**accepting** an advisory (the reporter sees it) and **publishing** it (it
becomes public, and there is no unpublish). Closing one as invalid, and every
reply to a reporter, is outward-facing too. **An agent never takes any of
these steps**: not once, not in bulk, not because a checklist said to. It
investigates, prepares a recommendation, and a maintainer acts on it.
Everything else here is mechanics.

⚠️ **Keep advisory details out of every public place**: issues, PRs, commit
messages, branch names, and comments. Until an advisory is published, the only
things safe to say in public about the backlog are **aggregate counts** (how
many are in each state). A branch named after the bug, or a commit message that
describes it, discloses it as surely as an issue would.

Related: `/board-ops` holds the board IDs and the draft-card recipes, and
`/issue-create` gives public tracking its labels and milestone **after
publication**, never merely after the release (step 6).

⚠️ **The PR flow does not apply to the fix itself.** It needs a public issue
and a public PR against `v2/main`, which is the disclosure this flow exists to
delay. The fix is reviewed inside the private fork (step 4), and `AGENTS.md`
records that fork PR as an exception to its PR rules (no public issue link, no
labels, tracked by the draft card).

## The flow

| # | Step | Gate |
| --- | --- | --- |
| 1 | Advisory in state `triage` → **draft card** on board #43 | Mechanical |
| 2 | **Verify the claim**: which server, and does the code belong to it or to an SDK? | Judgment |
| 3 | Valid and ours → **accept** (`triage` → `draft`); otherwise close with a reason | **Human only** |
| 4 | Create the **private fork**, fix and review there | Mechanical |
| 5 | Merge to `v2/main`, milestone merge, **release**, close the fork's PR, then **publish** | **Human only** (closing the fork's PR is mechanical) |
| 6 | **After publication**, convert the draft card into a public issue | Mechanical |

There is **one release line**. Every fix lands on `v2/main` and ships through
the next milestone merge to `main` and a release, as any other change does
([`RELEASING.md`](../../../RELEASING.md)). No older line is patched, so "which
lines are affected" is never a question here.

### 1. Board it as a draft card

An advisory gets a **draft card**, the one exception to
[`AGENTS.md`](../../../AGENTS.md#issue-driven-work-style)'s "every board item is
a real GitHub issue".

- **Title:** the bare id, `[GHSA-xxxx-yyyy-zzzz]`, and **no summary until the
  advisory is published**. A summary can name the server or the attack class,
  and the card is read by a wider audience than the advisory (see the body's
  warning below). The `[GHSA-` prefix is not cosmetic: it is the only thing
  that tells an advisory draft apart from a stray draft card, which is still a
  defect to delete, so any audit of the board's drafts keys on it, and it is
  the exact lookup key.
- **Body:** `**Advisory:** <html_url>` on the first line, then the severity the
  reporter claimed, the reported date, and the provisional Priority line below.
  The link comes first because a maintainer reading the card has no other route
  back to the private advisory.
  ⚠️ **Do not copy the vulnerability description onto the card.** Project access
  and advisory access are **separate permission sets**: anyone who can see board
  #43 reads the card, whether or not they are a collaborator on the advisory.
  The board is private, so this is a wider audience than intended rather than a
  public leak, but a reproduction or a proof of concept belongs only with the
  people handling it. The card carries the **link and triage metadata only**.
- **Status `Incoming`**, with a **provisional Priority** from what the report
  claims. `Incoming` is right even though somebody looked at it to make the
  card: nobody has approved a fix yet, and a draft card has no milestone to
  carry that approval.
  ⚠️ **Provisional is the only honest score at this point.** Step 2 checks
  ownership **before** severity, and a report can look severe right up until
  it turns out to be an SDK's code, or no vulnerability at all. So score what
  the report claims now, and **re-score at the end of step 2**. Until the
  `issue-triage` rubric lands (#4868), map the advisory's severity with the
  table below. (`/issue-create`'s Priority table would put every security
  report at `Urgent`, which leaves the re-score nothing to change.) An
  unverified claim sits one level below a verified one:

  | Advisory severity | Provisional (step 1, as claimed) | Re-scored (step 2, verified and ours) |
  | --- | --- | --- |
  | `critical` | High | Urgent |
  | `high` | High | Urgent |
  | `medium` | Medium | High |
  | `low` | Low | Medium |

  Re-score by the severity you verified, which may differ from the claim.
  Write the result into the body as
  `Priority <level> (provisional, <YYYY-MM-DD>)`: a draft card has no comments,
  so the body is the only place the score can be recorded. When you re-score
  (step 2), keep that line, add `Priority <level> (verified, <YYYY-MM-DD>)`
  under it so the change of view is legible, and **set the card's Priority
  field to the verified level**. Numbers and level names only; the reasoning behind a score is the
  impact, which belongs in the private advisory.
  ⚠️ **Set both fields.** A draft card has no labels and no milestone, so its
  Status and Priority are all the triage state it carries.

The create and lookup recipes are in `/board-ops`
([Advisory draft cards](../board-ops/SKILL.md#advisory-draft-cards)). The card
is made **by hand** (by a maintainer, or an agent working for one), not by a
workflow: a board write needs `organization projects: write`, which a workflow's
`GITHUB_TOKEN` cannot hold.

To see what is waiting (**output is private; never paste it into an issue or a
PR**):

```sh
# --paginate: the endpoint returns 30 per page, and an inventory that silently
# stops at the first page reads as "nothing pending".
gh api --paginate repos/modelcontextprotocol/servers/security-advisories \
  --jq '.[] | select(.state=="triage")
        | "\(.ghsa_id)\t\(.severity)\t\([.vulnerabilities[]?.package.name] | join(","))\t\(.summary)"'

# Aggregate counts by state: the only form that may appear in public.
gh api --paginate repos/modelcontextprotocol/servers/security-advisories \
  --jq '.[].state' | sort | uniq -c
```

### 2. Verify the claim: which server, and whose code

Before assessing severity, establish that the vulnerable code is **ours**, in
this order:

1. **Is it one of the seven servers under `src/`?** Many servers once lived in
   this repository and were moved to
   [`servers-archived`](https://github.com/modelcontextprotocol/servers-archived),
   which is unmaintained and read-only. A report against one of those is
   **out of scope**: there is no code here to fix and nothing to release.
   Servers listed in the README or the Registry are third-party; their reports
   go to their own maintainers.
2. **Is the code path the server's, or an SDK's?** The TypeScript servers are
   built on the TypeScript SDK's v2 packages (`@modelcontextprotocol/server`,
   `@modelcontextprotocol/node` and the frozen `@modelcontextprotocol/server-legacy`)
   ([typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)),
   the Python servers on `mcp`
   ([python-sdk](https://github.com/modelcontextprotocol/python-sdk)). Transport
   handling (Streamable HTTP, SSE, stdio framing, session management, Origin
   and DNS-rebinding checks) and message validation usually live in the SDK. A
   report can be entirely accurate about behavior a server merely exhibits
   because its SDK does it. Reproduce it, find the line that does the wrong
   thing, and check whether that line is in `src/<server>/` or reached through
   the dependency.
3. **Does the server claim the boundary that was crossed?** These are
   **reference implementations** (the README says so), and a server doing what
   its README documents is not a vulnerability. A way around a boundary the
   server _does_ claim (allowed directories, Roots, `robots.txt`) is one. The
   caveat bears on severity and scope; it is never a reason to skip reading
   a report.

⚠️ **"The SDK's problem" is not a reason to say it in public.** A genuine,
unfixed vulnerability handed to a public SDK issue is disclosed, by us, on
someone else's behalf, before they have a fix. Route it through **that SDK's
private advisory form** (private reporting is enabled on both SDK repos), and
reference a public SDK issue only once the SDK has published. Where the reporter
would rather carry it over themselves, say so and let them.

#### The reach classes

Three servers act on the host, and nearly every real advisory lands in one of
their classes. Know them before reading a report, because the report often
names the symptom rather than the class:

| Server | What it can reach | Classes to check |
| --- | --- | --- |
| `filesystem` | Reads and writes the local disk, limited to the allowed directories and the client's Roots | **Path traversal** (`..`, absolute paths, Windows drive and UNC forms, a prefix match that lets `/data` admit `/data-other`); **symlink escape** (a link inside an allowed directory pointing out of it, a link swapped in between check and use); **Roots bypass** (the allowed set not narrowed or refreshed as the client's Roots say) |
| `git` | Runs git against repository paths it is given | **Path traversal** and **symlink escape** out of the configured repository; **Roots bypass**; **argument injection** (a value that starts with `-` read by git as an option) |
| `fetch` | Makes outbound HTTP requests to URLs it is given | **SSRF** (loopback, private and link-local addresses, cloud metadata endpoints, a redirect or a DNS answer that lands on one); **robots bypass** (`robots.txt` not honored, or not re-checked after a redirect, when the server claims to honor it) |

`everything`, `memory`, `sequentialthinking` and `time` reach much less:
`memory` writes one file at a configured path, and `everything`'s HTTP
transports are mostly SDK code (see ownership, above).

**Now re-score the card's Priority**: add the `verified` line under the
provisional one (step 1), and set the card's Priority field to match with the
`/board-ops` edit recipe, so the board orders by the verified level.
This is the first point where severity has anything solid under it: the code is
ours, it reproduces, and you know which class and which server.

### 3. Accept, or close (human only)

**Valid and ours → accept.** In the UI this is "Accept and open as draft"; it
moves the advisory `triage` → `draft`. The API shows it as `state` and
`submission.accepted`.

**Then move the card `Incoming` → `Todo`.** On board #43 the approval act is
normally assigning a milestone, and a draft card cannot carry one, so for an
advisory draft **accepting the advisory is the approval**. `AGENTS.md` records
this as the advisory exemption to its `Incoming` ⇔ milestone rule. The milestone
arrives with the public issue in step 6, where the ordinary rule resumes.

**Invalid, out of scope, a duplicate, or an SDK's → close** with a comment
saying which, and why; for an SDK's, say where it was routed. A reporter who is
told nothing reasonably assumes they were ignored.

⚠️ **Closing an advisory leaves its draft card behind: delete it.** Nothing
shipped, so `Done` would be a false record, and `Incoming` would claim work is
still queued. The delete recipe is in `/board-ops`.

⚠️ **Accepting, closing and replying are human acts, always.** Each is visible
to the reporter, and accepting commits the project to treating the report as a
real vulnerability. Nothing in this skill authorizes an agent to take them:
write the recommendation (accept or close, the class, the owner, the evidence)
and let a maintainer click.

⚠️ **There is no comment API for security advisories.** Not in REST (the
advisory object has no comments endpoint) and not in GraphQL (no advisory
comment mutation exists). Comments are **UI-only**, so every exchange with a
reporter is manual, and the thread cannot be read back with `gh`.

### 4. The private fork

An accepted advisory is fixed in a **private fork** GitHub creates for it: a
private repository named `servers-ghsa-xxxx-yyyy-zzzz` (the id in lowercase) in
the org; read the exact name from `.private_fork.full_name`.

⚠️ **Read `private_fork` FIRST. The POST is not a probe; it CREATES one.**
Calling it to "check whether a fork exists" makes one, which then needs
cleaning up.

```sh
# Does one already exist?
gh api repos/modelcontextprotocol/servers/security-advisories/<GHSA_ID> \
  --jq '.private_fork // "none"'

# Only if that printed "none":
gh api -X POST \
  repos/modelcontextprotocol/servers/security-advisories/<GHSA_ID>/forks
# → 202 Accepted; the fork appears shortly afterwards.
```

⚠️ **Deleting a private fork needs the `delete_repo` OAuth scope, which a
default `gh` token does not carry.** A fork created by mistake cannot be quietly
undone; it takes a re-scoped token or an admin in the UI. That asymmetry is the
reason for the read-first rule.

Fix and review inside the fork. The fix follows the rules in `AGENTS.md` like
any other change: a regression test that fails before the fix, and the gate
under **Before pushing**. Name the branch
`v2/fix/<ghsa-id>` (lowercase, **no descriptive slug**, since a branch name
outlives the fork once merged), and keep commit messages equally opaque until
publication. **The fork's PR targets `v2/main`**, never `main`: check its base
before anyone merges it.

⚠️ **Move the card as the work moves.** `In Progress` when the fix is started,
`In Review` when the fork's PR is open. The fork is invisible to everyone not on
the advisory, so this card is the only place the rest of the team can see the
work exists at all.

#### Work the fix leaves open: a follow-up card

A fix can leave part of the problem open: a platform the fix cannot reach yet,
or a residual exposure that needs a larger change. That work cannot become a
public issue before publication either, because describing it describes the
vulnerability. Track it with a **second draft card**, the advisory's
**follow-up card**, rather than widening the fix or leaving the gap in a PR
body nobody will read again.

- **Title:** `[GHSA-xxxx-yyyy-zzzz follow-up]`, as opaque as the advisory's
  own card. The `[GHSA-` prefix keeps it inside the board audit's advisory
  exemption. The advisory card's lookup (`/board-ops`) matches
  `[GHSA-xxxx-yyyy-zzzz]` with its closing bracket, so it never finds the
  follow-up by mistake. A second follow-up for the same advisory is
  `[GHSA-xxxx-yyyy-zzzz follow-up 2]`.
- **Body:** step 1's link-and-triage rule, with **one exception: the
  write-up**, held to the confidentiality limits in the next bullet. Its
  lines, in order:
  - `**Advisory:** <html_url>` on the first line.
  - `Follow-up to the fix for this advisory. Convert to an issue only once the advisory is published.`
  - The `Priority <level> (provisional, <YYYY-MM-DD>)` line.
  - The write-up, under a `## Write-up` heading.
- **The write-up lives on the card itself**, never only in the private fork.
  ⚠️ **Publishing an advisory deletes its temporary private fork**, and every
  review and comment in it with it, while step 6 needs the write-up _after_
  publication. Draft it as the public issue it will become (problem, options,
  acceptance criteria). The card is read by everyone with board access (step
  1), so the write-up describes the remaining work and leaves the reproduction
  and any proof of concept in the private advisory.
- **Status `Todo`** when a maintainer asked for the follow-up: the advisory is
  already accepted, and asking for the work approves it. Otherwise it goes in
  `Incoming`. Score its Priority with step 1's table, using the severity of the
  residual exposure rather than the advisory's.
- **Say in the fix PR's body what the fix leaves open**, and link the
  follow-up. The advisory's text must say it too when it is published (step 5).

Create it with `/board-ops`'s draft-card recipe, using the follow-up title in
place of `[$GHSA]`.

⚠️ **The follow-up card is the only exception beyond the advisory's own
card.** Any other untracked work an advisory's review turns up falls into one
of three cases:

- It is part of the fix.
- It is a **separate vulnerability**, which goes through its own private
  advisory: this repository's for ours, or the SDK's advisory form for an
  SDK's (step 2). Publishing this advisory never makes another one safe to
  disclose.
- It is non-security work outside the advisory's scope, which gets a public
  issue **after publication**, like any other finding.

### 5. Merge, release, publish (human only)

Publish **after** the fix has shipped in a release, never before: publishing
discloses the vulnerability, and doing it while users have no upgrade hands out
a working exploit. **Shipped** means the fixed version of that server is on npm
or PyPI.

⚠️ **The patch stops being secret at MERGE, not at publish.** Merging the fork
puts an ordinary public commit on `v2/main`, readable by anyone, and it then
travels through the milestone merge to `main` before `release.yml` publishes it.
The time between merge and publish is not a period of secrecy; it is a period
of **exposure to anyone reading commits**, so keep it short: merge close to the
release, and publish as soon as the release is out.

The release itself is a maintainer action (`release.yml` runs only when a
maintainer publishes a GitHub Release, behind the `release` environment's
approval; see [`RELEASING.md`](../../../RELEASING.md)). Say which server needs a release and
stop there.

⚠️ **Publishing is irreversible and human-only.** It makes the advisory public,
with no undo. Same rule as accepting: recommend, never perform.

#### Close the fork's PR once its fix is on `v2/main`

**GitHub will not publish an advisory while its private fork has an open pull
request.** The advisory page says "you must merge or close outstanding pull
requests" and **Publish advisory** stays disabled. The fix reaches `v2/main`
through a PR in this repository, so the fork's own PR is left open with
nothing still to merge, and blocks publication until someone closes it.

Closing it is mechanical and reversible (a PR can be reopened), and it neither
closes nor publishes the advisory. Close a PR **only once its head is on
`origin/v2/main`**:

```sh
GHSA=<GHSA_ID>
FORK=$(gh api repos/modelcontextprotocol/servers/security-advisories/$GHSA \
  --jq '.private_fork.full_name // empty') || FORK=
[ -n "$FORK" ] || echo "no private fork for $GHSA (or the lookup failed)" >&2
git fetch origin v2/main
for pr in $( [ -n "$FORK" ] && gh api --paginate "repos/$FORK/pulls?state=open" \
    --jq '.[] | "\(.number):\(.head.sha)"'); do
  n=${pr%%:*}; sha=${pr#*:}
  # The fork's commits are not in this clone until fetched; an unknown SHA
  # fails --is-ancestor, which leaves the PR open: the safe direction.
  git fetch -q "https://github.com/$FORK.git" "$sha" 2>/dev/null
  if git merge-base --is-ancestor "$sha" origin/v2/main; then
    gh api -X PATCH "repos/$FORK/pulls/$n" -f state=closed --jq '"closed \(.html_url)"'
  else
    echo "$FORK#$n: head $sha is NOT on v2/main; left open" >&2
  fi
  sleep 1
done
```

- ⚠️ **A PR whose head is not on `v2/main` stays open.** Its fix has not
  shipped, so the advisory is not ready to publish; find out what is missing
  rather than closing the PR to unblock the button.
- **Close it without a comment.** The forks have issues disabled, so a PR
  comment (the issue-comments endpoint) returns `404`.

#### Before publishing, check what publishing will show

A published advisory is what users and advisory tooling (Dependabot,
`npm audit`, `pip-audit`) remediate from, and publishing deletes the private
fork, so check each of these first:

- **No open PR in the private fork.** Run the close recipe above. Found now,
  it is a recipe; found at the button, it is a disabled button and no reason
  given beyond "outstanding pull requests".
- **Nothing that matters lives only in the fork.** Publishing deletes it.
  Review findings worth keeping, a residual-exposure note, a follow-up's
  write-up: copy each onto the advisory (if it belongs in what is published) or
  onto the draft card that tracks it (a follow-up's write-up goes in **its
  follow-up card's** `## Write-up` section, where step 6 reads it), within step
  4's confidentiality limits, before the button is pressed.

- **The affected product**: ecosystem (`npm` or `pip`) and package name, as
  published (`@modelcontextprotocol/server-filesystem`, `mcp-server-git`).
- **The vulnerable version range**, and the **first patched version**: the
  version the release actually published, which is known only once that release
  is out. An advisory with no patched version tells nobody how to remediate.
- **The severity**, as verified in step 2 rather than as reported.
- **The credits.** A privately reported advisory already credits its reporter
  (GitHub adds the credit on submission; it may still be pending the
  reporter's acceptance), so confirm it is there rather than adding it. An
  advisory a maintainer opened directly has no credits until someone is
  added, and an unadded finder is simply never credited.
- **A CVE**, if one is wanted: optional, and the advisory is the only place to
  request one.
- **What the fix leaves open**, if the advisory has a follow-up card. Say which
  platforms or cases are still exposed, so a user who upgrades does not believe
  they are fully covered.

### 6. After publication, convert the card into public tracking

**The trigger is publication, not the release.** The release ships the fix
while the advisory can still be private, and a public issue opened in that gap
describes a vulnerability the advisory has not disclosed yet.

⚠️ **Convert the draft; do not file a new issue.** "Convert to issue" creates a
**new** issue from the draft card, and there is no way to point an existing card
at an issue filed separately, so filing by hand and then converting produces two
issues and two cards.

1. **Give the card its public title first**, `[GHSA-xxxx-yyyy-zzzz] - <published
   summary>` (edit the draft's title on the card), since the issue takes the
   card's title. Only now, with the advisory public, may the summary appear.
2. **Convert the draft card to an issue** in `modelcontextprotocol/servers`
   (the card keeps its place and its field values). The recipe is in
   `/board-ops`.
3. Apply the labels and milestone from `/issue-create` (steps 1 and 2): `v2`,
   one type label (normally `bug`), the server's scope label, and the milestone
   of the release the fix shipped in. **Skip its board step**: the converted
   card is already on #43.
4. Replace the body's triage lines with a link to the now-public advisory, and
   **close** the issue: the work shipped before the issue existed.
5. Move the card to **`Done`**, which is right here because the fix shipped.

**A follow-up card converts at the same time, but stays open**, because its
work has not shipped:

1. Retitle it `[GHSA-xxxx-yyyy-zzzz follow-up] - <summary>`.
2. Convert it.
3. Replace the body's triage lines with the card's own `## Write-up` section
   (step 4), linking the now-public advisory. The fork is gone by now, so the
   card is the only copy.
4. Apply `/issue-create`'s labels. A card already past `Incoming` also takes
   the milestone the follow-up is planned for, not the one the fix shipped in.
   A card still in `Incoming` stays unmilestoned: once it is an issue the
   ordinary `Incoming` ⇔ no-milestone rule applies, and a maintainer approves
   it by assigning the milestone and moving it to `Todo`.
5. Leave the issue open, and leave the card in the Status it had.

## API facts worth not re-deriving

| Thing | Fact |
| --- | --- |
| States | `triage` → `draft` (accepted) → `published`; or `closed` |
| Accepted? | `submission.accepted` on the advisory object, alongside `state` |
| Listing | `GET repos/{owner}/{repo}/security-advisories`, 30 per page, so always `--paginate` |
| Private fork | `POST …/security-advisories/{ghsa_id}/forks` → `202`, a private repo `servers-ghsa-xxxx-yyyy-zzzz` (lowercase) in the org; exact name in `.private_fork.full_name` |
| Fork idempotency | Read `.private_fork` first; the POST creates, it does not probe |
| Fork deletion | Needs the `delete_repo` OAuth scope, which a default `gh` token lacks. **Publishing deletes the fork** on its own: the repo returns `404` and `.private_fork` reads `null` |
| Publishing blocked | An open PR in the private fork disables **Publish advisory**; close it once its head is on `v2/main` (step 5) |
| Comments | **No API at all**, REST or GraphQL; UI-only |
| Fork PR comments | Issue comments (`gh pr comment`, `issues/N/comments`) are refused and `…/comments/{id}/replies` returns `404`; reply in a thread with `POST pulls/N/comments -F in_reply_to=<id>`, and post a PR-level summary as a `COMMENT` review |
| Credits | `credits_detailed` on the advisory; a private report carries the reporter's credit (`type` `reporter`, `state` `pending` or `accepted`) from submission |
| Board writes | Not automatable from Actions: `GITHUB_TOKEN` cannot hold `organization projects: write` |
| SDK routing | Both SDK repos have private vulnerability reporting enabled; use their advisory forms |
