---
"@modelcontextprotocol/server-memory": patch
---

Close three narrow gaps in how the memory file lock changes hands between server processes: a writer could start while a live lock was momentarily moved aside by a server checking a stale one, a lock could be put back after its holder had finished (delaying later writes by up to 30 seconds), and a server releasing a lock it had held past the stale timeout could remove the lock of the server that took over. The momentary `<memory file>.lock.break` file now orders every release and stale-lock break, and a server that has just created the lock waits for it to go before writing. Servers on this version and on 2.2.1 or earlier can still share a memory file; the older server's own releases and acquisitions keep those gaps.
