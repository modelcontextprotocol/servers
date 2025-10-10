# Sequential Thinking MCP Server - Schema Fix Explanation

## Problem Statement

The sequential thinking MCP server was experiencing errors when LLMs passed numeric parameters as strings instead of numbers:

```
Error: Invalid thoughtNumber: must be a number
```

This occurred even though the string values were semantically valid (e.g., `"1"`, `"2"`, `"3"`).

## Root Cause Analysis

The issue had **two distinct layers**:

### Layer 1: Overly Strict Schema (Client-Side)
The original schema defined numeric parameters as:
```typescript
thoughtNumber: {
  type: "integer",
  minimum: 1
}
```

**Problem**: Some MCP clients perform schema validation **before** sending requests to the server. When an LLM mistakenly sent `thoughtNumber: "1"` (string) instead of `thoughtNumber: 1` (number), these clients would reject the request entirely, making the tool unusable.

### Layer 2: Missing Input Sanitization (Server-Side)
Even when strings reached the server (clients without strict validation), the validation code immediately rejected them:
```typescript
if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
  throw new Error('Invalid thoughtNumber: must be a number');
}
```

**Problem**: No attempt was made to coerce valid string numbers to actual numbers before validation.

## The Complete Solution: Three-Layer Defense

### Layer 1: Permissive Schema (Client-Side Flexibility)
```typescript
thoughtNumber: {
  oneOf: [
    { type: "integer", minimum: 1 },
    { type: "string", pattern: "^[1-9]\\d*$" }
  ],
  description: "Current thought number (numeric value, e.g., 1, 2, 3)"
}
```

**Purpose**:
- ✅ Allows LLM mistakes - If the LLM sends `"1"` instead of `1`, don't reject it
- ✅ Passes client validation - Smart clients won't block the request
- ✅ Documents flexibility - Shows both types are acceptable
- ✅ Prevents tool unavailability - Tool remains usable even with imperfect LLM output

### Layer 2: Input Sanitization (Server-Side Coercion)
```typescript
private sanitizeNumericParam(value: unknown): unknown {
  // INPUT SANITIZATION: Coerce string numbers to actual numbers
  // WHY: Some MCP clients may pass numeric parameters as strings
  // EXPECTED: Convert valid numeric strings to numbers before validation
  if (typeof value === 'number') {
    return value;  // Already a number
  }
  // Regex matches positive integers starting from 1 (excludes 0)
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;  // Coerced to number
    }
  }
  return value;  // Return as-is, let validation fail with clear error
}
```

**Purpose**:
- ✅ Coerces valid strings to numbers - `"1"` → `1`
- ✅ Handles client variations - Works regardless of client behavior
- ✅ Defense in depth - Never trust client input
- ✅ Graceful handling - Converts when possible, fails clearly when not

### Layer 3: Strict Validation (Server-Side Enforcement)
```typescript
// Sanitize numeric parameters before validation
if (data.thoughtNumber !== undefined) {
  data.thoughtNumber = this.sanitizeNumericParam(data.thoughtNumber);
}

// Now validate - after sanitization, we require actual numbers
if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
  throw new Error('Invalid thoughtNumber: must be a number');
}
```

**Purpose**:
- ✅ Final enforcement - After sanitization, require actual number
- ✅ Clear error messages - If sanitization couldn't convert, fail explicitly
- ✅ Type safety - Guarantees downstream code gets correct type

## Why Both Schema AND Sanitization Are Required

### Without `oneOf` (Old Schema)
```
LLM sends "1" → Client schema validation (type: integer) → ❌ REJECTED
Tool becomes unusable due to LLM imperfection
```

### With `oneOf` But No Sanitization
```
LLM sends "1" → Client schema validation (oneOf) → ✅ PASSES
                → Server validation (typeof !== 'number') → ❌ REJECTED
Tool fails at server level
```

### With Both `oneOf` AND Sanitization (Complete Fix)
```
LLM sends "1" → Client schema validation (oneOf) → ✅ PASSES
                → Server sanitization → "1" becomes 1
                → Server validation → ✅ PASSES
Tool works correctly!
```

