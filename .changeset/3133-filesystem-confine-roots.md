---
"@modelcontextprotocol/server-filesystem": minor
---

Add a `--confine-roots` command-line flag. With it, a 2025-era client's Roots can narrow the command-line directories but never replace or widen them: a root inside a command-line directory is allowed, a root containing one is narrowed to it, and a root outside all of them is ignored and logged. Without the flag, Roots replace the command-line directories as before.
