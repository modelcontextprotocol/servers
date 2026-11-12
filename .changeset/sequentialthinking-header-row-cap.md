---
"@modelcontextprotocol/server-sequential-thinking": patch
---

Count the thought box's header rows toward its 1000-row cap, so a long `branchId` can no longer draw past it on stderr, and cut a header too long for the cap with a row saying how many characters it left out (#5526).
