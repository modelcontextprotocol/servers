---
"@modelcontextprotocol/server-filesystem": patch
---

`search_files` no longer drops a subdirectory it cannot read without saying so. It still returns the matches it found, and now follows them with a note that the search is incomplete, listing each unreadable directory and its error code. Paths outside the allowed directories are still skipped silently, and an unreadable starting directory is still an error.
