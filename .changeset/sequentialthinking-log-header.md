---
"@modelcontextprotocol/server-sequential-thinking": patch
---

The thought log on stderr no longer prints "undefined" in its headers: a revision with no `revisesThought` reads "Revision N/M", and a branch with no `branchId` reads "(from thought N)" with no ID. The box border is sized from the header's visible text, so colour escape codes no longer make it wider than its text.
