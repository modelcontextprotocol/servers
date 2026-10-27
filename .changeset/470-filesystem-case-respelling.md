---
"@modelcontextprotocol/server-filesystem": patch
---

A path that spells an allowed directory's own name in a letter case matching neither the configured nor the on-disk spelling (for example `C:\Work\CASETEST\file.txt` for an allowed `C:\Work\CaseTest`) is no longer refused on a case-insensitive file system (Windows NTFS, default macOS APFS). The request is mapped onto the allowed directory only where the file system confirms, component by component, that both spellings name one entry, so a sibling directory differing only in case is still refused on a case-sensitive directory.
