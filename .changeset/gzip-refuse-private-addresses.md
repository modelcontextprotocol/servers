---
"@modelcontextprotocol/server-everything": minor
---

`gzip-file-as-resource` now refuses to fetch from loopback, private, link-local (cloud metadata) and other non-public addresses, on the caller's URL and on every redirect hop, and applies `GZIP_ALLOWED_DOMAINS` to every hop too. Set `GZIP_ALLOW_PRIVATE_IPS=1` to fetch from a local or private origin as before.
