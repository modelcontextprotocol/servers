# Plan: 5 Robustness Improvements (Round 2)

## Context

After a thorough code review of the current state (including the 5 fixes just landed), 5 new concrete robustness issues were identified. Each has a real bug or data-integrity impact. All fixes are backward-compatible, focused, and tested.

## Implementation Order

1. **Post-sanitization empty check** (self-contained, lib.ts + security-service.ts)
2. **UCB1 NaN/Infinity guard** (self-contained, mcts.ts)
3. **Config cross-validation** (self-contained, config.ts)
4. **Ordered container destroy** (cross-cutting, container.ts)
5. **Thought reference validation** (lib.ts business-logic layer)

---

## Fix 1: Post-Sanitization Empty Check

**Problem:** `security-service.ts:72-79` `sanitizeContent()` can strip all content from a thought. For example, `<script>alert('xss')</script>` becomes `""` after sanitization. This empty string passes through `buildThoughtData()` and `storage.addThought()` unchecked, creating an empty thought in history.

**File:** `lib.ts` — in `processWithServices()`, after the sanitize call (line ~154):

**Change:** Add a post-sanitization empty check:
```typescript
security.validateThought(input.thought, sessionId);
const sanitized = security.sanitizeContent(input.thought);
if (sanitized.trim().length === 0) {
  throw new ValidationError('Thought is empty after content sanitization');
}
```

**Tests in `__tests__/integration/server.test.ts`:** new test in `Security` describe:
- `'should reject thought that becomes empty after sanitization'` — input `<script>alert(1)</script>` → expect `isError: true`, `VALIDATION_ERROR`
- `'should reject thought that becomes whitespace-only after sanitization'` — input with only sanitizable content + spaces → expect error

---

## Fix 2: UCB1 NaN/Infinity Guard

**Problem:** `mcts.ts:17-21` — `computeUCB1()` computes `Math.log(parentVisits)`. When `parentVisits` is 0 (possible when `suggestNext()` is called on a tree where all nodes have `visitCount === 0`), `Math.log(0)` returns `-Infinity`, and `Math.sqrt(-Infinity)` returns `NaN`. This NaN propagates into `ucb1Score` in suggestion results, breaking JSON serialization and downstream comparisons.

Additionally, `suggestNext()` at line 49 computes `totalVisits` via `Math.max(1, ...)`, but this is the *sum* of all expandable nodes' visits — it can still be 0 if all nodes are unexplored (the `Math.max` catches this). However the `computeUCB1` method is a public API that can be called independently. The guard should be in the method itself.

**File:** `mcts.ts` — in `computeUCB1()`:

**Change:**
```typescript
computeUCB1(nodeVisits: number, nodeValue: number, parentVisits: number, C: number): number {
  if (nodeVisits === 0) return Infinity;
  if (parentVisits <= 0) return nodeValue / nodeVisits; // exploitation only, no exploration term
  const exploitation = nodeValue / nodeVisits;
  const exploration = C * Math.sqrt(Math.log(parentVisits) / nodeVisits);
  return exploitation + exploration;
}
```

**Tests in `__tests__/unit/mcts.test.ts`:** new tests in appropriate describe:
- `'should return exploitation-only score when parentVisits is 0'` — `computeUCB1(2, 1.0, 0, Math.SQRT2)` → `0.5` (no NaN)
- `'should return Infinity for unvisited node regardless of parentVisits'` — `computeUCB1(0, 0, 0, Math.SQRT2)` → `Infinity`
- `'should not produce NaN for any edge case inputs'` — test several boundary combinations, assert `!Number.isNaN(result)`

---

## Fix 3: Config Cross-Validation

**Problem:** `config.ts:120-168` validates individual config sections but never checks relationships between them. Three specific gaps:

1. **`maxThoughtsPerBranch > maxHistorySize`**: Configuration allows branch limit 10000 but history limit 100, meaning branches can never actually reach their limit since history evicts first. Misleading.
2. **Health thresholds unvalidated**: `maxMemoryPercent`, `maxStoragePercent` etc. are never validated — values like 200% or -1 are silently accepted.
3. **`explorationConstant === 0`**: Allowed by current validation (`>= 0`), but this makes the UCB1 exploration term always 0, effectively disabling exploration. Should warn or reject.

