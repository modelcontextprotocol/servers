import { expect } from 'vitest';
import type { ProcessThoughtRequest } from '../../lib.js';

export function createTestThought(
  overrides?: Partial<ProcessThoughtRequest>,
): ProcessThoughtRequest {
  return {
    thought: 'Test thought content',
    thoughtNumber: 1,
    totalThoughts: 3,
    nextThoughtNeeded: true,
    ...overrides,
  };
}

export function createSessionThoughtSequence(
  sessionId: string,
  count: number,
): ProcessThoughtRequest[] {
  return Array.from({ length: count }, (_, i) => ({
    thought: `Thought ${i + 1} for ${sessionId}`,
    thoughtNumber: i + 1,
    totalThoughts: count,
    nextThoughtNeeded: i < count - 1,
    sessionId,
  }));
}

export function expectErrorResponse(
  result: { content: Array<{ type: string; text: string }>; isError?: boolean },
  errorCode: string,
): void {
  expect(result.isError).toBe(true);
  const data = JSON.parse(result.content[0].text);
  expect(data.error).toBe(errorCode);
}
