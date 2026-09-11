# Releasing

How the packages in this repository are published, and what to do when a publish fails.

## How publishing works

All packages publish exclusively from the [`release.yml`](.github/workflows/release.yml) GitHub Actions workflow, gated by the `release` environment (a required reviewer must approve each deployment). Releases are triggered deliberately by a maintainer via **workflow_dispatch** (Actions → Release → Run workflow, or `gh workflow run release.yml`) — there is no scheduled/automatic release.

**Authentication is OIDC trusted publishing on both registries — there are no registry tokens.**

- **npm** (TypeScript servers): each `@modelcontextprotocol/*` package is registered on npmjs.com with a [trusted publisher](https://docs.npmjs.com/trusted-publishers) bound to this repository, workflow filename `release.yml`, and environment `release` (the binding is case-sensitive). Packages publish with [provenance attestations](https://docs.npmjs.com/generating-provenance-statements).
- **PyPI** (Python servers): published via [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) using `pypa/gh-action-pypi-publish`.

A release run:

1. **Detects changed packages** since the last release tag — a package counts as changed if any `.py`, `.ts`, or `.md` file in its directory changed (READMEs ship inside the published artifacts).
2. **Stamps versions and pushes the release tag** — versions are date-based (CalVer, e.g. `2026.7.4`).
3. **Publishes each changed package as an independent matrix job** (`fail-fast: false` — one package's failure never blocks another). Each job: checkout at the release tag → install → double-publish guard → **run the package's tests** (plus `pyright` for Python) → build → publish. The guard differs by registry: the npm job aborts before tests if the version already exists; for PyPI the skip happens at the publish step itself (`skip-existing` on the upload action).
4. **Creates the GitHub release** with generated notes.

## When a publish fails

A failed matrix leg means that one package didn't publish; everything that succeeded stays published.

**Preferred: re-run the failed jobs on the same run.**

```bash
gh run rerun <run-id> --failed --repo modelcontextprotocol/servers
```

- A re-run is still a `release.yml` run in the `release` environment, so it satisfies the trusted-publisher binding.
- It re-runs only the failed legs, checked out at the original release tag — it publishes exactly the tagged code, and the double-publish guard keeps already-published packages safe.
- It needs a fresh `release` environment approval, and the run must be complete first (approve or reject any pending deployments).
- GitHub's re-run window is ~30 days from the original run, and re-runs execute the *original* workflow snapshot — workflow fixes on `main` don't apply to a re-run.

**Otherwise: let the next release pick it up.** If the re-run window has closed (or the fix required a workflow change), the failed version simply never exists on that registry — that's benign; npm and PyPI version histories don't need to match. The package publishes at the next version, provided it has a qualifying change (`.py`, `.ts`, or `.md`) since the last release tag.

**Never:**

- Publish manually with an npm token or from a laptop — there are no registry tokens, and manual publishes would break the provenance/trust chain.
- Dispatch a fresh `release.yml` run expecting it to retry a failed version — versions are date-granular, so a same-day dispatch collides with the existing tag, and a later dispatch mints a *new* version. Neither retries the failed one.

## Environment approvals

The `release` environment's required-reviewer list is configured in the repository settings (Settings → Environments → `release`). Reviewer rights come only from that list — repository admin does not confer deployment approval.

---

Planned changes to this process — semver via changesets for the TypeScript packages, publishing triggered by manually-created GitHub Releases — are tracked in [#4463](https://github.com/modelcontextprotocol/servers/issues/4463). This document will be updated when that work merges.
