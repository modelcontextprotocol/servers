---
"@modelcontextprotocol/server-filesystem": patch
---

`search_files` no longer answers a search that matched nothing with a bare `No matches found`. The result still begins with those words, and now names the pattern and the directory searched, says the pattern is a case-sensitive glob over names relative to that directory (never file contents), and, for a pattern with no `**`, suggests the `**/` form that reaches subdirectories. The tool's description and its `pattern` input also gain realistic example patterns (`**/*.json`, `**/*report*`) next to the generic ones.