**File:** `config.ts` — in `validate()`:

**Change:** Add `validateMonitoring()` and `validateCrossConstraints()`:
```typescript
static validate(config: AppConfig): void {
  this.validateState(config.state);
  this.validateSecurity(config.security);
  this.validateMcts(config.mcts);
  this.validateMonitoring(config.monitoring);
  this.validateCrossConstraints(config);
}

private static validateMonitoring(monitoring: AppConfig['monitoring']): void {
  const t = monitoring.healthThresholds;
  if (t.maxMemoryPercent < 1 || t.maxMemoryPercent > 100) {
    throw new Error('HEALTH_MAX_MEMORY must be between 1 and 100');
  }
  if (t.maxStoragePercent < 1 || t.maxStoragePercent > 100) {
    throw new Error('HEALTH_MAX_STORAGE must be between 1 and 100');
  }
  if (t.maxResponseTimeMs < 1) {
    throw new Error('HEALTH_MAX_RESPONSE_TIME must be >= 1');
  }
  if (t.errorRateDegraded < 0 || t.errorRateDegraded > 100) {
    throw new Error('HEALTH_ERROR_RATE_DEGRADED must be between 0 and 100');
  }
  if (t.errorRateUnhealthy < 0 || t.errorRateUnhealthy > 100) {
    throw new Error('HEALTH_ERROR_RATE_UNHEALTHY must be between 0 and 100');
  }
  if (t.errorRateDegraded >= t.errorRateUnhealthy) {
    throw new Error('HEALTH_ERROR_RATE_DEGRADED must be less than HEALTH_ERROR_RATE_UNHEALTHY');
  }
}

private static validateCrossConstraints(config: AppConfig): void {
  if (config.state.maxThoughtsPerBranch > config.state.maxHistorySize) {
    throw new Error(
      `maxThoughtsPerBranch (${config.state.maxThoughtsPerBranch}) must not exceed maxHistorySize (${config.state.maxHistorySize})`
    );
  }
  if (config.mcts.explorationConstant === 0) {
    throw new Error('MCTS_EXPLORATION_CONSTANT must be > 0 (zero disables exploration entirely)');
  }
}
```

**Tests in `__tests__/unit/config.test.ts`:** new describe blocks:
- `'validateMonitoring'`: reject maxMemoryPercent=0, maxMemoryPercent=101, maxStoragePercent=-1, errorRateDegraded >= errorRateUnhealthy
- `'validateCrossConstraints'`: reject maxThoughtsPerBranch > maxHistorySize, reject explorationConstant=0
- Positive tests: valid configs pass

---

## Fix 4: Ordered Container Destroy

**Problem:** `container.ts:52-69` — `SimpleContainer.destroy()` iterates `this.instances` using `Map` iteration order (insertion order). Services are lazily instantiated, so the order depends on which services were first accessed. If `metrics` (which depends on `storage`) was instantiated first, `storage.destroy()` could fire before `metrics.destroy()`, causing `metrics` to reference a destroyed storage.

**File:** `container.ts` — in `SimpleContainer`:

**Change:** Add a declared destroy order:
```typescript
export class SimpleContainer implements ServiceContainer {
  private readonly services = new Map<string, () => unknown>();
  private readonly instances = new Map<string, unknown>();
  private destroyed = false;

  // Services should be destroyed in reverse-dependency order
  private static readonly DESTROY_ORDER = [
    'healthChecker',    // depends on metrics, storage, security
    'metrics',          // depends on storage, sessionTracker
    'thoughtTreeManager', // depends on sessionTracker (via eviction)
    'security',         // depends on sessionTracker
    'storage',          // depends on sessionTracker
    'formatter',        // no deps
    'logger',           // no deps
    'config',           // no deps
    'sessionTracker',   // no deps (destroyed separately by app)
  ];

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Destroy in declared order first
    for (const key of SimpleContainer.DESTROY_ORDER) {
      this.destroyInstance(key);
    }
    // Destroy any remaining instances not in the order list
    for (const key of this.instances.keys()) {
      this.destroyInstance(key);
    }
    this.instances.clear();
    this.services.clear();
  }

  private destroyInstance(key: string): void {
    const instance = this.instances.get(key);
    if (!instance) return;
    this.instances.delete(key);
    const obj = instance as Record<string, unknown>;
    if (obj && typeof obj.destroy === 'function') {
      try {
        (obj.destroy as () => void)();
      } catch (error) {
        console.error(`Error destroying service '${key}':`, error);
      }
    }
  }
}
```

