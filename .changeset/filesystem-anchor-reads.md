---
"@modelcontextprotocol/server-filesystem": patch
---

Anchor read tools to the validated file, as write tools are, and pin the source of a same-device `move_file` to the entry that was validated. A FIFO, socket or device is refused rather than read.
