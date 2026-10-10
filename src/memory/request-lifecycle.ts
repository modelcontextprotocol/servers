// Outcome labels for memory mutations. `NOT_COMMITTED` means the graph file
// was definitely not replaced (retry is safe); `COMMIT_UNKNOWN` means the
// replacement was dispatched and its result is unknown (read before retrying).

const DIAGNOSTIC_ERRNOS = new Set(['ENOSPC', 'EACCES', 'EPERM', 'EIO']);

export class MemoryRequestError extends Error {
  constructor(
    readonly state: 'NOT_COMMITTED' | 'COMMIT_UNKNOWN',
    message: string,
    options?: ErrorOptions,
  ) {
    const code = (options?.cause as { code?: unknown } | undefined)?.code;
    super(`${state}: ${message}${typeof code === 'string' && DIAGNOSTIC_ERRNOS.has(code) ? ` (${code})` : ''}`, options);
    this.name = 'MemoryRequestError';
  }
}

// Below the TypeScript SDK's 60s client default, so clients need no timeout
// configuration; see the README's "Request lifetime" section.
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const MAX_TIMER_MS = 2 ** 31 - 1;

export function validateLimit(value: number, name: string, max = MAX_TIMER_MS): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return value;
}

export function parseRequestTimeout(value: string | undefined): number {
  if (value === undefined) return DEFAULT_REQUEST_TIMEOUT_MS;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid MEMORY_REQUEST_TIMEOUT_MS: ${value}`);
  return validateLimit(Number(value), 'MEMORY_REQUEST_TIMEOUT_MS');
}
