# Changesets

The TypeScript packages in this repo are versioned with [changesets](https://github.com/changesets/changesets). If your PR changes a TypeScript server in `src/` in a way users will notice, add a changeset:

```bash
npm run changeset
```

Pick the affected package(s), choose a bump type, and write a one-line summary — that line becomes the CHANGELOG entry. Commit the generated file in `.changeset/` with your PR.

Bump types:

- **patch** — bug fixes
- **minor** — new tools, prompts, resources, or options
- **major** — breaking changes (tool removed or renamed, schema change that breaks clients, protocol or Node floor bump)

Docs-only, CI-only, and Python-only changes don't need a changeset. The Python servers (`fetch`, `git`, `time`) use CalVer and are not managed by changesets — see [RELEASING.md](../RELEASING.md).

Merged changesets accumulate in a rolling **"Version Packages" PR**; merging that PR applies the version bumps and CHANGELOG updates. Publishing happens when a maintainer creates a GitHub Release.
