---
"@modelcontextprotocol/server-filesystem": patch
---

Paths that differ from the names on disk only in Unicode form now resolve (#1970). An NFC spelling of an allowed directory whose name is stored NFD (macOS "Capture d’écran", Japanese dakuten) is no longer refused as outside the allowed directories, and a request that spells a U+202F or U+00A0 in a name as a plain space (the macOS screenshot "Screenshot … at 2.40.40 PM.png") finds the file instead of failing with ENOENT. The exact spelling still wins when it exists, and a name matching two entries is refused as ambiguous.
