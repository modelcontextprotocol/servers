---
"@modelcontextprotocol/server-everything": patch
---

`gzip-file-as-resource` now fails with an error naming the URL and HTTP status when the fetch returns a non-2xx response, instead of gzipping the error page as the file.
