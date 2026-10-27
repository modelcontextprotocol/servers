---
"@modelcontextprotocol/server-everything": minor
---

`get-env` now masks the values of credential-like environment variables (names with a `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `CREDENTIAL`, `AUTH` or `COOKIE` segment) as `"<redacted>"`. Set `GET_ENV_INCLUDE_SECRETS=1` to return every value unmasked.
