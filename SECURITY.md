# Security Policy

Thank you for helping keep the Model Context Protocol and its ecosystem secure.

## Important Notice

The servers in this repository are **reference implementations** intended to demonstrate
MCP features and SDK usage. They serve as educational examples for developers building
their own MCP servers, not as production-ready solutions.

This repository is **not** eligible for security vulnerability reporting. If you discover
a vulnerability in an MCP SDK, please report it in the appropriate SDK repository.

## Reporting Security Issues in MCP SDKs

If you discover a security vulnerability in an MCP SDK, please report it through the
[GitHub Security Advisory process](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
in the relevant SDK repository.

Please **do not** report security vulnerabilities through public GitHub issues, discussions,
or pull requests.

## Local security hardening (fetch & git servers)

Since these servers are reference implementations, deployers may run them against
untrusted input or expose them beyond a single trusted client. Two gaps found in local
review have been hardened; both changes are additive and off-by-default-safe (the
secure behavior is now the default, with an explicit opt-out flag for anyone who
needs the old, permissive behavior).

### `fetch` server: server-side request forgery (SSRF) protection

**Before:** `fetch_url()` and `check_may_autonomously_fetch_url()` called
`httpx.AsyncClient.get()` with `follow_redirects=True` and no restriction on the
target address. A client could direct the server to fetch loopback, private, or
link-local addresses (e.g. cloud metadata endpoints, internal services) directly,
or reach them indirectly via an HTTP redirect from an otherwise-allowed URL.

**After** (`src/fetch/src/mcp_server_fetch/server.py`):

- `check_url_is_not_internal()` resolves the target hostname via
  `socket.getaddrinfo()` and rejects the request if **any** resolved address is
  private, loopback, link-local, multicast, reserved, or unspecified (per Python's
  `ipaddress` module classification). Resolving before connecting — rather than only
  string-matching the hostname — closes DNS-rebinding bypasses.
- Redirects are no longer followed automatically by `httpx`. `_get_with_ssrf_protection()`
  follows redirects manually (capped at 5 hops) and re-runs the address check against
  **every** redirect target, so a redirect can't be used to reach an internal address
  that the original URL wouldn't have been allowed to reach.
- This is on by default. Pass `--allow-private-ips` to disable it if every client that
  can reach the server is trusted and access to internal addresses is intentional.

### `git` server: unrestricted `repo_path` when `--repository` is not set

**Before:** `validate_repo_path()` only enforced a boundary when `--repository` was
passed on the command line — if it wasn't, `allowed_repository` was `None` and
validation returned immediately, so a client could pass **any** `repo_path` to any
tool (e.g. `git_log`, `git_diff`, `git_commit`) with no restriction at all, including
paths well outside any repository the operator intended to expose.

**After** (`src/git/src/mcp_server_git/server.py`, `src/git/src/mcp_server_git/__init__.py`):

- When `--repository` is not passed, `serve()` now defaults `allowed_repository` to
  the current working directory instead of leaving it unrestricted. `validate_repo_path()`
  itself is unchanged — it still just checks `repo_path` against whatever
  `allowed_repository` it's given.
- A new `--allow-any-repository` flag restores the previous unrestricted behavior for
  operators who intentionally want it.

### Verification

Both changes are covered by the existing test suites, run via `uv run pytest -q` in
`src/fetch` and `src/git` respectively (20 and 47 tests passing at the time of writing).
No new test infrastructure was required.
