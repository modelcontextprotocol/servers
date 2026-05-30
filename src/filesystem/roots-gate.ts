/**
 * Promise-based readiness gate that blocks tool handlers until roots/directories
 * are initialized. Prevents race conditions where tool calls arrive before
 * oninitialized has finished loading roots.
 */

export interface RootsGate {
  resolve: () => void;
  waitForReady: () => Promise<void>;
}

export function createRootsGate(timeoutMs: number = 10000): RootsGate {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  function waitForReady(): Promise<void> {
    return new Promise<void>((resolveWait, rejectWait) => {
      const timer = setTimeout(() => {
        rejectWait(new Error(`Roots initialization timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise.then(
        () => {
          clearTimeout(timer);
          resolveWait();
        },
        (error) => {
          clearTimeout(timer);
          rejectWait(error);
        }
      );
    });
  }

  return {
    resolve,
    waitForReady,
  };
}
