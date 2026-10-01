# Contributing to MCP Servers

Thank you for your interest in improving the MCP reference servers. Contributors
are genuinely valued, and this document explains how to get your input into a
form the maintainers can act on quickly and consistently.

## TL;DR

**We accept issues, not pull requests.** Design and implementation are done by
the repository maintainers. If you've already built a fix or feature locally,
share **the prompt you used** to produce it, not the source code. This applies
to everyone outside the repository maintainers, including organization members
who happen to have write access to this repository.

## Why this policy exists

The reference servers are developed with an AI-assisted, prompt-driven workflow
built around shared conventions and strict gates (see [`AGENTS.md`](./AGENTS.md)):
seven independently published packages in two languages, each with its own
tests, type checks, lint and release steps, all tracked on one project board.

A diff written outside that workflow has to be reverse-engineered to fit those
conventions, tests and gates, and it is often faster to re-derive the change than
to adapt the patch. Many outside pull requests also race each other for the same
bug. A well-formed issue captures your **intent**, and the **prompt** behind a
local change lets us reproduce the work inside our own workflow, with the quality
bar already built in.

This policy is about efficiency, not gatekeeping. Your bug reports, ideas and
prompts directly shape what gets built.

## Who opens pull requests

Pull requests against this repository are opened by the **repository
maintainers** only. That includes organization members with write access: being
able to push a branch here is not the same as being asked to. The constraint is
the workflow described above, not permissions.

If you're not a repository maintainer, open a **detailed issue** instead and a
maintainer will pick it up. A pull request from anyone else is closed with a
pointer back to this document; if it held a fix worth keeping, a maintainer files
an issue for it first, so the work is not lost.

**Every pull request references an issue**, including the maintainers' own. Work
is tracked on the project board through issues, so a PR without one is invisible
to the board. That is why a well-formed issue is the useful contribution here,
and why writing one is never wasted effort.

## How to report a bug or request a feature

Open a well-formed issue. [**New issue**](https://github.com/modelcontextprotocol/servers/issues/new/choose)
offers a **Bug report** and a **Feature request** form, and both start by asking
which server the issue is about. The bug form also asks for the server version,
how you ran it, the transport, the protocol era your client speaks and the client
you used, because those are the facts triage needs first.

GitHub serves the issue chooser from the repository's **default branch**
(`main`), and development happens on `v2/main`, which reaches `main` at milestone
releases. So the forms appear in the chooser from the first milestone release
that contains them; until then, open a blank issue and give the same details.

The chooser also links to the private security-advisory form and to the MCP
Server Registry. **Never report a security vulnerability in a public issue**; use
[the private advisory form](https://github.com/modelcontextprotocol/servers/security/advisories/new)
instead.

### What we act on

The servers here are **reference implementations**, meant to show how each part
of the protocol is used, not general-purpose products. Issues are most likely to
be picked up when they ask for:

- **Bug fixes.**
- **Usability improvements**: making the servers easier to use for humans and
  agents.
- **Enhancements that demonstrate MCP protocol features.** We especially want the
  reference servers to illustrate underused parts of the protocol beyond Tools,
  such as Resources, Prompts or Roots. For example, adding Roots support to the
  filesystem server showcases an important but lesser-known feature.

We're more selective about:

- **Other new features**, especially ones that are not central to a server's
  purpose or are highly opinionated. If you need a specific feature, we encourage
  you to build an enhanced version and publish it to the
  [MCP Server Registry](https://github.com/modelcontextprotocol/registry). A
  diverse ecosystem of servers is good for everyone.
- **Wholly new documentation**, especially if it is not vendor neutral (for
  example, how to run a particular server with a particular client).
  Improvements to existing documentation are welcome, though we generally prefer
  fixing the rough edge to documenting it.

We don't accept:

- **New server implementations.** Publish them to the
  [MCP Server Registry](https://github.com/modelcontextprotocol/registry)
  instead.
- **Server listings.** The README's list of third-party servers has been retired
  in favor of the Registry. To make your server discoverable, follow the
  Registry's [quickstart guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx).
  You can browse published servers at
  [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/).

## If you've already fixed it locally

Please don't send a diff or open a pull request. Instead, open an issue that
includes:

- **The prompt(s) you used** to generate the change: the exact text, so we can
  reproduce it through our own workflow.
- **The behavior before and after** your change.
- **How you verified it**: the steps you ran, the tests you added, what you
  observed, and the MCP client you tried it with.

We'll reproduce the change through our workflow so it lands with the right
conventions, tests and coverage.

## What makes a good issue

A great issue gives us everything we need to act without a round-trip:

- **The server** it concerns (`everything`, `filesystem`, `memory`,
  `sequentialthinking`, `fetch`, `git` or `time`), and its version.
- **A clear reproduction or use case**: exact steps to reproduce a bug, or a
  concrete description of the problem a feature would solve.
- **Expected and actual behavior**: what you expected, and what you saw instead.
- **The client and environment**: the MCP client and its version, the protocol
  era it speaks, the transport, how you ran the server (`npx`, `uvx`, Docker, from
  source), your OS, and the relevant configuration with secrets redacted.
- **The exact prompt text**, if you generated a local change.

If you're unsure how to scope something, open the issue anyway and say so. We'll
help shape it.

## Want to work on the servers with us?

The issues-only policy is about how **unsolicited patches** are handled; it is not
a closed door. If you'd like to contribute at a deeper level, in general or in a
specific area, we'd like to hear from you. See
[how the MCP community communicates](https://modelcontextprotocol.io/community/communication)
for the Contributor Discord, the community calls, and how each channel is used.
From there we can scope a piece of work with you and supervise it through our
workflow.

All participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## For maintainers

The rules for maintainers and the agents working for them are in
[`AGENTS.md`](./AGENTS.md), and the procedures are in the skills it indexes. Before
pushing, run `npm run format` at the repository root and then
**`npm run local:gate`**, which runs every check CI runs for both languages:
the repo-wide guards, each TypeScript server's `validate` (format check, lint
where a warning fails like an error, typecheck, build, tests), each Python
server's `validate:py` chain, the skills validator, and a boot smoke of every
server. [`docs/quality-gate.md`](./docs/quality-gate.md) describes each stage.
While iterating, `npm run validate -w src/<server>` checks a single TypeScript
server and `npm run validate:py -- <server>` a single Python one; neither
replaces the gate.

A pull request that changes what a TypeScript server publishes also carries a
**changeset** (`npm run changeset`), which is how that server's next version
and its CHANGELOG entry are decided; [`.changeset/README.md`](./.changeset/README.md)
says when one is needed and which bump to pick. The Python servers are versioned
by date instead. [`RELEASING.md`](./RELEASING.md) describes both, and how a
release is published.

Thank you for helping make the MCP servers better for everyone!
