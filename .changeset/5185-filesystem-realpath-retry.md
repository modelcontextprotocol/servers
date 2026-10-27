---
"@modelcontextprotocol/server-filesystem": patch
---

A Root or command-line directory whose `realpath` fails once is now retried after a short delay instead of being lost for the life of the process. On Windows the first native `realpath` right after `subst` maps a drive can fail before the mapping is visible; a Root was dropped as inaccessible, and a command-line directory lost its resolved spelling, so every request on the drive was refused.
