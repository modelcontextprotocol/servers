---
name: release
description: "Cut a milestone release: the release issue, the preparation PRs on v2/main (audit, changesets Version Packages, Python CalVer), the pure v2/main to main merge PR with its release ledger, then the GitHub Release a maintainer publishes."
disable-model-invocation: true
---

# Cutting a milestone release

How versions and publishing work, and what to do when a publish fails, is
[`RELEASING.md`](../../../RELEASING.md). This skill is the procedure for one
milestone, start to finish. It is started by name only (`/release`), because a
release is never something to begin by inference.

A release is cut from **`main`**, after the milestone's work has been merged
there from `v2/main`. Nothing publishes from `v2/main`: `release.yml` refuses a
Release whose commit is not on `main`.

**What stays human.** Publishing the GitHub Release and approving the `release`
environment deployments are a maintainer's acts. So is merging any PR. Prepare,
verify and recommend; do not perform those.

## The shape

One **release issue**, up to three **preparation PRs** on `v2/main`, one
**merge PR** into `main`, then the **Release**. In that order: each step needs
the one before it merged.

| | Preparation PRs | The merge PR |
| --- | --- | --- |
| Base | **`v2/main`** | **`main`** |
| Carries | The audit's forced fixes; the TypeScript version bumps; the Python version stamps | The milestone's work, arriving whole from `v2/main`. **No commits of its own** |
| References the release issue with | `Closes #N` (a cross-reference only, on `v2/main`) | `Part of #N` (**non-closing**: `main` is the default branch, where `Closes` would close the issue before anything is published) |
| Verified by | `npm run local:gate`, CI | `npm run local:gate`, **plus** `npm run pack:verify`, **plus** every milestone issue exercised, written up as the **release ledger** |

⚠️ **Do not fold them together.** A version bump made on the merge branch
exists only downstream of `v2/main`, and nothing carries it back: the develop
branch would keep reporting the previous version, and the next branch cut from
it would too.

## 1. The release issue

