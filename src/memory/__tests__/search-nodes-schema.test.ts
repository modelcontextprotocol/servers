import { describe, it, expect } from 'vitest';
import { SearchNodesQuerySchema, SEARCH_QUERY_MAX_LENGTH } from '../index.js';

describe('search_nodes input schema', () => {
  it('should accept a normal query', () => {
    expect(SearchNodesQuerySchema.safeParse('Alice').success).toBe(true);
    expect(SearchNodesQuerySchema.safeParse('works at Acme Corp').success).toBe(true);
  });

  it('should accept a query at exactly the max length', () => {
    const atLimit = 'a'.repeat(SEARCH_QUERY_MAX_LENGTH);
    expect(SearchNodesQuerySchema.safeParse(atLimit).success).toBe(true);
  });

  it('should reject a query longer than the max length', () => {
    const oversized = 'a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1);
    const result = SearchNodesQuerySchema.safeParse(oversized);
    expect(result.success).toBe(false);
  });

  it('should still reject non-string input', () => {
    expect(SearchNodesQuerySchema.safeParse(42).success).toBe(false);
    expect(SearchNodesQuerySchema.safeParse(null).success).toBe(false);
  });
});
