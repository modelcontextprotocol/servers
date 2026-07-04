# Releasing

How the packages in this repository are versioned and published, and what to do when a publish fails.

> Implementation of this process is tracked in [#4463](https://github.com/modelcontextprotocol/servers/issues/4463).

## Versioning

- **TypeScript packages** use **semver**, managed by [changesets](https://github.com/changesets/changesets). A PR that changes a TypeScript package includes a changeset file declaring the bump (patch/minor/major) and a changelog line — the changeset bot flags PRs that are missing one. A rolling **"Version Packages" PR** accumulates pending changesets; merging it applies the version bumps and updates each package's `CHANGELOG.md`.
  - patch = fixes · minor = new tools/prompts/resources/options · major = breaking changes (tool removed or renamed, schema changes that break clients, protocol or Node floor bump)
- **Python packages** use **CalVer** (`YYYY.M.D`). A prepare-release step stamps the date onto Python packages that changed since their last published version and opens a normal PR.
- **Versions live on `main` and are only changed by pull requests.** No workflow computes a version or pushes a tag.

## How publishing works

Publishing is triggered by **creating a GitHub Release** on the [releases page](https://github.com/modelcontextprotocol/servers/releases) (with auto-generated notes). That fires the [`release.yml`](.github/workflows/release.yml) workflow, which is the **only** publish path:

1. Every package is a matrix job, run independently (`fail-fast: false` — one package's failure never blocks another).
2. Each job: checkout at the release tag → install → **skip if the package's version already exists on its registry** → run the package's tests → build → publish.
3. Publish jobs are gated by the `release` environment — a required reviewer must approve the deployment.

Because of the version-exists guard, a release publishes exactly the packages whose versions were bumped since the last release, and re-running is always safe.

**Authentication is OIDC trusted publishing on both registries — there are no registry tokens.**

- **npm**: each `@modelcontextprotocol/*` package is registered on npmjs.com with a [trusted publisher](https://docs.npmjs.com/trusted-publishers) bound to this repository, workflow filename `release.yml`, and environment `release` (the binding is case-sensitive). Packages publish with [provenance attestations](https://docs.npmjs.com/generating-provenance-statements).
- **PyPI**: published via [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) using `pypa/gh-action-pypi-publish`.

## When a publish fails

A failed matrix leg means that one package didn't publish; everything that succeeded stays published.

**Preferred: re-run the failed jobs on the same run.**

```bash
gh run rerun <run-id> --failed --repo modelcontextprotocol/servers
```

- A re-run is still a `release.yml` run in the `release` environment, so it satisfies the trusted-publisher binding.
- It re-runs only the failed legs, checked out at the release tag — it publishes exactly the tagged code, and the version-exists guard makes it idempotent.
- It needs a fresh `release` environment approval, and the run must be complete first (approve or reject any pending deployments).
- GitHub's re-run window is ~30 days from the original run, and re-runs execute the *original* workflow snapshot — workflow fixes on `main` don't apply to a re-run.

**Otherwise: the next release picks it up.** The unpublished version is still on `main`, so the version-exists guard publishes it on the next release automatically. A version skipped this way simply never exists on that registry — that's benign; npm and PyPI version histories don't need to match.

**Never:**

- Publish manually with an npm token or from a laptop — there are no registry tokens, and manual publishes would break the provenance/trust chain.
- Edit versions outside a reviewed PR to force a publish.

## Environment approvals

The `release` environment's required-reviewer list is configured in the repository settings (Settings → Environments → `release`). Reviewer rights come only from that list — repository admin does not confer deployment approval.
