<!--
  ⚠️ Before you open this pull request, please read our contribution policy.

  We accept ISSUES, NOT PULL REQUESTS from anyone but the repository
  maintainers, organization members with write access included.

  Design and implementation are done by the maintainers through a
  prompt-driven workflow (see AGENTS.md). Outside pull requests are closed,
  not merged: a diff written outside that workflow has to be reverse-engineered
  to fit our conventions, tests and gates, so it's faster for us to re-derive
  the change from your intent.

  If you've found a bug or want a feature:
    → Open an issue instead, using the Bug report or Feature request form.

  If you've already built the change locally:
    → Open an issue and share the PROMPT(S) you used to generate it, not a
      diff. We'll reproduce it through our own workflow.

  If you want to list or add a server:
    → Publish it to the MCP Server Registry instead
      (https://github.com/modelcontextprotocol/registry).

  Full policy:
  https://github.com/modelcontextprotocol/servers/blob/main/CONTRIBUTING.md

  Maintainers: delete this comment and the banner below, keep the first line
  as `Closes #<ISSUE_NUMBER>`, and fill in the sections.
-->

> **Heads up:** this repository accepts **issues, not pull requests**, from
> anyone but the repository maintainers. Please read
> [`CONTRIBUTING.md`](https://github.com/modelcontextprotocol/servers/blob/main/CONTRIBUTING.md) before continuing. If you're not a
> maintainer, open an issue (and share the prompt you used, if you've already
> built the change) rather than this PR. To make a server discoverable, publish
> it to the [MCP Server Registry](https://github.com/modelcontextprotocol/registry).

Closes #<ISSUE_NUMBER>

## Description

## Server Details

<!-- If modifying an existing server, provide details -->

- Server: <!-- e.g., filesystem, git -->
- Changes to: <!-- e.g., tools, resources, prompts -->

## Motivation and Context

<!-- Why is this change needed? What problem does it solve? -->

## How Has This Been Tested?

<!-- Have you tested this with an LLM client? Which scenarios were tested? -->

## Breaking Changes

<!-- Will users need to update their MCP client configurations? -->

## Types of changes

<!-- What types of changes does your code introduce? Put an `x` in all the boxes that apply: -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Checklist

<!-- Go over all the following points, and put an `x` in all the boxes that apply. -->

- [ ] I have read the [MCP Protocol Documentation](https://modelcontextprotocol.io)
- [ ] My changes follows MCP security best practices
- [ ] I have updated the server's README accordingly
- [ ] I have added a changeset (`npm run changeset`) if this changes what a TypeScript server publishes
- [ ] I have tested this with an LLM client
- [ ] My code follows the repository's style guidelines
- [ ] New and existing tests pass locally
- [ ] I have added appropriate error handling
- [ ] I have documented all environment variables and configuration options

## Additional context

<!-- Add any other context, implementation notes, or design decisions -->
