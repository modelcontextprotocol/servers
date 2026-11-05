---
"@modelcontextprotocol/server-filesystem": minor
---

Add `--read-only-dir <path>`, repeatable, to make one allowed directory read-only while the others stay writable. Every write tool stays listed but refuses a target inside a read-only directory (`move_file` on either end, including moving a directory that contains one, and `copy_file` on its destination), checked on the resolved path so a symlink cannot route around it; a 2025-era client's Roots never lift the marking. `list_allowed_directories` names the read-only directories.
