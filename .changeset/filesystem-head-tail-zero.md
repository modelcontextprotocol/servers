---
"@modelcontextprotocol/server-filesystem": patch
---

`read_text_file` (and the deprecated `read_file`) now treats `head: 0` or `tail: 0` as a request for zero lines and returns empty text, instead of the whole file. `head` and `tail` accept only non-negative integers, and `head` with `tail` is rejected even when either is 0.
