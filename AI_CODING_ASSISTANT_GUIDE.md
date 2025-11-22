# AI Coding Assistant Integration Guide

**For**: GitHub Copilot Pro, Cursor AI, Claude Code, and other AI coding assistants
**Repository**: MCP Servers (Model Context Protocol)
**Last Updated**: 2025-11-10
**Status**: Production-Ready, Security-Hardened

---

## 🤖 Quick Start for AI Assistants

### Security-First Development Rules

**CRITICAL**: This codebase has been security-hardened through 3 comprehensive audits. When suggesting code changes, you MUST:

1. ✅ **Always validate user input** before processing
2. ✅ **Never use Array.includes() in loops** (use Set.has() instead)
3. ✅ **Always use atomic file writes** (temp-file-then-rename pattern)
4. ✅ **Never allow prototype pollution** (check for `__proto__`, `constructor`, etc.)
5. ✅ **Never allow newlines in JSONL strings** (causes data corruption)
6. ✅ **Never start git references with dashes** (argument injection risk)
7. ✅ **Always sanitize error messages** (no path disclosure)
8. ✅ **Always check resource limits** before operations

---

## 📋 Code Patterns for AI Learning

### Pattern 1: Input Validation (REQUIRED for all user input)

```typescript
// ✅ CORRECT - Always validate and sanitize user input
function processEntityName(name: string): string {
  // 1. Type check
  if (typeof name !== 'string') {
    throw new Error('Entity name must be a string');
  }

  // 2. Remove control characters (including newlines for JSONL safety)
  const sanitized = name.replace(/[\x00-\x1F\x7F]/g, '');

  // 3. Check length
  if (sanitized.length > MAX_STRING_LENGTH) {
    throw new Error(`Entity name exceeds maximum length`);
  }

  // 4. Block dangerous property names (prototype pollution)
  const normalized = sanitized.trim().toLowerCase();
  if (FORBIDDEN_PROPERTY_NAMES.has(normalized)) {
    throw new Error(`Forbidden property name: ${sanitized.trim()}`);
  }

  return sanitized.trim();
}

// ❌ WRONG - No validation
function processEntityName(name: string): string {
  return name.trim();  // Vulnerable to injection attacks!
}
```

**GitHub Copilot Prompt**: "Validate and sanitize entity name input, remove control characters, check length limit, block prototype pollution"

**Cursor AI Prompt**: "Add comprehensive input validation following the pattern in validateAndSanitizeString function"

---

### Pattern 2: Performance-Optimized Lookups (REQUIRED in loops)

```typescript
// ✅ CORRECT - O(n) complexity using Set
async function deleteEntities(entityNames: string[]): Promise<void> {
  const graph = await this.loadGraph();

  // Create Set for O(1) lookups (not O(n) with includes!)
  const namesToDelete = new Set(entityNames);

  // Filter is O(n) with O(1) lookups = O(n) total
  graph.entities = graph.entities.filter(e => !namesToDelete.has(e.name));

  await this.saveGraph(graph);
}

// ❌ WRONG - O(n²) complexity
async function deleteEntities(entityNames: string[]): Promise<void> {
  const graph = await this.loadGraph();

  // includes() is O(n), called n times = O(n²)
  graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));

  await this.saveGraph(graph);
}
```

**Performance Impact**: 90x faster for large datasets

**GitHub Copilot Prompt**: "Delete entities using Set for O(1) lookup instead of Array.includes()"

**Cursor AI Prompt**: "Optimize using Set.has() pattern from deleteEntities function"

---

### Pattern 3: Atomic File Writes (REQUIRED for data integrity)

```typescript
// ✅ CORRECT - Atomic write with temp file
async function saveGraph(graph: KnowledgeGraph): Promise<void> {
  const content = JSON.stringify(graph);

  // 1. Write to temporary file with random name
  const tempPath = `${this.filePath}.${randomBytes(16).toString('hex')}.tmp`;

  try {
    // 2. Write content
    await fs.writeFile(tempPath, content, 'utf-8');

    // 3. Atomic rename (POSIX guarantees atomicity)
    await fs.rename(tempPath, this.filePath);
  } catch (error) {
    // 4. Cleanup on error
    try { await fs.unlink(tempPath); } catch {}
    throw error;
  }
}

// ❌ WRONG - Direct write (race condition risk)
async function saveGraph(graph: KnowledgeGraph): Promise<void> {
  const content = JSON.stringify(graph);
  await fs.writeFile(this.filePath, content);  // Can corrupt on crash!
}
```

**Why**: Prevents data corruption if process crashes during write

**GitHub Copilot Prompt**: "Save file atomically using temp-file-then-rename pattern"

**Cursor AI Prompt**: "Implement atomic file write following saveGraph pattern"

