import { vi } from 'vitest';

const identity = (str: string) => str;

vi.mock('chalk', () => ({
  default: {
    yellow: identity,
    green: identity,
    blue: identity,
    gray: identity,
    cyan: identity,
    red: identity,
  },
}));
