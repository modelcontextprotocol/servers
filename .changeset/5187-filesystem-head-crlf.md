---
"@modelcontextprotocol/server-filesystem": patch
---

`read_text_file` with `head` no longer leaves a `\r` at the end of each line of a CRLF file. Like `tail`, it returns lines normalized to LF, including a `\r\n` pair split across a read chunk. LF output is unchanged.