---

### Pattern 4: Resource Limit Enforcement (REQUIRED for DoS prevention)

```typescript
// ✅ CORRECT - Check limits before processing
async function createEntities(entities: Entity[]): Promise<Entity[]> {
  const graph = await this.loadGraph();

  // Check resource limit BEFORE processing
  if (graph.entities.length + entities.length > MAX_ENTITIES) {
    throw new Error(
      `Entity limit exceeded. Current: ${graph.entities.length}, ` +
      `Attempting to add: ${entities.length}, Maximum: ${MAX_ENTITIES}`
    );
  }

  // Process only if limit check passed
  graph.entities.push(...entities);
  await this.saveGraph(graph);

  return entities;
}

// ❌ WRONG - No limit check (DoS risk)
async function createEntities(entities: Entity[]): Promise<Entity[]> {
  const graph = await this.loadGraph();
  graph.entities.push(...entities);  // No limit!
  await this.saveGraph(graph);
  return entities;
}
```

**GitHub Copilot Prompt**: "Add resource limit check before creating entities"

**Cursor AI Prompt**: "Enforce MAX_ENTITIES limit following createEntities pattern"

---

### Pattern 5: Sanitized Error Messages (REQUIRED for security)

```typescript
// ✅ CORRECT - Generic error message
function validatePath(path: string): string {
  const isAllowed = checkPathInAllowedDirectories(path);

  if (!isAllowed) {
    // Don't reveal internal paths or directory structure
    throw new Error('Access denied - path outside allowed directories');
  }

  return path;
}

// ❌ WRONG - Information disclosure
function validatePath(path: string): string {
  const isAllowed = checkPathInAllowedDirectories(path);

  if (!isAllowed) {
    // Reveals internal directory structure to attacker!
    throw new Error(
      `Access denied: ${path} not in ${allowedDirs.join(', ')}`
    );
  }

  return path;
}
```

**Why**: Prevents reconnaissance attacks

**GitHub Copilot Prompt**: "Throw generic error message without revealing paths"

**Cursor AI Prompt**: "Sanitize error message following validatePath pattern"

---

## 🎓 Learning from Existing Code

### For GitHub Copilot

**Prompt Templates**:

1. **Input Validation**:
   ```
   // Validate and sanitize [field] input, remove control characters,
   // check length limit, block prototype pollution
   ```

2. **Performance Optimization**:
   ```
   // Delete [items] using Set for O(1) lookup instead of Array.includes()
   ```

3. **Atomic Operations**:
   ```
   // Save [file] atomically using temp-file-then-rename pattern
   ```

4. **Resource Limits**:
   ```
   // Check [LIMIT_NAME] before adding [items]
   ```

### For Cursor AI

**Context Commands**:

1. **Show security pattern**:
   ```
   @codebase Show me the input validation pattern used in src/memory/index.ts
   ```

2. **Apply pattern to new code**:
   ```
   @codebase Apply the atomic file write pattern from saveGraph to this function
   ```

3. **Performance optimization**:
   ```
   @codebase Optimize this loop using the Set pattern from deleteEntities
   ```

---

## 🔍 Code Review Checklist for AI Assistants

When reviewing or generating code, check:

### Security Checklist

- [ ] All user input validated with `validateAndSanitizeString()` or equivalent
- [ ] No prototype pollution vectors (`__proto__`, `constructor`, `prototype`)
- [ ] No newlines in JSONL strings (use `/[\x00-\x1F\x7F]/g` regex)
- [ ] Git parameters don't start with `-` (argument injection)
- [ ] Path traversal prevented (`..` patterns blocked)
- [ ] Error messages sanitized (no path/structure disclosure)
- [ ] Resource limits checked before operations

### Performance Checklist

- [ ] No `Array.includes()` in loops (use `Set.has()`)
- [ ] No `Array.find()` in loops (use `Map.get()`)
- [ ] No `Array.some()` with nested comparisons (use `Set.has()`)
- [ ] Complexity is O(n) or better, not O(n²)

### Data Integrity Checklist

- [ ] File writes use atomic temp-file-then-rename
- [ ] JSONL format validated (one JSON object per line)
- [ ] No data loss on error (try/catch with cleanup)

---

## 📚 Reference Implementation Locations

### Security Patterns

| Pattern | File | Line | Description |
|---------|------|------|-------------|
| Input validation | `src/memory/index.ts` | 143-171 | validateAndSanitizeString |
| Prototype pollution prevention | `src/memory/index.ts` | 127-140 | FORBIDDEN_PROPERTY_NAMES |
| JSONL injection prevention | `src/memory/index.ts` | 150 | Control char removal |
| Argument injection prevention | `src/git/server.py` | 119-120 | Leading dash block |
| Path traversal prevention | `src/memory/index.ts` | 23-27 | Directory traversal check |
| Error sanitization | `src/filesystem/lib.ts` | 115 | Generic error messages |

