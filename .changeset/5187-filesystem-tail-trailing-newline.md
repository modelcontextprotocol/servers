---
"@modelcontextprotocol/server-filesystem": patch
---

`read_text_file` with `tail` no longer returns one line too few when the file ends with a newline: the final newline ends the last line instead of counting as an empty one, for LF and CRLF files and for files longer than one read chunk. Like `head`, the result carries no trailing newline.
