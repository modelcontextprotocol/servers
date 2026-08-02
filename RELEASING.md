# Releasing

How the packages in this repository are versioned and published, and what to do when a publish fails.

## How versioning works

**No workflow ever computes or stamps a version at release time.** The version in each package's manifest on `main` is the source of truth, and versions only change through reviewed PRs:

- **TypeScript servers** (`everything`, `filesystem`, `memory`, `sequentialthinking`) use **semver, managed by [changesets](https://github.com/changesets/changesets)**. Feature PRs include a changeset file (see [CONTRIBUTING.md](CONTRIBUTING.md)); merged changesets accumulate in a rolling **"Version Packages" PR** (maintained by [`version-packages.yml`](.github/workflows/version-packages.yml) on every push to `main`), which applies version bumps and CHANGELOG entries when merged. Semver policy: **patch** = bug fixes; **minor** = new tools, prompts, resources, or options; **major** = breaking changes (tool removed or renamed, schema change that breaks clients, protocol or Node floor bump).
- **Python servers** (`fetch`, `git`, `time`) use **CalVer** (e.g. `2026.8.1`). A maintainer dispatches the **Prepare Python Release** workflow ([`prepare-release.yml`](.github/workflows/prepare-release.yml)), which stamps today's date onto each Python package that changed since its last version bump and opens a normal PR.

> [!NOTE]
> PRs opened by these workflows use the workflow token, which doesn't trigger CI. Close and reopen the PR to run CI before merging.

## How publishing works

Publishing is triggered by a maintainer **creating a GitHub Release** (Releases → Draft a new release → choose or create a tag on `main` → auto-generate notes → publish). The release tag is just a label — it carries no version semantics.

The [`release.yml`](.github/workflows/release.yml) workflow runs on `release: published`, gated by the `release` environment (a required reviewer must approve each deployment). It runs every package as an independent matrix job (`fail-fast: false` — one package's failure never blocks another). Each job: checkout at the release tag → registry-diff guard → install → **run the package's tests** (plus `pyright` for Python) → build → publish.

The **registry-diff guard** makes releases idempotent and self-healing: a package whose version already exists on the registry is **skipped, not failed** (npm: an explicit version check, where a never-published package counts as "publish it"; PyPI: `skip-existing` on the upload action). A package whose publish failed or was skipped simply publishes on the next release.

**Authentication is OIDC trusted publishing on both registries — there are no registry tokens.**

- **npm**: each `@modelcontextprotocol/*` package is registered on npmjs.com with a [trusted publisher](https://docs.npmjs.com/trusted-publishers) bound to this repository, workflow filename `release.yml`, and environment `release` (the binding is case-sensitive). Packages publish with [provenance attestations](https://docs.npmjs.com/generating-provenance-statements).
- **PyPI**: published via [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) using `pypa/gh-action-pypi-publish`, with the same `release.yml` + `release` environment binding.

Because of those bindings, the publish jobs must stay in `release.yml` and keep the `release` environment.

## Cutting a release

1. Make sure the version bumps you want to ship are on `main`: merge the **Version Packages** PR (TypeScript) and/or the **Prepare Python Release** PR (Python). CI validates these like any other PR.
2. Create a GitHub Release on the releases page with auto-generated notes. Any tag name works (it's a label, not a version); dating them (e.g. `release-2026-08-01`) keeps the list readable.
3. Approve the `release` environment deployments when prompted.
4. Each package publishes if its version isn't on the registry yet; already-published packages skip cleanly.

## When a publish fails

A failed matrix leg means that one package didn't publish; everything that succeeded stays published.

**Preferred: re-run the failed jobs on the same run.**

```bash
gh run rerun <run-id> --failed --repo modelcontextprotocol/servers
```

- A re-run is still a `release.yml` run in the `release` environment, so it satisfies the trusted-publisher binding.
- It re-runs only the failed legs, checked out at the original release tag — it publishes exactly the released code, and the registry-diff guard keeps already-published packages safe.
- It needs a fresh `release` environment approval, and the run must be complete first (approve or reject any pending deployments).
- GitHub's re-run window is ~30 days from the original run, and re-runs execute the *original* workflow snapshot — workflow fixes on `main` don't apply to a re-run.

**Otherwise: just cut the next release.** The registry-diff guard picks up any version that never made it to the registry — no stranded versions, no artificial file touches.

**Never:**

- Publish manually with an npm token or from a laptop — there are no registry tokens, and manual publishes would break the provenance/trust chain.
- Edit versions directly on `main` to force a publish — versions change only through the Version Packages and Prepare Python Release PRs.

## Environment approvals

The `release` environment's required-reviewer list is configured in the repository settings (Settings → Environments → `release`). Reviewer rights come only from that list — repository admin does not confer deployment approval.
