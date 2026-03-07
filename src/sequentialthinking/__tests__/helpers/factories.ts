import type { ProcessThoughtRequest } from '../../lib.js';
import type { ThoughtData } from '../../interfaces.js';

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

export function createTestThoughtData(
  overrides?: Partial<ThoughtData>,
): ThoughtData {
  return {
    thought: 'Test thought',
    thoughtNumber: 1,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    sessionId: 'test-session',
    ...overrides,
  };
}
