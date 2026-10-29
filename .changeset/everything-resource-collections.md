---
"@modelcontextprotocol/server-everything": minor
---

Add a resource collection example: reading `demo://resource/collection/summer-specials`, or the `demo://resource/collection/by-category/{category}` template, returns several contents in one `resources/read`, each under its item's own `demo://resource/collection/item/{itemId}` URI, which reads back on its own. Both templates complete their variable.
