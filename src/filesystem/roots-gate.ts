/**
 * Promise-based readiness gate that blocks tool handlers until roots/directories
 * are initialized. Prevents race conditions where tool calls arrive before
 * oninitialized has finished loading roots.
 */

export interface RootsGate {
  promise: Promise<void>;
  resolve: () => void;
  waitForReady: () => Promise<void>;
}

export function createRootsGate(timeoutMs: number = 10000): RootsGate {
  let resolve: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  function waitForReady(): Promise<void> {
    return Promise.race([
      promise,
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Roots initialization timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  return {
    promise,
    resolve: resolve!,
    waitForReady,
  };
}
