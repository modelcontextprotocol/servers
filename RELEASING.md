# Releasing

How the packages in this repository are versioned and published, and what to do when a publish fails.

## How versioning works

**No workflow computes or stamps a version at release time.** The version in each package's manifest is the source of truth, and it changes only through a reviewed pull request on `v2/main`. The two languages use different schemes, for a reason that comes from their registries.

### TypeScript servers: semver, managed by changesets

`everything`, `filesystem`, `memory` and `sequentialthinking` use **semver**, managed by [changesets](https://github.com/changesets/changesets).

- A PR that changes what one of them publishes includes a **changeset**: a small file under [`.changeset/`](.changeset/README.md), created with `npm run changeset`, naming the package, the bump type and the line that becomes its CHANGELOG entry.
- Merged changesets accumulate on `v2/main`. On every push there, [`version-packages.yml`](.github/workflows/version-packages.yml) creates or updates one rolling **"Version Packages" PR** that consumes them: it bumps each affected `package.json`, writes the package's `CHANGELOG.md`, deletes the consumed changeset files and refreshes `package-lock.json`. Merging that PR is what changes a version.
- Each server reports that same version in its MCP `serverInfo`, read from `package.json` at run time, so the bump needs no matching source edit.

Semver policy:

| Bump | When |
| --- | --- |
| **patch** | A bug fix |
| **minor** | A new tool, prompt, resource or option |
| **major** | A breaking change: a tool removed or renamed, a schema change that breaks clients, a protocol or Node floor bump |

The semver line starts at **`1.0.0`** for all four packages. Their earlier releases were date-stamped (`2025.x`, `2026.x`), which sorts above any semver number, but `npm install` and `npx` resolve the `latest` dist-tag rather than the highest number, so publishing `1.x` is what users get. npm will not move `latest` to a lower version implicitly, so `release.yml` always passes the dist-tag explicitly, and chooses it at publish time: `latest` for the move from the date-stamped line to `1.x` and for any version higher than the registry's current `latest`, and `backfill` otherwise. The second case is an older release's failed leg re-run after a newer version has published: the version becomes installable by number, and `latest` does not move backward. Once `1.0.0` is live, a scope maintainer deprecates the date-stamped range (`>=2025.0.0 <2027.0.0`) by hand, once; the `release` skill has the command and the check to run first.

### Python servers: CalVer

`fetch`, `git` and `time` use **CalVer** (`2026.8.1`). pip and uv have no dist-tags and always install the numerically highest version, so the existing `2026.x` line on PyPI has to keep climbing.

A maintainer dispatches the **Prepare Python Release** workflow ([`prepare-python-release.yml`](.github/workflows/prepare-python-release.yml)) on `v2/main`, giving it the number of the milestone's release issue. It runs [`scripts/prepare-python-release.mjs`](scripts/prepare-python-release.mjs), which stamps today's date onto each Python package with a shipped change since its last version bump, refreshes its `uv.lock`, and opens a PR whose body starts with `Closes #<release issue>`. A package with no such change is left alone.

GitHub only lists a `workflow_dispatch` workflow that exists on the default branch (`main`). Until the first milestone merge carries this one there, run the same script locally on a branch cut from `origin/v2/main` and open the PR by hand:

```bash
node scripts/prepare-python-release.mjs    # prints one "name: old -> new" line per stamped package
```

### PRs opened by these workflows

> [!NOTE]
> Both workflows open their PR with the workflow token, and GitHub does not start CI for a PR opened that way. Close and reopen the PR to run CI before merging. The Version Packages PR's body is rewritten on every push to `v2/main`, so it is tied to the release issue by a comment (`Part of #N`) instead of a body line. The repository setting **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests** must be on, or the workflows fail at the step that opens the PR.

## How publishing works

Publishing is triggered by a maintainer **publishing a GitHub Release** whose tag is on `main`. There is no scheduled or merge-triggered release. The release tag is only a label: it carries no version, and nothing compares it with one. What the workflow does check is where the tag points: a Release whose commit is not on `main` fails before any publish job can start, since `main` only receives reviewed milestone merges.

[`release.yml`](.github/workflows/release.yml) runs on `release: published`, checked out at the release tag. It handles every package as its own pair of jobs, a build and a publish (`fail-fast: false`, so one package's failure never blocks another):

| Job | Holds | Does |
| --- | --- | --- |
| **Build** (`build-npm`, `build-pypi`) | No `id-token`, no environment | Installs dependencies, **runs the package's tests** (for Python, the whole `validate:py` chain: ruff, pyright, pytest), then runs **`pack:verify`**: it builds the tarball or wheel, installs it into an empty directory and boots the installed server. Uploads that verified artifact |
| **Publish** (`publish-npm`, `publish-pypi`) | `id-token: write` and the `release` environment (a required reviewer must approve each deployment) | Downloads the artifact, checks that its name and version are the ones the released commit declares for that package, and hands it to the registry. No checkout, no dependency install, no build |

The split is about what runs next to the publish credential. Installing dependencies runs their lifecycle scripts, and a build runs a toolchain; in a job that can mint an OIDC token, any of that code could publish. Here the token only ever sits beside the registry client and SHA-pinned actions. Every action in the build and publish jobs is pinned to a commit SHA, enforced by `npm run verify:action-pins`.

The build jobs finish before the publish jobs ask for approval, so **wait for every build leg to finish before approving the `release` environment**, and read their logs: they say what each package will do. A package whose build leg passed is safe to approve. One failed build leg does not hold the others back: approve the healthy packages, and handle the failed one as described under [When a publish fails](#when-a-publish-fails).

The **registry-diff guard** is what makes a release idempotent and self-healing. A package whose version is already on the registry is **skipped, not failed**:

- **npm**: [`scripts/npm-publish-guard.mjs`](scripts/npm-publish-guard.mjs) asks the registry whether the version exists, in the build job. For a published version the job builds nothing and uploads a `SKIP` marker, and the publish job exits cleanly on it. A package the registry has never seen counts as "publish it", so a new server's first release works. An answer the guard cannot read fails the job rather than guessing.
- **PyPI**: `skip-existing` on the upload action.

So a release publishes exactly the packages whose version moved, and a package whose publish failed is picked up by the next release with nothing to clean up.

**Authentication is OIDC trusted publishing on both registries. There are no registry tokens.**

- **npm**: each `@modelcontextprotocol/*` package is registered on npmjs.com with a [trusted publisher](https://docs.npmjs.com/trusted-publishers) bound to this repository, workflow filename `release.yml`, and environment `release` (the binding is case-sensitive). Packages publish with [provenance attestations](https://docs.npmjs.com/generating-provenance-statements).
- **PyPI**: published via [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) using `pypa/gh-action-pypi-publish`, with the same `release.yml` + `release` environment binding.

Because of those bindings, the publish jobs must stay in `release.yml` and keep the `release` environment.

## Cutting a release

A release ships one **milestone**. The step-by-step procedure, with its commands, is the [`release` skill](.claude/skills/release/SKILL.md) (`/release`); this is its shape.

1. **A release issue**, `Release vX.Y.Z`, is filed for the milestone. Every PR below references it, and it stays open until the Release is published.
2. **Preparation PRs land on `v2/main`**, each starting with `Closes #<release issue>`:
   - the **audit** (`npm audit`, and `pip-audit` over each Python server's locked requirements): the report goes on the release issue, and any fix it forces is its own commit in a PR;
   - the **Version Packages** PR (TypeScript), which references the release issue in a comment instead, because the changesets action rewrites its body;
   - the **Prepare Python Release** PR (Python).

   A milestone that touches both languages and needs an audit fix has all three. They are merged before the next step starts.
3. **The merge PR** takes `v2/main` into `main`. It is a pure merge: its branch is `origin/v2/main` with no commits of its own, and the merged tree equals `origin/v2/main`'s. Its body starts with `Part of #<release issue>`, not `Closes`, because `main` is the default branch and a closing keyword there would close the issue before anything is published. It is merged with a merge commit, never squashed.
4. **The release ledger** is linked from the merge PR. It records, for the merge branch's tree: `npm run local:gate`; `npm run pack:verify` for each package; each server-facing issue in the milestone exercised through a client; and a targeted probe for each issue with no client surface. The maintainers approve the merge on it. A finding is fixed on `v2/main` and merged in again, never committed to the merge branch.
5. **A maintainer publishes a GitHub Release** targeting `main`: Releases → Draft a new release → create a tag named for the milestone (`vX.Y.Z`) → Generate release notes → Publish. The tag is a label, not a version.
6. **The build jobs run, then the maintainer approves the `release` environment deployments.** Each package publishes if its version is not on the registry yet; the rest skip cleanly.
7. **The release issue is closed by hand**, and its card moves to Done.

## When a publish fails

A failed matrix leg means that one package did not publish; everything that succeeded stays published. When a package's **build** job fails, its publish job still asks for approval and then fails at the download step, having published nothing: there is no artifact for it to publish.

**A transient failure (a registry hiccup, a runner fault): re-run the failed jobs on the same run.**

```bash
gh run rerun <run-id> --failed --repo modelcontextprotocol/servers
```

- A re-run is still a `release.yml` run in the `release` environment, so it satisfies the trusted-publisher binding.
- It re-runs only the failed legs, at the original release tag. It publishes exactly the released code, and the registry-diff guard keeps already-published packages safe. If the failed leg was a build job, re-run it together with its publish job.
- It needs a fresh `release` environment approval, and the run must be complete first (approve or reject any pending deployments).
- The build jobs' artifacts are kept for **7 days**. Within that time, re-running a failed publish leg alone works, because the artifact it downloads is still there. After that (GitHub allows re-runs for about 30 days), re-run the package's build leg together with its publish leg, or the whole run (`gh run rerun <run-id>`): the build recreates the artifact, and the registry-diff guard skips whatever already published.

**A defect in the released code or in the workflow: fix it and release again.** A release event runs the workflow as it is at the tag, so a re-run repeats the same broken step. Fix it on `v2/main` through an ordinary PR, merge `v2/main` into `main`, and publish a new Release. The guard publishes whatever never reached the registry and skips the rest: no stranded versions, and no version edits to force it.

**Never:**

- Publish manually with an npm token or from a laptop. There are no registry tokens, and a manual publish would break the provenance chain.
- Edit a version by hand to force a publish. Versions change only through the Version Packages and Prepare Python Release PRs.

## Environment approvals

The `release` environment's required-reviewer list is configured in the repository settings (Settings → Environments → `release`). Reviewer rights come only from that list: repository admin does not confer deployment approval.
