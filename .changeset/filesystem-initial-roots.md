---
"@modelcontextprotocol/server-filesystem": patch
---

Tool calls now wait for the client's initial roots before checking paths, so a call sent right after connecting is no longer refused with "Access denied" (#3204). A server started with no directories, connected to a client without Roots support, now fails visibly: it logs the reason, closes the connection and exits with status 1, instead of staying up and refusing every call (#4992).
