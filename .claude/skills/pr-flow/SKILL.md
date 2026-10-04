---
name: pr-flow
description: "Take an issue through to a PR in this repo and close it out after merge. Use when asked to open, create or submit a PR; when naming a branch; when signing off commits or repairing a missing Signed-off-by; when recording client evidence for a PR; when requesting a Copilot review, answering its comments or deciding whether to run another round; or when closing out after a merge."
disable-model-invocation: false
---

# PR flow

The rules this procedure carries out live in [`AGENTS.md`](../../../AGENTS.md)
(**Contributing**, **Issue-driven work style**, **Responding to code reviews**,
**Waiting on long-running work**). Board mechanics, including every board ID,
are in `/board-ops`; creating a missing issue is `/issue-create`. This file names
board columns and nothing else.

**Pull requests against this repo are opened by the maintainers only.** Write
access is not authorization to open one. Anyone else files a detailed issue
(`/issue-create`) and a maintainer takes it from there.

## 1. Start from an issue

**Every PR closes an issue.** A PR with no linked issue has no board card, so
the work is invisible to the board. If there is no issue yet, create one first
with `/issue-create`; never open the PR and backfill.

**Read the issue in full, every comment included.** Scope changes, maintainer
decisions and "not this, that" corrections are usually in the comments, not the
body:

```sh
gh issue view <N> --repo modelcontextprotocol/servers --comments
```

Then assign it to yourself and move its card to **In Progress** (the
move-a-card recipe in `/board-ops`):

```sh
gh issue edit <N> --repo modelcontextprotocol/servers --add-assignee @me
```

## 2. Branch

`v2/<type>/<N>-<slug>`, cut from **`origin/v2/main`**:

```sh
git fetch origin v2/main
git switch -c v2/fix/4810-filesystem-symlink-escape origin/v2/main
```

`<type>` follows the issue's type label: `bug` → `fix`, `enhancement` → `feat`,
`documentation` → `docs`, `chore` → `chore`. A `question` has no branch type,
because answering one ships nothing: if it turns out to need a change, relabel
the issue with the type that change is, then branch. The `v2/` prefix matches the base
branch and keeps the work legible in `git branch -a` next to `main`.

**Never cut from `main`.** It is the release line and does not carry `v2/main`'s
history, so the PR diff would show unrelated changes.

**Stacking.** When one issue's work depends on another PR that has not merged
yet, branch from that PR's branch and open the PR with `--base` set to it. Say
in the body that it is stacked and on which PR. When the lower PR merges,
retarget the stacked one to `v2/main` (`gh pr edit <PR> --base v2/main`) and
rebase it if GitHub reports conflicts.

## 3. Sign off every commit (DCO)

