# Security Policy

Thank you for helping keep the Model Context Protocol and its ecosystem secure.
This page says how to report a vulnerability in one of the servers in this
repository, and where to send a report that belongs somewhere else.

## Reporting a vulnerability

If you find a security vulnerability in one of the servers in this repository,
report it privately through
[GitHub's private vulnerability reporting](https://github.com/modelcontextprotocol/servers/security/advisories/new)
for this repository (the **Security** tab → **Report a vulnerability**). See
GitHub's guide to
[privately reporting a security vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).

Please **do not** report security vulnerabilities through public GitHub issues,
discussions, or pull requests.

## Scope

**In scope:** the servers maintained in this repository, under [`src/`](src):

| Server             | Package                                                  |
| ------------------ | -------------------------------------------------------- |
| everything         | `@modelcontextprotocol/server-everything` (npm)          |
| fetch              | `mcp-server-fetch` (PyPI)                                |
| filesystem         | `@modelcontextprotocol/server-filesystem` (npm)          |
| git                | `mcp-server-git` (PyPI)                                  |
| memory             | `@modelcontextprotocol/server-memory` (npm)              |
| sequentialthinking | `@modelcontextprotocol/server-sequential-thinking` (npm) |
| time               | `mcp-server-time` (PyPI)                                 |

**Report these elsewhere:**

- **A vulnerability in an MCP SDK**, including transport handling, session
  management and message validation that a server only inherits: report it
  privately to the
  [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/new)
  or the
  [Python SDK](https://github.com/modelcontextprotocol/python-sdk/security/advisories/new).
  If you are not sure whether the problem is in a server or in its SDK, report
  it here and we will route it.
- **A server that is no longer in this repository.** Servers moved to
  [`servers-archived`](https://github.com/modelcontextprotocol/servers-archived)
  are unmaintained and receive no security fixes.
- **A third-party server**, including those listed in the
  [MCP Registry](https://github.com/modelcontextprotocol/registry): report it to
  that server's maintainers.

## Supported versions

Each server is versioned and published on its own. Security fixes are made on
the current development line and ship in the **next release** of the affected
server; older releases are not patched. Upgrade to the latest release of a
server to receive its fixes.

## About these servers

The servers here are **reference implementations**, written to demonstrate MCP
features and SDK usage rather than as production-ready products. They are still
real software that people run, and several act on the host: `filesystem` and
`git` read and write local files, and `fetch` makes outbound network requests.
A way around a boundary a server claims to enforce (its allowed directories,
the client's Roots, or `robots.txt`, for example) is a vulnerability, and we
want to hear about it. A server doing what its README documents is not.
Deploying a reference server safely for your own threat model remains your
responsibility.

## What to include

To help us triage and respond quickly, please include:

- Which server is affected, and its version
- How it was configured (arguments, environment variables, allowed directories
  or Roots) and which client ran it
- A description of the vulnerability and its potential impact
- Steps to reproduce it, or a proof of concept
- Any suggested fix (optional)

## What happens next

A maintainer reviews each report, confirms whether the code is this
repository's or an SDK's, and either accepts the advisory or closes it with a
reason. An accepted advisory is fixed privately, and published once the fixed
release is available. With your agreement, you are credited in the published
advisory.
