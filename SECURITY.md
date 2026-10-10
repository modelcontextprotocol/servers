# Security Policy

Thank you for helping keep the Model Context Protocol and its ecosystem secure.

## Important Notice

The servers in this repository are **reference implementations** intended to demonstrate
MCP features and SDK usage. They serve as educational examples for developers building
their own MCP servers, not as production-ready solutions.

This repository is **not** eligible for security vulnerability reporting. If you discover
a vulnerability in an MCP SDK, please report it in the appropriate SDK repository.

### Archived reference servers

Several older reference servers (for example PostgreSQL, GitHub, Puppeteer, and Brave Search)
were moved to [`servers-archived`](https://github.com/modelcontextprotocol/servers-archived).
That archive states that **no security guarantees** are provided for those servers.

- Do **not** open public issues here about archived packages; this repo only maintains the
  active reference servers listed in the README.
- Prefer replacements from the [MCP Registry](https://registry.modelcontextprotocol.io/)
  when available.
- npm deprecation text for archived packages is maintained separately by package publishers;
  if you still install an archived package, treat the archive README as the source of truth
  for support status.

## Reporting Security Issues in MCP SDKs

If you discover a security vulnerability in an MCP SDK, please report it through the
[GitHub Security Advisory process](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
in the relevant SDK repository.

Please **do not** report security vulnerabilities through public GitHub issues, discussions,
or pull requests.