### Performance Patterns

| Pattern | File | Line | Description |
|---------|------|------|-------------|
| Set-based delete | `src/memory/index.ts` | 307-324 | deleteEntities O(n) |
| Map-based lookup | `src/memory/index.ts` | 326-348 | deleteObservations O(n+m) |
| Set composite keys | `src/memory/index.ts` | 350-367 | deleteRelations O(n+m) |
| Set deduplication | `src/memory/index.ts` | 209-211 | createEntities O(n) |

### Data Integrity Patterns

| Pattern | File | Line | Description |
|---------|------|------|-------------|
| Atomic file write | `src/memory/index.ts` | 191-230 | saveGraph with temp file |
| Graceful error recovery | `src/memory/index.ts` | 168-189 | loadGraph with error handling |
| Resource limit enforcement | `src/memory/index.ts` | 238-255 | MAX_ENTITIES check |

---

## 🚀 Integration with AI Coding Tools

### GitHub Copilot Pro

**Recommended Settings** (`.vscode/settings.json`):
```json
{
  "github.copilot.enable": {
    "*": true,
    "markdown": true,
    "typescript": true,
    "python": true
  },
  "github.copilot.advanced": {
    "debug.overrideEngine": "gpt-4",
    "inlineSuggestCount": 3
  }
}
```

**Using Context**:
- Copilot learns from open files in your editor
- Keep security-related files open when writing new code
- Reference existing patterns in comments

**Example Workflow**:
```typescript
// Copilot: Create a function to validate observation content,
// following the pattern from validateAndSanitizeString
// [Copilot will generate code based on the pattern]
```

### Cursor AI

**Recommended Features**:
- **@codebase**: Search entire codebase for patterns
- **@docs**: Reference documentation files
- **@git**: Understand recent changes

**Example Queries**:
```
@codebase How do I validate user input in this codebase?
@docs Show me the security checklist
@git What security fixes were made recently?
```

**Context Windows**:
- Cursor has larger context (100K+ tokens)
- Can understand entire file and related files
- Use for complex refactoring tasks

### Claude Code

**Best Practices**:
- Provide file paths for reference implementations
- Ask for security review after code generation
- Request performance analysis for loops

**Example**:
```
Please create a function to delete observations, following the performance
pattern in src/memory/index.ts:deleteObservations (use Map and Set for O(n) complexity)
```

---

## 🧪 Testing Patterns for AI Assistants

### Pattern: Security Test

```typescript
describe('Input Validation', () => {
  test('rejects __proto__ in entity names', () => {
    const malicious = { name: '__proto__', entityType: 'test', observations: [] };

    expect(() => validateEntity(malicious))
      .toThrow('forbidden property name');
  });

  test('removes newlines from input', () => {
    const input = 'test\ninjection';
    const result = validateAndSanitizeString(input, 100, 'test');

    expect(result).toBe('testinjection');
    expect(result).not.toContain('\n');
  });
});
```

**GitHub Copilot Prompt**: "Write security test for prototype pollution prevention"

### Pattern: Performance Test

```typescript
describe('Performance', () => {
  test('deleteEntities is O(n) not O(n²)', async () => {
    // Create 10,000 entities
    const entities = Array.from({ length: 10000 }, (_, i) => ({
      name: `entity${i}`,
      entityType: 'test',
      observations: []
    }));

    await manager.createEntities(entities);

    // Delete 5,000 entities
    const toDelete = entities.slice(0, 5000).map(e => e.name);

    const start = Date.now();
    await manager.deleteEntities(toDelete);
    const duration = Date.now() - start;

    // Should complete in under 100ms for O(n)
    expect(duration).toBeLessThan(100);
  });
});
```

**Cursor AI Prompt**: "Generate performance test for deleteEntities ensuring O(n) complexity"

---

## 📖 Documentation for AI Context

**Files to Include in Context Window**:

1. **For Security Work**:
   - `SECURITY_INDEX.md` - Security overview
   - `SECURITY_HARDENING_FINAL.md` - Latest security fixes
   - `AI_AGENT_GUIDE.md` - Best practices

2. **For Implementation Work**:
   - `IMPROVEMENTS.md` - Implementation patterns
   - `AI_AGENT_GUIDE.md` - This file
   - Relevant source file (e.g., `src/memory/index.ts`)

3. **For Testing Work**:
   - Relevant test file (e.g., `src/memory/__tests__/knowledge-graph.test.ts`)
   - `CHANGELOG.md` - Recent changes

---

## 🎯 Common Scenarios

### Scenario 1: Adding a New Entity Field

