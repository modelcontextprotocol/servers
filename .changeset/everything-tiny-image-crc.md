---
"@modelcontextprotocol/server-everything": patch
---

`get-tiny-image` (and `get-annotated-message`'s image) now returns a fully valid PNG: the embedded logo's corrupt `iCCP` color-profile chunk, whose CRC-32 did not match and which strict decoders rejected, is removed. The pixels are unchanged.
