---
"@modelcontextprotocol/server-filesystem": minor
---

Add a `--read-only` command-line flag. With it the server registers only the tools annotated `readOnlyHint: true`, so `write_file`, `edit_file`, `create_directory` and `move_file` are not listed and cannot be called, on both protocol eras and whether the directories come from the command line or a client's Roots. `--` now ends the options, so a directory named like an option can still be given after it.
