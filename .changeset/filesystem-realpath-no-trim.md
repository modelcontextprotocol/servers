---
"@modelcontextprotocol/server-filesystem": patch
---

Keep an allowed directory's name exactly as the file system spells it. A command-line directory, or a client Root's realpath, whose name ends in a space or a quote was trimmed, so the server allowed the sibling directory without that suffix (and refused the directory that was actually given).
