---
"@modelcontextprotocol/server-filesystem": patch
---

`edit_file`: an `oldText` of whole lines that ends with a newline now matches when only indentation differs, keeping the file's indentation; the trailing newline ends the last line instead of adding an empty one.
