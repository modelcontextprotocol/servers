---
"@modelcontextprotocol/server-filesystem": minor
---

Add a `--read-only` command-line flag. With it the server registers only the tools annotated `readOnlyHint: true`, so every tool that writes (such as `write_file` and `edit_file`) is not listed and cannot be called, on both protocol eras and whether the directories come from the command line or a client's Roots. `--` now ends the options, so a directory named like an option can still be given after it.
