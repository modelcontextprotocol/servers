# Contributing to MCP Servers

Thanks for your interest in contributing! Here's how you can help make this repo better.

We accept changes through [the standard GitHub flow model](https://docs.github.com/en/get-started/using-github/github-flow).

## Server Listings

The README no longer contains a list of third-party MCP servers — that list has been retired in favor of the [MCP Server Registry](https://github.com/modelcontextprotocol/registry). To make your server discoverable, follow the [quickstart guide](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx) to publish it there.

You can browse published servers at [https://registry.modelcontextprotocol.io/](https://registry.modelcontextprotocol.io/).

## Server Implementations

We welcome:
- **Bug fixes** — Help us squash those pesky bugs.
- **Usability improvements** — Making servers easier to use for humans and agents.
- **Enhancements that demonstrate MCP protocol features** — We encourage contributions that help reference servers better illustrate underutilized aspects of the MCP protocol beyond just Tools, such as Resources, Prompts, or Roots. For example, adding Roots support to filesystem-server helps showcase this important but lesser-known feature.

We're more selective about:
- **Other new features** — Especially if they're not crucial to the server's core purpose or are highly opinionated. The existing servers are reference servers meant to inspire the community. If you need specific features, we encourage you to build enhanced versions and publish them to the [MCP Server Registry](https://github.com/modelcontextprotocol/registry)! We think a diverse ecosystem of servers is beneficial for everyone.

We don't accept:
- **New server implementations** — We encourage you to publish them to the [MCP Server Registry](https://github.com/modelcontextprotocol/registry) instead.

## Changesets (TypeScript versioning)

The TypeScript servers (`everything`, `filesystem`, `memory`, `sequentialthinking`) are versioned with [changesets](https://github.com/changesets/changesets). If your PR changes one of them in a way users will notice, include a changeset:

```bash
npm run changeset
```

Pick the affected package(s), choose a bump type (**patch** = bug fixes; **minor** = new tools, prompts, resources, or options; **major** = breaking changes), and write a one-line summary — it becomes the CHANGELOG entry. Commit the generated `.changeset/*.md` file with your PR.

Docs-only, CI-only, and Python-only changes don't need a changeset. The Python servers use CalVer and are released separately — see [RELEASING.md](RELEASING.md).

## Testing

When adding or configuring tests for servers implemented in TypeScript, use **vitest** as the test framework. Vitest provides better ESM support, faster test execution, and a more modern testing experience.

## Documentation

Improvements to existing documentation is welcome - although generally we'd prefer ergonomic improvements than documenting pain points if possible!

We're more selective about adding wholly new documentation, especially in ways that aren't vendor neutral (e.g. how to run a particular server with a particular client).

## Community

[Learn how the MCP community communicates](https://modelcontextprotocol.io/community/communication).

Thank you for helping make MCP servers better for everyone!