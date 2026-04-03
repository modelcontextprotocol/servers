import { describe, it, expect } from 'vitest';
import { createRootsGate } from '../roots-gate.js';

describe('createRootsGate', () => {
  it('resolves immediately when gate is pre-resolved', async () => {
    const gate = createRootsGate();
    gate.resolve();
    await expect(gate.waitForReady()).resolves.toBeUndefined();
  });

  it('resolves after a delay when resolve is called later', async () => {
    const gate = createRootsGate();
    setTimeout(() => gate.resolve(), 50);
    await expect(gate.waitForReady()).resolves.toBeUndefined();
  });

  it('rejects with timeout when gate is never resolved', async () => {
    const gate = createRootsGate(100);
    await expect(gate.waitForReady()).rejects.toThrow(
      'Roots initialization timed out after 100ms'
    );
  });

  it('resolves all concurrent waiters together', async () => {
    const gate = createRootsGate();
    const results = Promise.all([
      gate.waitForReady(),
      gate.waitForReady(),
      gate.waitForReady(),
    ]);
    gate.resolve();
    await expect(results).resolves.toEqual([undefined, undefined, undefined]);
  });
});
