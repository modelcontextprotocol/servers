---
"@modelcontextprotocol/server-filesystem": patch
---

Report a dangling symlink as a broken symlink. A request through a symlink whose target does not exist is still refused, but the error now names the symlink instead of saying its parent directory, which exists, does not.
