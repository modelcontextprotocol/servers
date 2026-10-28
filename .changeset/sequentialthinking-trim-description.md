---
"@modelcontextprotocol/server-sequential-thinking": patch
---

Trim the `sequentialthinking` tool description from 2,781 to 1,009 characters (about 566 to 198 tokens), so it fits the 1,024-character cap OpenAI and Azure OpenAI put on tool descriptions (#799). The "Key features" and "Parameters explained" sections are gone: each parameter is still described by the input schema, which is unchanged, and the guidance those field descriptions do not carry is kept (#4507).
