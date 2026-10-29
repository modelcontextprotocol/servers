---
"@modelcontextprotocol/server-filesystem": patch
---

`list_directory_with_sizes` no longer reports an entry it could not stat (unreadable, a dangling symlink, removed mid-listing, or a symlink leaving the allowed directories) as `0 B`. Such an entry is shown with size `unknown`, sorts last by size, and is left out of the combined size, which notes how many files it excludes.
