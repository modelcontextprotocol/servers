---
"@modelcontextprotocol/server-filesystem": patch
---

Every read-only tool (`read_file`, `read_text_file`, `read_media_file`, `read_multiple_files`, `list_directory`, `list_directory_with_sizes`, `directory_tree`, `search_files`, `get_file_info` and `list_allowed_directories`) now also sets `idempotentHint: true` and `destructiveHint: false`, so all four tool annotation hints are explicit on every tool and a client never falls back to the spec's defaults (destructive, not idempotent).
