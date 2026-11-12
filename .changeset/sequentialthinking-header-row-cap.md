---
"@modelcontextprotocol/server-sequential-thinking": patch
---

Count the thought box's header rows toward its 1000-row cap, so a long `branchId` can no longer draw past it on stderr: line breaks in a `branchId` are shown as `\r` and `\n`, and a header too long for the cap is cut with a row saying how many characters it left out (#5526).