**Context for AI**:
```
I need to add a new field 'metadata' to entities. Show me how to:
1. Validate the input (follow validateEntity pattern)
2. Prevent prototype pollution
3. Handle it in JSONL storage
4. Update tests
```

**Expected AI Approach**:
1. Add validation in `validateEntity` function
2. Check for prototype pollution in metadata keys
3. Ensure no newlines in metadata values
4. Add tests for validation

### Scenario 2: Creating a New Delete Function

**Context for AI**:
```
@codebase Show me the deleteEntities function.
I need to create deleteObservationsByType - make it O(n) not O(n²)
```

**Expected AI Approach**:
1. Use Set for O(1) lookups
2. Add input validation
3. Follow atomic save pattern
4. Add tests for performance

### Scenario 3: Adding Resource Limits

**Context for AI**:
```
Add a limit for maximum observation length per entity.
Follow the pattern from createEntities resource limit check.
```

**Expected AI Approach**:
1. Define constant (e.g., `MAX_OBSERVATION_LENGTH`)
2. Check limit before operation
3. Provide clear error message
4. Add test for limit enforcement

---

## ⚠️ Anti-Patterns to Avoid

### AI assistants should NEVER suggest:

```typescript
// ❌ NEVER: Direct prototype access
obj[userInput] = value

// ❌ NEVER: Newlines in JSONL strings
const entity = { name: userInput };  // If userInput contains \n

// ❌ NEVER: Unvalidated git parameters
repo.git.diff(userInput)

// ❌ NEVER: Array.includes in loops
arr.filter(item => otherArr.includes(item.id))

// ❌ NEVER: Direct file writes
fs.writeFile(path, content)  // Use atomic pattern

// ❌ NEVER: Path disclosure in errors
throw new Error(`Invalid path: ${path}`)

// ❌ NEVER: No resource limits
while (true) { addEntity(); }  // Check MAX_ENTITIES!
```

---

## 🔄 Keeping AI Assistants Updated

### When Code Changes

1. **Update this file** with new patterns
2. **Add comments** to new security-critical code
3. **Update tests** to demonstrate correct usage
4. **Reference in commits** for AI learning

### Learning from Commits

AI assistants learn from:
- Commit messages (be descriptive!)
- Code comments (explain WHY, not WHAT)
- Test names (describe expected behavior)
- Documentation (patterns and examples)

**Good Commit Message** (AI-friendly):
```
fix: Prevent prototype pollution in entity names

Added validation to block __proto__, constructor, and other dangerous
property names that could pollute Object.prototype and lead to RCE.

Uses FORBIDDEN_PROPERTY_NAMES Set for O(1) lookup.

Fixes: #123
```

**Bad Commit Message** (not AI-helpful):
```
fix stuff
```

---

## 📞 Getting Help

### For AI Assistants

When an AI assistant is uncertain:

1. **Copilot**: Add more context in comments
2. **Cursor**: Use @codebase to search for patterns
3. **Claude**: Provide file paths to reference implementations

### For Developers Using AI Assistants

1. **Always review** AI-generated code for security
2. **Run tests** after accepting suggestions
3. **Check documentation** for established patterns
4. **Verify** against security checklist above

---

## ✅ Quick Reference Card

**Copy this into your IDE as a comment block:**

```
/*
 * MCP SERVERS - AI CODING ASSISTANT QUICK REFERENCE
 *
 * SECURITY RULES (MUST FOLLOW):
 * 1. Validate ALL user input with validateAndSanitizeString()
 * 2. Use /[\x00-\x1F\x7F]/g to remove control chars (prevent JSONL injection)
 * 3. Block prototype pollution: __proto__, constructor, prototype
 * 4. Git params: no leading dashes (prevent --flag injection)
 * 5. Errors: no path disclosure (use generic messages)
 *
 * PERFORMANCE RULES (MUST FOLLOW):
 * 1. In loops: Set.has() not Array.includes()
 * 2. Multiple lookups: Map.get() not Array.find()
 * 3. Target: O(n) or better, never O(n²)
 *
 * DATA INTEGRITY RULES (MUST FOLLOW):
 * 1. File writes: temp-file-then-rename (atomic)
 * 2. Resource limits: check before operations
 * 3. Cleanup: try/finally for temp files
 *
 * REFERENCE IMPLEMENTATIONS:
 * - Input validation: src/memory/index.ts:143-171
 * - Performance: src/memory/index.ts:307-367
 * - Atomic writes: src/memory/index.ts:191-230
 *
 * TESTS MUST PASS: npm test (197 tests)
 */
```

---

**Document Version**: 1.0
**Compatible With**: GitHub Copilot Pro, Cursor AI, Claude Code, Codeium, Tabnine
**Last Verified**: 2025-11-10
**Status**: ✅ Production Ready
