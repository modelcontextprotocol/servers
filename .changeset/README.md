# Changesets

The four TypeScript servers (`everything`, `filesystem`, `memory`,
`sequentialthinking`) are versioned with
[changesets](https://github.com/changesets/changesets). This directory holds the
pending ones: one small Markdown file per change, each naming the packages it
bumps, the bump type, and the line that becomes the CHANGELOG entry. The whole
release flow is in [`RELEASING.md`](../RELEASING.md).

A PR that changes what a TypeScript server publishes adds one:

```sh
npm run changeset
```

Pick the affected package or packages, choose the bump type, and write a
one-line summary for a user of the server. Commit the generated file with the
PR.

| Bump | When |
| --- | --- |
| **patch** | A bug fix |
| **minor** | A new tool, prompt, resource or option |
| **major** | A breaking change: a tool removed or renamed, a schema change that breaks clients, a protocol or Node floor bump |

A change that does not alter a published TypeScript package needs none: docs,
skills, workflows, the gate's scripts, tests, and anything in a Python server.
The Python servers (`fetch`, `git`, `time`) use CalVer and are stamped by the
**Prepare Python Release** workflow instead.

Merged changesets accumulate on `v2/main`. The **Version Packages** workflow
keeps one rolling PR open that consumes them: merging it applies the version
bumps, writes each package's `CHANGELOG.md`, and deletes the consumed files.
Nothing is published until a maintainer publishes a GitHub Release.
