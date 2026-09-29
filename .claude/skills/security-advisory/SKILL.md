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
delay. The fix is reviewed inside the private fork (step 4).

## The flow

| # | Step | Gate |
| --- | --- | --- |
| 1 | Advisory in state `triage` → **draft card** on board #43 | Mechanical |
| 2 | **Verify the claim**: which server, and does the code belong to it or to an SDK? | Judgment |
| 3 | Valid and ours → **accept** (`triage` → `draft`); otherwise close with a reason | **Human only** |
| 4 | Create the **private fork**, fix and review there | Mechanical |
| 5 | Merge to `v2/main`, milestone merge, **release**, then **publish** | **Human only** |
| 6 | **After publication**, convert the draft card into a public issue | Mechanical |

There is **one release line**. Every fix lands on `v2/main` and ships through
the next milestone merge to `main` and a release, as any other change does
([`RELEASING.md`](../../../RELEASING.md)). No older line is patched, so "which
lines are affected" is never a question here.

### 1. Board it as a draft card

An advisory gets a **draft card**, the one exception to
[`AGENTS.md`](../../../AGENTS.md#issue-driven-work-style)'s "every board item is
a real GitHub issue".

- **Title:** `[GHSA-xxxx-yyyy-zzzz] - <advisory summary>`. The `[GHSA-` prefix
  is not cosmetic: it is the only thing that tells an advisory draft apart from
  a stray draft card, which is still a defect to delete, so any audit of the
  board's drafts keys on it. Look a draft up by that bracketed id, never by words from the summary.
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
  `issue-triage` rubric lands (#4868), score with the Priority table in
  `/issue-create` (step 3), and write the result into the body as
  `Priority <level> (provisional, <YYYY-MM-DD>)`: a draft card has no comments,
  so the body is the only place the score can be recorded. When you re-score,
  keep that line and add the new one under it, so the change of view is
  legible. Numbers and level names only; the reasoning behind a score is the
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
   built on `@modelcontextprotocol/sdk`
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

**Now re-score the card's Priority**, under the provisional line (step 1).
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
private repository named `servers-<ghsa-id>` in the org.

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
any other change: a regression test that fails before the fix, and the checks
under **Before pushing** for the server it touches. **The fork's PR targets
`v2/main`**, never `main`: check its base before anyone merges it.

⚠️ **Move the card as the work moves.** `In Progress` when the fix is started,
`In Review` when the fork's PR is open. The fork is invisible to everyone not on
the advisory, so this card is the only place the rest of the team can see the
work exists at all.

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

The release itself is a maintainer action (`release.yml` runs on
`workflow_dispatch` only, behind the `release` environment's approval; see
[`RELEASING.md`](../../../RELEASING.md)). Say which server needs a release and
stop there.

⚠️ **Publishing is irreversible and human-only.** It makes the advisory public,
with no undo. Same rule as accepting: recommend, never perform.

**Before publishing, do the two things publishing will not do:** request a
**CVE** if one is wanted (optional, and the advisory is the only place to ask),
and **add the reporter to the credits**. A credit is an explicit addition that
the person then has to accept, so an unadded reporter is simply never credited,
and nothing reports that.

### 6. After publication, convert the card into public tracking

**The trigger is publication, not the release.** The release ships the fix
while the advisory can still be private, and a public issue opened in that gap
describes a vulnerability the advisory has not disclosed yet.

⚠️ **Convert the draft; do not file a new issue.** "Convert to issue" creates a
**new** issue from the draft card, and there is no way to point an existing card
at an issue filed separately, so filing by hand and then converting produces two
issues and two cards.

1. **Convert the draft card to an issue** in `modelcontextprotocol/servers`
   (the card keeps its place and its field values). The recipe is in
   `/board-ops`.
2. Apply the labels and milestone from `/issue-create` (steps 1 and 2): `v2`,
   one type label (normally `bug`), the server's scope label, and the milestone
   of the release the fix shipped in. **Skip its board step**: the converted
   card is already on #43.
3. Replace the body's triage lines with a link to the now-public advisory, and
   **close** the issue: the work shipped before the issue existed.
4. Move the card to **`Done`**, which is right here because the fix shipped.

## API facts worth not re-deriving

| Thing | Fact |
| --- | --- |
| States | `triage` → `draft` (accepted) → `published`; or `closed` |
| Accepted? | `submission.accepted` on the advisory object, alongside `state` |
| Listing | `GET repos/{owner}/{repo}/security-advisories`, 30 per page, so always `--paginate` |
| Private fork | `POST …/security-advisories/{ghsa_id}/forks` → `202`, a private repo `servers-<ghsa-id>` in the org |
| Fork idempotency | Read `.private_fork` first; the POST creates, it does not probe |
| Fork deletion | Needs the `delete_repo` OAuth scope, which a default `gh` token lacks |
| Comments | **No API at all**, REST or GraphQL; UI-only |
| Board writes | Not automatable from Actions: `GITHUB_TOKEN` cannot hold `organization projects: write` |
| SDK routing | Both SDK repos have private vulnerability reporting enabled; use their advisory forms |