**Tests in `__tests__/unit/container.test.ts`:** new describe:
- `'should destroy services in dependency order'` — register 3 mock services with destroy() that records call order; verify order matches DESTROY_ORDER
- `'should handle services not in DESTROY_ORDER gracefully'` — register unknown service, verify it still gets destroyed
- `'should not fail if a service throws during ordered destroy'` — one service throws in destroy(), verify others still get destroyed

---

## Fix 5: Thought Reference Validation

**Problem:** `lib.ts:65-78` — `validateBusinessLogic()` checks that `isRevision` has a `revisesThought` value and `branchFromThought` has a `branchId`. But it never validates that `revisesThought` or `branchFromThought` are *reasonable*. A client can send `revisesThought: 999` when only 2 thoughts have been submitted. The code silently produces a response without `revisionContext` (since no matching thought is found), which is confusing.

Similarly, `branchFromThought` is not validated against actual thought numbers.

**File:** `lib.ts` — in `validateBusinessLogic()`:

**Change:** Add bounds-checking against `thoughtNumber`:
```typescript
private validateBusinessLogic(input: ProcessThoughtRequest): void {
  if (input.isRevision && !input.revisesThought) {
    throw new BusinessLogicError(
      'isRevision requires revisesThought to be specified',
    );
  }
  if (input.isRevision && input.revisesThought && input.revisesThought >= input.thoughtNumber) {
    throw new BusinessLogicError(
      `revisesThought (${input.revisesThought}) must be less than current thoughtNumber (${input.thoughtNumber})`,
    );
  }
  if (input.branchFromThought && !input.branchId) {
    throw new BusinessLogicError(
      'branchFromThought requires branchId to be specified',
    );
  }
  if (input.branchFromThought && input.branchFromThought >= input.thoughtNumber) {
    throw new BusinessLogicError(
      `branchFromThought (${input.branchFromThought}) must be less than current thoughtNumber (${input.thoughtNumber})`,
    );
  }
}
```

**Tests in `__tests__/integration/server.test.ts`:** new describe `'Thought Reference Bounds Validation'`:
- `'should reject revisesThought >= thoughtNumber'` — `revisesThought: 3, thoughtNumber: 2` → `BUSINESS_LOGIC_ERROR`
- `'should reject revisesThought equal to thoughtNumber'` — `revisesThought: 1, thoughtNumber: 1` → `BUSINESS_LOGIC_ERROR`
- `'should reject branchFromThought >= thoughtNumber'` — `branchFromThought: 5, thoughtNumber: 3` → `BUSINESS_LOGIC_ERROR`
- `'should accept valid revisesThought < thoughtNumber'` — `revisesThought: 1, thoughtNumber: 2` → success
- `'should accept valid branchFromThought < thoughtNumber'` — `branchFromThought: 1, thoughtNumber: 2` → success

---

## Files Modified Summary

| File | Fixes |
|------|-------|
| `lib.ts` | #1, #5 |
| `mcts.ts` | #2 |
| `config.ts` | #3 |
| `container.ts` | #4 |
| `__tests__/integration/server.test.ts` | #1, #5 |
| `__tests__/unit/mcts.test.ts` | #2 |
| `__tests__/unit/config.test.ts` | #3 |
| `__tests__/unit/container.test.ts` | #4 |

## Verification

```bash
npx tsc --noEmit        # 0 errors
npm run build           # clean
npx vitest run          # all tests pass
```
