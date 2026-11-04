---
"@modelcontextprotocol/server-sequential-thinking": patch
---

Bound the thought box logged to stderr. Since the multi-line box, every row was padded to the thought's longest line, so a thought with one long line and many short ones logged their product: a 60 KB thought wrote 400 million characters and could exhaust the server's memory. The box is now at most 100 characters wide (longer lines wrap) and at most 1000 rows tall (it then says how many lines it left out), about 107 KB at most. The stored thought and the tool result are unchanged.