## Real-World Scenarios

| Input | Old Schema | New Schema + Sanitization |
|-------|-----------|---------------------------|
| `1` (correct type) | ✅ Works | ✅ Works |
| `"1"` (wrong type, valid value) | ❌ Client blocks | ✅ Client passes → Server fixes |
| `"0"` (invalid value) | ❌ Client blocks | ❌ Server rejects (sanitization returns as-is) |
| `"abc"` (garbage) | ❌ Client blocks | ❌ Server rejects (sanitization returns as-is) |
| `-1` (negative) | ❌ Schema rejects | ❌ Schema rejects |

## Key Insight: Schema as Client-Side Contract

**The schema isn't just about what the server accepts - it's about preventing overly strict client-side validation from making the tool unusable when the LLM makes minor type mistakes.**

According to the MCP specification:
- **Servers** are responsible for validating tool inputs
- **Clients SHOULD** validate (but it's optional, not required)
- **The schema is primarily for documentation and LLM guidance**

The MCP SDK does **not** enforce server-side schema validation. The schema tells clients what to send, but the server must still validate because clients might not respect it.

## Implementation Details

### Files Modified
1. **index.ts** (lines 34-50): Added `sanitizeNumericParam()` method
2. **index.ts** (lines 52-67): Updated `validateThoughtData()` to sanitize before validating
3. **index.ts** (lines 241-272): Updated schema to use `oneOf` for all numeric parameters

### Parameters Updated
All numeric parameters now accept both integers and strings:
- `thoughtNumber`
- `totalThoughts`
- `revisesThought`
- `branchFromThought`

### Pattern Used
```typescript
oneOf: [
  { type: "integer", minimum: 1 },
  { type: "string", pattern: "^[1-9]\\d*$" }
]
```

**Why this pattern?**
- `minimum: 1` - Thought numbers are 1-indexed (1, 2, 3, ...)
- `pattern: "^[1-9]\\d*$"` - Matches positive integers starting from 1, excludes 0 and negative numbers
- Semantic consistency - Both schema and sanitization enforce the same rules

## Design Philosophy

This fix exemplifies robust API design:

1. **Be liberal in what you accept** (schema: `oneOf`)
2. **Be strict in what you produce** (sanitization + validation)
3. **Prioritize availability** (don't let minor LLM mistakes break tools)
4. **Maintain correctness** (still reject truly invalid input)

The schema says "we're flexible," the sanitization says "we'll help you," and the validation says "but we still have standards."

## Testing

### Manual Testing
```typescript
// Test 1: Number (always worked)
thoughtNumber: 1  // ✅ PASS

// Test 2: String (now works)
thoughtNumber: "2"  // ✅ PASS (sanitized to 2)

// Test 3: Invalid string (correctly rejected)
thoughtNumber: "0"  // ❌ FAIL (sanitization returns as-is, validation rejects)

// Test 4: Garbage (correctly rejected)
thoughtNumber: "abc"  // ❌ FAIL (sanitization returns as-is, validation rejects)
```

### Build Verification
```bash
npm run build  # Compiles TypeScript to JavaScript
grep -A 10 "oneOf" dist/index.js  # Verify schema in built file
```

## Commits

1. **240221c**: Initial regex fix for thought number validation
2. **5de32a7**: Added input sanitization for numeric parameters
3. **58a9988**: Updated schema to accept string or number using `oneOf`

## References

- [MCP Tools Specification](https://modelcontextprotocol.io/docs/concepts/tools)
- [JSON Schema oneOf](https://json-schema.org/understanding-json-schema/reference/combining#oneof)
- Original issue: LLMs passing numeric parameters as strings

## Conclusion

This fix ensures the sequential thinking MCP server is robust, user-friendly, and resilient to common LLM output variations. By accepting both types in the schema and sanitizing on the server, we maintain tool availability while ensuring correctness.