This repo adopted the [Developer Certificate of
Origin](https://developercertificate.org/) (maintainer decision on #4861).
Commit with **`git commit -s`**, every time.

⚠️ **The [probot DCO app](https://probot.github.io/apps/dco/) is not installed on
this repo yet**, so today nothing fails an unsigned commit. Installing it is an
org-admin step (#4867). Sign off anyway: once the app is on, it checks
every commit in a PR, so an unsigned commit pushed today becomes a red check
that can only be cleared by rewriting history. Once the app enforces the check,
`AGENTS.md` gains the signoff rule and this paragraph goes.

What the app checks: each commit carries a `Signed-off-by: Name <email>` trailer
whose name **and** email match the commit's author or its committer. Merge
commits and bot-authored commits are exempt. There is no partial credit: one
unsigned commit out of six fails the whole check.

Two things that look like automation and are not:

- ⚠️ **`git config format.signOff true` does nothing here.** Despite the name,
  it only defaults the `-s` flag for `git format-patch`. `git commit` never reads
  it, and there is no `commit.signoff` equivalent.
- ⚠️ **A `prepare-commit-msg` hook works, but think before installing one.** The
  trailer is a certification, and a hook makes it on your behalf for _every_
  commit, including work you merely cherry-picked. Inside that hook,
  `git var GIT_AUTHOR_IDENT` returns your config identity rather than the
  preserved author, so it cannot even tell it is signing for someone else.

**Repairing commits already pushed** means rewriting them:

```sh
git rebase HEAD~<n> --signoff
git push --force-with-lease
```

Use `--force-with-lease` rather than `--force`, and rewrite only when you are the
sole author and nobody has based work on the branch (a stacked PR above yours
has). The two apparent alternatives are not alternatives: the app's empty
"remediation commit" flow needs `allowRemediationCommits.individual`, and this
repo ships no `.github/dco.yml`, so it is disabled; and the override button that
anyone with write access sees only silences the check, with nobody certifying
anything.

The signoff is a DCO assertion made in **your own name**. It does not claim you
wrote the code, so signing off a cherry-pick is legitimate. Fabricating
_someone else's_ certification never is.

## 4. Run the gate

Format, then run the pre-push gate, and fix what fails before pushing:

```sh
npm run format                    # TypeScript; in a Python server: uv run --frozen ruff format .
npm run local:gate; echo "EXIT=$?"
```

`local:gate` runs every check CI runs, for both languages, whatever the change
touched. Verify by the exit code, not by grepping the output. What each stage
checks and how to fix a red one is `/pre-push-gate`; the stage list is
[`docs/quality-gate.md`](../../../docs/quality-gate.md).

One thing the gate deliberately leaves out:

| Change touches | Also run |
| --- | --- |
| A skill's description, or a new skill | `npm run skills:eval` for the **whole** suite (spends model calls; not in the gate or CI). See `AGENTS.md` **Maintaining the skills** |

## 5. Client evidence

A PR shows the change working, under the body's **How Has This Been Tested?**
section (step 6). Here that means evidence from clients, not screenshots.

**A change to server behavior** (a tool, resource, prompt, capability,
transport or error it returns) records, for **both** the Inspector V2 and an
LLM client, in **both** spec eras (a 2026-07-28 client and a 2025-11-25 client,
per #4857):

- what the client was asked to do (the Inspector action, or the prompt given to
  the LLM client), and
- what it returned (the result, trimmed to what shows the change).

A before/after pair is best when the change fixes a bug: the same request
against `v2/main` and against the branch.

**A change with no client-observable surface** (docs, skills, workflows, gate
tooling, CI) carries a **targeted probe** instead: the one thing that proves
it. For example, the guard made to fire on a planted defect and then pass, the
workflow run that exercised the new job, the query that reads back the state a
skill's recipe produced, or the `skills:eval` scores for a skill.

Put the evidence in the PR body under **How Has This Been Tested?**.

## 6. Open the PR

Base **`v2/main`** (or the lower branch, when stacked). **Never `main`.** Label
it `v2`. The body's **first line is `Closes #<N>`**.

The body carries these sections, in order. `.github/pull_request_template.md`
is only the "issues, not PRs" banner that turns outside PRs away, so this list
is where the structure lives:

- **Description**: what changed and why.
- **Server Details**: the server (or "none (repository-wide)") and what in it
  changed (tools, resources, prompts, docs, …).
- **Motivation and Context**: the problem it solves; usually a pointer to the
  issue.
- **How Has This Been Tested?**: the evidence from step 5.
- **Breaking Changes**: whether users must change their client configuration.
- **Types of changes**: tick each that applies: bug fix, new feature, breaking
  change, documentation update.
- **Checklist**: answer every item. Tick each that holds, and tick and mark
  each that does not apply "(not applicable: <why>)"; leave none blank:
  - [ ] I have read the [MCP Protocol Documentation](https://modelcontextprotocol.io)
  - [ ] My changes follow MCP security best practices
  - [ ] I have updated the server's README accordingly
  - [ ] I have added a changeset (`npm run changeset`) if this changes what a
        TypeScript server publishes
  - [ ] I have tested this with an LLM client
  - [ ] My code follows the repository's style guidelines
  - [ ] New and existing tests pass locally
  - [ ] I have added appropriate error handling
  - [ ] I have documented all environment variables and configuration options
- **Additional context** (optional): implementation notes or design decisions.

Write the body to a file and pass it with `--body-file`. A body passed inline
in double quotes goes through the shell, so every backtick in its Markdown runs
as a command substitution and `$VAR` expands. Keep the file outside the
worktree, where `git add -A` cannot pick it up.

```sh
BODY=$(mktemp)
cat > "$BODY" <<'EOF'
Closes #<N>

<the sections above, with the evidence>
EOF
gh pr create --repo modelcontextprotocol/servers \
  --base v2/main --label v2 --title "<title>" --body-file "$BODY"
```

⚠️ Closing keywords only link and auto-close for PRs that target the default
branch (`main`). Against `v2/main`, `Closes #N` is only a cross-reference.
Keep the line anyway, and **link the PR to the issue explicitly** right after
opening it:

```sh
PR=<PR_NUMBER>; N=<ISSUE_NUMBER>
PR_ID=$(gh pr view "$PR" --repo modelcontextprotocol/servers --json id --jq .id)
ISSUE_ID=$(gh issue view "$N" --repo modelcontextprotocol/servers --json id --jq .id)
gh api graphql -f query='
  mutation($issue:ID!,$pr:ID!) {
    addCloseIssueReferences(input:{issueId:$issue, pullRequestIds:[$pr]}) {
      issue { number }
    }
  }' -f issue="$ISSUE_ID" -f pr="$PR_ID"

# Read the link back: the issue number must be listed.
gh pr view "$PR" --repo modelcontextprotocol/servers \
  --json closingIssuesReferences --jq '[.closingIssuesReferences[].number]'
```

The link does **not** make the issue close on merge into `v2/main`; that is
still done by hand in step 9.

Then move the card to **In Review** (`/board-ops`). The PR itself never goes on
the board.

## 7. Request a Copilot review

Only the GraphQL `requestReviews` mutation with the Copilot **bot id** works.
REST, `gh pr edit --add-reviewer`, `userIds` and `copilot-swe-agent` all fail or
silently drop the request.

```sh
PR_ID=$(gh pr view <PR> --repo modelcontextprotocol/servers --json id --jq .id)
gh api graphql -f query='
  mutation($pr:ID!,$bot:[ID!]!) {
    requestReviews(input:{pullRequestId:$pr, botIds:$bot, union:true}) {
      pullRequest { id }
    }
  }' -f pr="$PR_ID" -f bot='BOT_kgDOCnlnWA'
```

A round usually lands in about five minutes. Wait for it with **one backgrounded
loop that exits when the round lands, or when its deadline passes**, and wait
for its notification rather than re-fetching once per turn. A review is remote
state the harness cannot observe, which is the exception in `AGENTS.md`
**Waiting on long-running work**, and this loop is where that poll belongs.

```sh
PR=<PR>
EXPECTED=1          # the review COUNT to reach; see below
DEADLINE=$(( $(date +%s) + 20*60 ))
while :; do
  # Capture first, so a gh failure stops the loop instead of being swallowed by
  # a pipeline. --slurp cannot be combined with --jq, hence the separate jq.
  raw=$(gh api --paginate --slurp \
    repos/modelcontextprotocol/servers/pulls/$PR/reviews) || {
      echo "gh api failed ($?); not retrying blind" >&2; exit 1; }
  n=$(jq '[.[][] | select(.user.login | startswith("copilot-pull-request-reviewer"))] | length' <<<"$raw") || {
      echo "jq failed ($?) on an unexpected response shape" >&2; exit 1; }
  case $n in '' | *[!0-9]*) echo "not a count: '$n'" >&2; exit 1 ;; esac
  [ "$n" -ge "$EXPECTED" ] && { echo "round landed ($n reviews)"; break; }
  [ "$(date +%s)" -ge "$DEADLINE" ] && { echo "SILENT: no review by the deadline"; break; }
  sleep 30
done
```

`EXPECTED` is the review **count** to reach, so it is `1` only on the first
round; on round two the first round's review is still there, and an existence
check would return at once. Match the login with `startswith`: it carries a
`[bot]` suffix. `sleep 30` is the remote-API floor `AGENTS.md` sets. **Every
step that can fail exits the loop rather than retrying**: piping the count into
`awk` would make an auth error read as `0`, and an empty count from a `jq`
failure would make the comparison fail forever, so the job sleeps and retries
without end. A background task that can never succeed is worse than none,
because it looks like progress.

Once the body lands, give the inline comments about another 60 seconds: they
arrive after it (step 8).

## 8. Respond to the review

Judge each finding against **the issue the PR closes**, as `AGENTS.md`
**Responding to code reviews** says: fix defects in what the PR added; decline
scope creep (pre-existing behavior, new capabilities, hardening the issue did
not ask for) with a reason, and file an issue (`/issue-create`) for any that is
worth doing on its own. Implementing a suggestion differently is fine.

- **Reply to each review comment in its own thread**, saying what was done (with
  the commit) or why it was declined. That reply is the primary response, and it
  is not optional: each comment is a thread with its own resolve state, and a
  reply _in_ it is the only thing a reader of that thread sees. Replying does
  not resolve the thread; resolving is the reviewer's act.

  ```sh
  # The round's comments, by REVIEW id. The unpaginated /reviews listing hides
  # later rounds behind your own replies, and this endpoint returns 30 per page:
  # a round you only half fetch is a round you only half answer.
  gh api --paginate repos/modelcontextprotocol/servers/pulls/<PR>/reviews/<REVIEW_ID>/comments \
    --jq '.[]|"\(.id) \(.path):\(.line)\n\(.body)\n"'

  # Reply into one thread, keyed by the comment id from above.
  gh api repos/modelcontextprotocol/servers/pulls/<PR>/comments/<COMMENT_ID>/replies \
    -f body='Fixed in <sha>: …'
  ```

- ⚠️ **Then post a PR-level summary of the round, in addition, never instead.**
  Inline replies go hidden once the fix is pushed, because the threads become
  outdated, so the summary is what keeps the round readable afterwards. It does
  not replace the per-thread replies: a summary bullet cannot be connected back
  to the thread it answers.

  ```sh
  # Quoted heredoc, for the same reason as the PR body in step 6: Markdown
  # backticks inside a double-quoted --body run as commands.
  gh pr comment <PR> --repo modelcontextprotocol/servers --body-file - <<'EOF'
  Copilot round <k>: …
  EOF
  ```

  Per-thread replies (`-f body=…` above) need the same care: single-quote
  the body, or read it from a file with `-F body=@<file>`.

- ⚠️ **Read the "Suppressed comments" block in the review body.** Those findings
  have no comment id, so no thread to reply into. The PR-level summary is the
  only place to answer them.
- ⚠️ **Inline comments lag the review body.** The body's "generated N comments"
  count lands first. Fetch by review id, and reconcile the count before
  answering.

Push the fixes (signed off, step 3) before requesting the next round.

## 9. Another round, or stop

Request another round (step 7) in one of two cases, and no other:

- **You pushed a fix** in response to the last round. Raise `EXPECTED` by one.
- **The last round was silent** (no review by the poll's deadline). Nothing was
  reviewed, so request again **without** a push and **without** raising
  `EXPECTED`: the count you are waiting for has not been reached yet.

The loop stops at the **first** of:

| Exit | When | Then |
| --- | --- | --- |
| **Clean round** | A review with no findings. No confirming round is needed | Stop |
| **Out of scope only** | Every finding in the round was declined as outside the issue | Reply in each thread, stop. Nothing was pushed, so there is nothing new to review |
| **Two silent rounds** | Two requests in a row end with no review: the poll's deadline passed, or Copilot's session ended without posting | Stop, and say so in the summary |

**There is no round cap.** A loop ends for one of the three reasons above,
never because of how many rounds it has run: stopping on a count leaves known
findings open with nothing but a number to explain why.

⚠️ **What keeps a loop short is the scope rule, not a limit.** Copilot does not
converge on its own, and every fix it talks you into beyond the issue is fresh
surface for the next round, so accepting scope creep is what makes a review
cycle protracted. When a loop runs long, look at what the last rounds asked
for. A defect in what the PR added is fixed, however many rounds that takes.
Pre-existing behavior, a new capability, or hardening the issue did not ask
for is declined with a reason in the thread (step 8), and a round holding only
those is the **Out of scope only** exit.

If the session has to end while a round is still pending, say so in the
PR-level summary and in your reply: the request stays open, and whoever picks
the PR up reads that round rather than requesting a new one.

A round that posted nothing new is still reported in the PR-level summary, so
the PR shows why the loop ended.

## 10. Merge and close out

Merging is a maintainer's decision. Do not merge on your own initiative.

**On merge into `v2/main`, close the issue by hand and move its card to
Done**, since auto-close does not fire there:

```sh
gh issue close <N> --repo modelcontextprotocol/servers --reason completed
```

Then Status → **Done** with the move-a-card recipe in `/board-ops`.

`Done` means the work **shipped**. If the PR is closed without merging and the
issue will not be done, the issue shipped nothing: close it as not planned and
**delete its card** (`/board-ops`) rather than moving it to Done.

If PRs were stacked on this one, retarget each to `v2/main` (step 2).
