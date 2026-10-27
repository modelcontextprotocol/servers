---
"@modelcontextprotocol/server-everything": patch
---

`trigger-elicitation-request` now summarizes an accepted form by the fields the form actually asks for: it lists the favorite first line and the five enum fields, and no longer reports `color` or `petType`, which the form never defined.
