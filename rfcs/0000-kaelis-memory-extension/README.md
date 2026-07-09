# RFC: Kaelis Memory Extension for Shared Persistent Memory

## Summary
This RFC proposes a set of MCP tools extending the Model Context Protocol with shared persistent memory capabilities, including multi-agent collaboration spaces, permission management, version control, and self-evolving memory.

## Motivation
Current MCP tools are well-suited for stateless interactions, but multi-agent collaboration lacks a shared persistence layer for long-running tasks. This extension provides:
- Shared memory spaces with fine-grained permissions
- Full-text search (FTS5) across memories
- Optimistic locking for concurrent access
- Self-evolving memory optimisation
- Semantic publish-subscribe for memory change notifications

## Specification
Five new MCP tools are proposed:

### memory_remember
Write or update a shared memory in a collaborative space.

### memory_recall
Search memories within a shared space.

### memory_forget
Delete a memory with audit trail.

### memory_evolve
Trigger self-evolution on specified memories.

### memory_subscribe
Subscribe to memory changes matching tags or patterns.

Full JSON schemas are available in the reference implementation.

## Security Considerations
- Four-tier role model: owner, admin, writer, reader
- All write/delete operations are audited
- Optimistic locking prevents concurrent modification conflicts

## Reference Implementation
Kaelis project: https://github.com/Alex-conder/Kaelis-archive
Implementation files: `core/shared_memory_space.py`, `core/mcp/server.py`

## Backward Compatibility
This extension does not modify existing MCP protocol behaviour. All new tools are optional.