One per milestone, titled **`Release vX.Y.Z`** (the milestone's name), filed
through `/issue-create`: type `chore`, no server-scope label, the milestone it
releases. It is what every PR below references, so file it first.

Set its card to **In Progress** (`/board-ops`). It stays open until the Release
is published (step 6), whatever merges in between.

```sh
N=<RELEASE_ISSUE_NUMBER>
MILESTONE=vX.Y.Z
```

**Check the milestone is complete** before preparing anything. The only open
issue left in it should be the release issue itself:

```sh
gh issue list --repo modelcontextprotocol/servers --milestone "$MILESTONE" \
  --state open --json number,title --jq '.[] | "#\(.number) \(.title)"'
```

Anything else open is either finished first or moved to the next milestone by
a maintainer. Do not release around it silently.

## 2. Preparation PRs, on `v2/main`

All three are part of the milestone's work, so all three land on the develop
branch and reach `main` with everything else. **All are merged before the merge
PR is opened.** A milestone that touches only one language, with a clean audit,
has one.

### 2a. The audit

Audit first, so the version bumps sit on a tree that was just checked.

```sh
git fetch origin v2/main
git switch -c "v2/chore/$N-release-audit" origin/v2/main

# npm: one lockfile covers the root and all four TypeScript workspaces.
npm audit --audit-level=high

# Python: each server has its own lockfile. `uv` has no audit of its own in the
# version pinned here, so the locked requirements go through pip-audit.
# Exported to a file first: piped straight in, a failed `uv export` hands
# pip-audit empty input, which it reports as clean. And pip-audit exits
# non-zero both when it finds something and when it could not run, so a
# server counts as audited only when its output holds a verdict. The block
# runs in a subshell that exits non-zero if any server was not audited.
(
  unaudited=
  for s in fetch git time; do
    echo "== $s"
    REQ=$(mktemp) OUT=$(mktemp)
    if (cd "src/$s" && uv export --frozen --no-emit-project --format requirements-txt) > "$REQ" \
        && [ -s "$REQ" ]; then
      uvx pip-audit --require-hashes --disable-pip -r "$REQ" > "$OUT" 2>&1
      cat "$OUT"
      grep -qE 'No known vulnerabilities found|Found [0-9]+ known vulnerabilit' "$OUT" || {
        echo "AUDIT DID NOT RUN for $s: no verdict in its output" >&2
        unaudited="$unaudited $s"
      }
    else
      echo "EXPORT FAILED for $s: nothing was audited" >&2
      unaudited="$unaudited $s"
    fi
    rm -f "$REQ" "$OUT"
  done
  [ -z "$unaudited" ] || { echo "NOT AUDITED:$unaudited" >&2; exit 1; }
); echo "python audit complete: EXIT=$?"
```

**This step is a report.** Read it; do not let a tool rewrite the tree. The
`EXIT=` line says whether every Python server was audited, not whether the
audit was clean: `pip-audit`'s findings are in the output above it.

⚠️ **Never `npm audit fix`**, with or without `--force`. `AGENTS.md`
**Dependencies** rules it out: it resolves an advisory that has no upward
escape by silently downgrading, and the gate does not detect a version going
backwards.

Each finding gets one of three outcomes, decided by a person:

- **A fix inside the declared range**: a direct bump, or an `overrides` entry
  (npm) or a raised lower bound plus `uv lock` (Python). Each fix is **its own
  commit**, and a fix to a TypeScript server's runtime dependencies carries a
  changeset.
- **A fix that needs a major**: its own issue and its own PR, not a
  release-day edit.
- **No fix available, or not reachable from the server**: say so in the
  report, with the reason.

Post the report as a comment on the release issue. If fixes were forced, open
the PR (`/pr-flow`), body starting `Closes #N`, with the report in it. **If
none were, there is no audit PR**: an empty PR is not evidence, the comment is.

### 2b. The TypeScript version bumps: "Version Packages"

`version-packages.yml` keeps this PR open whenever `.changeset/` holds pending
changesets. Find it:

```sh
gh pr list --repo modelcontextprotocol/servers --base v2/main \
  --head changeset-release/v2/main --json number,title,url
```

No PR means no TypeScript server has a pending changeset. Check that is true
rather than assuming it, since a TypeScript change merged without its changeset
releases nothing:

```sh
# Refresh first, and read the REMOTE tree: the checkout may be a preparation
# branch cut before another PR merged.
git fetch origin main v2/main --tags
git ls-tree -r --name-only origin/v2/main .changeset/ | grep '\.md$' | grep -vx '.changeset/README.md'   # the pending changesets
# Since the latest published Release, asked of GitHub: this repo's tags do not
# sort into release order (see 5a).
PREV=$(gh release view --repo modelcontextprotocol/servers --json tagName --jq .tagName)
git log --oneline "$PREV"..origin/v2/main -- \
  src/everything src/filesystem src/memory src/sequentialthinking
```

If the second command lists changes to what a server publishes and the first
lists no changeset for that server, add the missing changeset through an
ordinary PR first.

Then, on the PR:

1. **Tie it to the release issue with a comment**, `Part of #N`. The action
   rewrites the PR's body on every push to `v2/main`, so a `Closes` line there
   would not survive; this is the exception `AGENTS.md` names.
2. **Close and reopen it to start CI.** A PR opened with the workflow token
   does not trigger workflows.
3. **Read it**: each bump matches the semver policy in `RELEASING.md`, each
   `CHANGELOG.md` entry says what a user of the server needs to know, the
   consumed changeset files are deleted, and `package-lock.json` records the
   new versions.
4. A maintainer merges it.

### 2c. The Python version stamps: "Prepare Python Release"

Do this **last**, close to the release: it stamps the date it runs on.

```sh
gh workflow run prepare-python-release.yml --repo modelcontextprotocol/servers \
  --ref v2/main -f issue="$N"
```

It opens a PR that starts with `Closes #N`, on a branch named
`v2/chore/<N>-python-calver-<date>`, labeled `v2`. Close and reopen it to start
CI, check that each stamped package really changed, and a maintainer merges it.
No PR means no Python server has a shipped change since its last stamp.

⚠️ GitHub only dispatches a workflow that exists on the default branch. Until
the first milestone merge carries this one to `main`, do it by hand, which is
the same script:

```sh
git fetch origin v2/main
git switch -c "v2/chore/$N-python-calver-$(date -u +%Y.%-m.%-d)" origin/v2/main
node scripts/prepare-python-release.mjs     # prints "name: old -> new" per stamped package
git commit -s -am "chore: stamp Python CalVer versions for $(date -u +%Y.%-m.%-d)"
```

then open the PR through `/pr-flow`, body starting `Closes #N`.

## 3. The merge PR: `v2/main` → `main`

Open it only when every preparation PR has merged.

The merge branch is `v2/main` under another name: cut from `origin/v2/main`,
with nothing added. The merge itself is made by GitHub when the PR merges, so
`main` gets exactly one merge commit and the PR has no commit of its own.
(Merging locally first would put a merge commit on the branch, and merging the
PR would then add a second.)

```sh
git fetch origin main v2/main
git switch -c "v2/chore/$N-release-$MILESTONE" origin/v2/main
```

**The merge's result is the release candidate. Prove it will be `v2/main`'s
tree before opening the PR:**

```sh
git rev-parse 'origin/v2/main^{tree}'
git merge-tree --write-tree origin/main HEAD     # must print the same hash, and nothing else
```

`git merge-tree` computes the tree the merge into `main` would produce,
without touching the checkout. A different hash, or conflict output, means
`main` holds a change `v2/main` does not. That is a change that exists only
downstream of the develop branch. Stop and find out what it is, rather than
pushing.

Open the PR against **`main`**, labeled `v2`. Its body's first line is
**`Part of #N`**, not `Closes #N`:

```sh
BODY=$(mktemp)
cat > "$BODY" <<EOF
Part of #$N

Milestone merge for $MILESTONE: \`v2/main\` → \`main\`. No commits of its own;
the merged tree is \`origin/v2/main\`'s (\`$(git rev-parse --short 'HEAD^{tree}')\`).

Release ledger: <link, added in step 4>
EOF
git push -u origin HEAD
gh pr create --repo modelcontextprotocol/servers --base main --label v2 \
  --title "Release $MILESTONE: merge v2/main into main" --body-file "$BODY"
```

This is the one PR in the repository that targets `main`.

⚠️ **It is merged with "Create a merge commit", never squashed or rebased.** A
squash writes one new commit that `v2/main` does not contain, so the two
branches stop sharing history and the next milestone merge conflicts with
itself.

⚠️ **Do not click "Update branch" on the merge PR.** GitHub always offers it
here, because `main` always holds commits the merge branch lacks (its own
earlier merge commits), so it does not mean the PR is out of date. Clicking it
merges `main` into the merge branch: the PR gains a commit of its own, `main`
receives two merge commits, and the branch head is no longer the commit the
ledger names. If it was clicked, put the branch back on its head from before
the click: the update merge's **first parent**, which is the commit the ledger
verified. Not `origin/v2/main`, which may have moved on to a commit nothing has
verified. Then repeat the `git merge-tree` check above:

```sh
B="v2/chore/$N-release-$MILESTONE"
git fetch origin
UPDATE=$(git rev-parse "origin/$B")
git log -1 --format='%s' "$UPDATE"   # must be "Merge branch 'main' into …"
git push --force-with-lease="$B:$UPDATE" origin "$UPDATE^1:refs/heads/$B"
```

⚠️ **Never merge `main` back into `v2/main`** to "sync" them. Everything
reaches `main` through `v2/main`, so there is nothing on `main` to bring back
except the merge commits themselves. `v2/main` ahead of `main` means a release
is in flight; that is the normal state.

## 4. Verify the release candidate, and write the ledger

Work from a **dedicated worktree** with its own install, so nothing stale from
another branch is tested. It is added **detached** at the pushed merge branch:
the branch itself is still checked out where step 3 created it, and git
refuses to check one branch out twice.

```sh
git worktree add --detach ../servers-release "origin/v2/chore/$N-release-$MILESTONE"
cd ../servers-release && npm ci
```

**4a. The gate.** `npm run local:gate; echo "EXIT=$?"` (`/pre-push-gate`).

**4b. The packaging check, as its own step.** ⚠️ `local:gate` does not run it:

```sh
npm run pack:verify; echo "EXIT=$?"
```

It builds each package's publish artifact (the npm tarball, the wheel),
installs it into an empty directory and boots the installed server. The boot
smoke in the gate runs the checkout, which cannot see a file missing from the
tarball or a dependency that only resolves inside the workspace. CI runs
`pack:verify` only in `release.yml`, after the tag exists, so skipping it here
means the first sign of a broken package arrives too late to stop the release.
It needs the network. Keep its output: one line per package with the artifact
sizes.

**4c. Every issue closed in the milestone is exercised, not read.**

```sh
gh issue list --repo modelcontextprotocol/servers --milestone "$MILESTONE" \
  --state closed --limit 200 --json number,title,labels \
  --jq '.[] | "#\(.number) \(.title) [\([.labels[].name] | join(", "))]"'
```

- **A server-facing issue** (a tool, resource, prompt, transport or error) is
  driven through a client against the built server, following `/client-smoke`:
  what was asked, and what came back. "Its tests pass" is not evidence here;
  the gate already said that.
- **An issue with no client surface** (docs, skills, workflows, gate tooling)
  gets a **targeted probe**: the guard made to fire on a planted defect and
  then pass, the query that reads back the state a recipe produced, the count
  before and after.

**4d. The ledger.** Write the results up as a published artifact (a private
page, shared with the maintainers) and link it from the merge PR's body. It
holds:

- **Masthead**: repository, the merge PR and its commit, the milestone, the
  date, and a line saying what tree was tested and that its hash matches
  `origin/v2/main`.
- **Verdict**: `local:gate` and `pack:verify` results, milestone issues
  verified as `N / N`, findings.
- **The gate**: one cell per stage, with its numbers.
- **The packaging check**, apart from the gate because it is not a stage: one
  row per package with its version, the artifact sizes and the result.
- **What will publish**: each package, its version on the merge branch, and
  whether the registry already has it
  (`node scripts/npm-publish-guard.mjs src/<server>` for npm; for PyPI,
  `curl -s -o /dev/null -w '%{http_code}' https://pypi.org/pypi/<name>/<version>/json`,
  where 404 means it will publish).
- **One table per theme**: *Issue · What was driven · Observed · Status*. One
  row per closed issue, linked, with the actual output in the Observed cell.
- **Findings**: anything that is a caveat rather than a pass, stated on its
  own.

A row that says "verified" without saying what was run is not a ledger entry.

**4e. When verification finds something, the fix goes on `v2/main`, never on
the merge branch.** File the issue (`/issue-create`), fix it through an
ordinary PR, then fast-forward the merge branch to the new `origin/v2/main`,
so the fix arrives the way everything else did and the branch is still
`v2/main` with nothing added. The verification worktree is detached, so a
merge and a plain `git push` there would move nothing. Update the remote
branch by name, then move the worktree onto it:

```sh
git fetch origin v2/main
# A fast-forward only: the push is refused if the branch holds anything
# v2/main does not.
git push origin "origin/v2/main:refs/heads/v2/chore/$N-release-$MILESTONE"
git fetch origin
git switch --detach "origin/v2/chore/$N-release-$MILESTONE" && npm ci
```

Then repeat step 3's `git merge-tree` check.
Re-run what the fix touches and update the ledger. If the fix changed a
package, its version PR (2b or 2c) runs again first.

## 5. The Release

### 5a. Draft the release notes

Draft these once the merge PR has merged, so `main` holds what is being
released. [`scripts/release-notes.mjs`](../../../scripts/release-notes.mjs)
(`npm run release:notes`) builds them; its header says why each part is
there. The changes are laid out per package, because a reader wants to know
what changed in the server they use:

1. **`## Packages`.** Every package on the merge commit, its version, and
   whether this release publishes it (the registry does not have that version
   yet) or leaves it unchanged. The tag is the milestone's name, not a
   version, so this table is where a reader finds the versions.
2. **One `## <package> <version>` section per published package**, whose
   `### What's Changed` lists the PRs that change files under its
   `src/<dir>/`. A PR that touches several servers is listed under each.
3. **`## Repository`**: every PR no published section took (CI, docs, skills,
   a server whose version did not change), so no PR in the generated list is
   dropped.
4. GitHub's **New Contributors** block and **Full Changelog** link, verbatim.
5. **The release-ledger line**, linking the artifact from 4d.
6. **`## Known issues`**, only when you pass one. It names the issue, who is
   affected and the workaround. What counts as a known issue is a maintainer's
   judgment, so it is written by hand, never generated.
7. **`## Thanks for helping us improve`**: one list for the whole release, as
   the Inspector's release notes have it, crediting the community members
   whose issues the listed PRs close, one line per person, most issues first.

GitHub adds everyone `@`-mentioned in a release body to that release's
**Contributors** strip, so the people credited appear there too.

Preview first. The default run prints the notes and creates nothing:

```sh
REPO=modelcontextprotocol/servers
# The commit being released is the merge PR's merge commit, by SHA. `main` is
# a moving name: if anything else landed on it since, "main" would be a tree
# the ledger never saw.
MERGE_SHA=$(gh pr view <MERGE_PR> --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid) || MERGE_SHA=
[ -n "$MERGE_SHA" ] || echo "the merge PR has no merge commit: stop" >&2
git fetch origin main && git rev-parse "$MERGE_SHA^{tree}"   # must be the tree hash the ledger recorded

NOTES=$(mktemp)
npm run --silent release:notes -- --milestone "$MILESTONE" --merge-sha "$MERGE_SHA" \
  --merge-branch "v2/chore/$N-release-$MILESTONE" --ledger-url "<the ledger's URL>" \
  > "$NOTES"; echo "EXIT=$?"
```

Add `--known-issue "<markdown>"` once per known issue. The helper reads the
manifests at `$MERGE_SHA` from GitHub, so it needs no checkout of that
commit. It takes a few minutes: it looks up every listed PR's files and
closing issues, and every reporter's permission.

**Read the preview before going on.** Then create the draft with the same
arguments plus `--draft`:

```sh
npm run --silent release:notes -- --milestone "$MILESTONE" --merge-sha "$MERGE_SHA" \
  --merge-branch "v2/chore/$N-release-$MILESTONE" --ledger-url "<the ledger's URL>" --draft
```

`--draft` creates a **draft** Release tagged `$MILESTONE` at `$MERGE_SHA`. It
refuses a SHA that is not on `main`, and a tag that already has a Release or
draft (edit or delete that one instead). Every run, preview included, refuses
a milestone tag that already exists: GitHub would build the notes and the
Release from that tag's commit, not `$MERGE_SHA`. There is no `--publish`: publishing
starts `release.yml`, so it is the maintainer's act in 5b.

The rules the helper applies:

- **The previous release is the latest published Release**, asked of GitHub
  rather than sorted out of the tag list: this repo's tags mix date stamps
  (`2026.8.31`), milestone names (`vX.Y.Z`) and older per-package tags, and no
  sort orders them. `--previous-tag` overrides it in a preview only.
- **An issue counts when a listed PR closes it**, through either the explicit
  closing link (`closingIssuesReferences`, which every PR here gets from
  `addCloseIssueReferences`) or a `Closes / Fixes / Resolves #N` in the PR
  body. So an issue older than the release still counts when this release
  closed it.
- **Maintainers and bots are excluded by permission, not by name.** A
  maintainer is anyone with `admin`, `maintain` or `write` on the repo. Bots,
  deleted accounts, PR numbers and other repos' issues are dropped.
- **Outside PRs are credited through their issue, by hand.** This repo
  closes an outside PR and files an issue for a fix worth keeping, crediting
  the PR's author in that issue (`issue-triage`, Harvest). The helper credits
  the issue's *author*, who is then a maintainer and is excluded. Read the
  milestone's issues for such credits and add those people to the draft's
  Thanks section by hand before publishing.
- **"Addresses", not "fixes."** The credited issues include feature requests.
- **The Thanks section is left out** when no community reporter remains.
- **It fails fast.** A failed `gh` call, a GraphQL error, a missing PR or
  issue, an unknown permission value, a generated line it does not recognize,
  or a registry answer other than 200 or 404 aborts the run before anything is
  created. Re-run it; never patch around a failure by hand.

### 5b. Tag and publish

**A maintainer does this**, after reading the draft 5a created. The draft
already carries the tag name (`vX.Y.Z`), the target (`$MERGE_SHA`, not the
branch `main`) and the notes; publishing creates the tag. Through the GitHub
UI: *Releases → the `vX.Y.Z` draft → Edit → Set as the latest release →
Publish release*. From the CLI:

```sh
gh release edit "$MILESTONE" --repo modelcontextprotocol/servers --draft=false --latest
```

The target is the SHA, so the tag lands on the commit the ledger verified,
whatever has reached `main` since. `release.yml` only checks that the tagged
commit is on `main`; it cannot know which commit was verified.

- **The tag is a label, not a version.** Seven packages publish at seven
  versions; none is compared with the tag. Naming it for the milestone is what
  ties the Release to the board.
- **Editing a published Release's notes is safe.** `release.yml` runs on
  `published` only, so an edit never re-runs publishing. Fixing a typo or
  adding a known issue afterwards needs no ceremony.

Publishing the Release starts `release.yml`. Its build jobs run first, without
credentials: tests, then `pack:verify`. The publish jobs then wait for the
`release` environment's approval. **Wait for every build leg to finish before
approving**, and read their logs: each says what its package will publish or
skip. Approve the packages whose build leg passed. One failed build leg does
not hold the others back; that package is handled as a failed publish
(`RELEASING.md` **When a publish fails**).

## 6. After it publishes

```sh
# Each npm package at the version on main.
for s in everything filesystem memory sequentialthinking; do
  node scripts/npm-publish-guard.mjs "src/$s"      # "already on npm" is the pass
done
# Each Python package: 200 means published.
for s in fetch git time; do
  v=$(sed -n 's/^version = "\(.*\)"/\1/p' "src/$s/pyproject.toml" | head -1)
  echo "mcp-server-$s $v $(curl -s -o /dev/null -w '%{http_code}' "https://pypi.org/pypi/mcp-server-$s/$v/json")"
done
```

A freshly published npm version can take a few minutes to appear. Query the
exact version, as above, never `dist-tags`.

### The first semver release only: deprecate the date-stamped versions

The TypeScript packages were published with date-stamped versions (`2025.x`,
`2026.x`) before they resumed semver at `1.0.0`. Once `1.0.0` is live, those
old versions are deprecated so that anyone pinned to one is told where the
package went. This is done **once**, after the release that first publishes
`1.0.0`, and never again.

⚠️ **Only after `latest` has moved.** The range covers the version users were
getting before the release. Deprecating it while it is still `latest` warns
every `npx` user toward a version that does not exist yet. Check first, and
go on only when all four lines show a `1.x` `latest` and no deprecation:

```sh
for p in everything filesystem memory sequential-thinking; do
  n="@modelcontextprotocol/server-$p"
  echo "$n latest=$(npm view "$n" dist-tags.latest) deprecated=$(npm view "$n@2026.8.31" deprecated)"
done
```

**A maintainer of the `@modelcontextprotocol` npm scope runs it**, from a
shell logged in to npm (`npm whoami`). There is no npm token in this
repository or its workflows, by design, so an agent's shell cannot, and the
warning is public the moment it lands. Prepare the command and the check;
do not attempt the login.

```sh
MSG="Date-based versions are no longer published. This package has resumed semantic versioning at 1.0.0: install the latest version."
for p in everything filesystem memory sequential-thinking; do
  npm deprecate "@modelcontextprotocol/server-$p@>=2025.0.0 <2027.0.0" "$MSG"
done
```

npm may ask for a one-time password for each package. Re-run the check above:
`latest` is unchanged, and `deprecated` now prints the message. The semver
versions are outside the range and stay undeprecated.

It can be undone by running the same command with an empty message (`""`).
The Python packages need nothing: they stay on the date-stamped line.

### Close out

Then close out, by hand, since nothing closed the release issue:

```sh
gh issue close "$N" --repo modelcontextprotocol/servers --reason completed
```

Move its card to **Done** (`/board-ops`), remove the worktree
(`git worktree remove ../servers-release`), and tell the maintainer the
milestone can be closed.

**If the run failed**, `RELEASING.md` **When a publish fails** has the two
cases: a transient failure is re-run on the same run; a defect is fixed on
`v2/main`, merged to `main` again, and released again, and the registry guard
publishes only what never arrived.

## Bumping a pinned action

Every action in a job that holds a credential, that builds what such a job
publishes, or whose outputs such a job reads, is pinned to a commit SHA with its release in a trailing comment
(`AGENTS.md` **Credentialed workflow jobs**; `verify:action-pins` enforces it).
Resolve the SHA and the version **from the same lookup**, so the comment cannot
name a release the SHA is not:

```sh
ACTION=actions/checkout TAG=v6.1.0
echo "uses: $ACTION@$(gh api "repos/$ACTION/commits/$TAG" --jq .sha) # $TAG"
```

The same goes for the Node release the npm publish job runs (`node-version` in
`publish-npm`, `release.yml`): it is pinned exactly, because its bundled npm is
the CLI that publishes, and it stays on a release whose bundled npm is 11.5.1
or later (the OIDC floor; the job checks it before publishing). Bump it
deliberately, from a Node release whose npm version you have read in
`https://nodejs.org/dist/index.json`.
