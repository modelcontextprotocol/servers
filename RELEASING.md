# Releasing

How the packages in this repository are published, and what to do when a publish fails.

## How publishing works

All packages publish exclusively from the [`release.yml`](.github/workflows/release.yml) GitHub Actions workflow, gated by the `release` environment (a required reviewer must approve each deployment).

**Authentication is OIDC trusted publishing on both registries — there are no registry tokens.**

- **npm** (TypeScript servers): each `@modelcontextprotocol/*` package is registered on npmjs.com with a [trusted publisher](https://docs.npmjs.com/trusted-publishers) bound to this repository, workflow filename `release.yml`, and environment `release`. npm rejects publishes from any other workflow or environment — the binding is case-sensitive. Packages are published with [provenance attestations](https://docs.npmjs.com/generating-provenance-statements) (`NPM_CONFIG_PROVENANCE`).
- **PyPI** (Python servers): published via [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) using `pypa/gh-action-pypi-publish`.

A release run:

1. **Detects changed packages** since the last release tag (a package counts as changed if any `.py`, `.ts`, or `.md` file in its directory changed — READMEs ship inside the published artifacts).
2. **Stamps versions and tags** — versions are currently date-based (CalVer, e.g. `2026.7.4`) for all packages. (Planned: the TypeScript packages move to semver managed by changesets, while Python stays CalVer — see [#4463](https://github.com/modelcontextprotocol/servers/issues/4463).)
3. **Publishes each package as an independent matrix job** (`fail-fast: false` — one package's failure never blocks another): checkout at the release tag → install → *skip if this version already exists on the registry* → **run the package's tests** → build → publish.
4. **Creates the GitHub release** with generated notes.

Runs are triggered by a daily schedule or manually via **workflow_dispatch** on `release.yml`.

## When a publish fails

A failed matrix leg means that one package didn't publish; everything else that succeeded stays published (the version-exists guard makes retries idempotent).

**Preferred: re-run the failed jobs on the same run.**

```bash
gh run rerun <run-id> --failed --repo modelcontextprotocol/servers
```

- A re-run is still a `release.yml` run in the `release` environment, so it satisfies the trusted-publisher binding.
- It re-runs only the failed legs, checked out at the original release tag — it publishes exactly the tagged code.
- It needs a fresh `release` environment approval, and the run must be complete first (approve or reject any pending deployments).
- GitHub's re-run window is ~30 days from the original run, and re-runs execute the *original* workflow snapshot — workflow fixes on main don't apply to a re-run (secrets and registry-side registrations are read fresh).

**Otherwise: let the next release pick it up.** If the re-run window has closed (or the fix required a workflow change), the failed version simply never exists on that registry — that's benign; npm and PyPI version histories don't need to match. The package publishes at the next version, provided it has a qualifying change since the last tag.

**Never:**

- Publish manually with an npm token or from a laptop — there are no registry tokens, and manual publishes would break the provenance/trust chain.
- Re-dispatch `release.yml` expecting it to retry a failed version — a fresh run mints a *new* version.

## Environment approvals

The `release` environment's required-reviewer list is configured in the repository settings (Settings → Environments → `release`). Reviewer rights come only from that list — repository admin does not confer deployment approval.

---

The release process is evolving — see [#4463](https://github.com/modelcontextprotocol/servers/issues/4463) for planned changes (manual GitHub-release triggering, semver via changesets for the TypeScript packages). This document describes the process as it works today and will be updated when that lands.
