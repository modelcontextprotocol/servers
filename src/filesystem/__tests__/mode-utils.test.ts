import { describe, it, expect } from 'vitest';
import { resolveReadOnlyMode, renderUsage } from '../mode-utils';

describe('resolveReadOnlyMode', () => {
  it('errors when both read-only and write-enabled flags are set', () => {
    const result = resolveReadOnlyMode(['--read-only', '--write-enabled'], {});
    expect(result.error).toBeDefined();
  });

  it('warns on invalid env values and falls back to defaults', () => {
    const result = resolveReadOnlyMode([], { READ_ONLY: 'maybe', DEFAULT_READ_ONLY: 'sure' } as any);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.isReadOnly).toBe(false); // falls back to default false when env invalid
  });

  it('applies precedence: write-enabled beats default read-only', () => {
    const result = resolveReadOnlyMode(['--write-enabled'], { DEFAULT_READ_ONLY: '1' } as any);
    expect(result.isReadOnly).toBe(false);
  });

  it('uses READ_ONLY env before DEFAULT_READ_ONLY', () => {
    const result = resolveReadOnlyMode([], { READ_ONLY: '0', DEFAULT_READ_ONLY: '1' } as any);
    expect(result.isReadOnly).toBe(false);
  });

  it('handles directory names after -- as literal paths', () => {
    const result = resolveReadOnlyMode(['--read-only', '--', '--looks-like-flag', '/data'], {});
    expect(result.directories).toEqual(['--looks-like-flag', '/data']);
    expect(result.isReadOnly).toBe(true);
  });

  it('honors help flag', () => {
    const result = resolveReadOnlyMode(['--help'], {});
    expect(result.helpRequested).toBe(true);
  });
});

describe('renderUsage', () => {
  it('mentions precedence order', () => {
    const text = renderUsage();
    expect(text.toLowerCase()).toContain('precedence');
    expect(text).toContain('--read-only');
    expect(text).toContain('--write-enabled');
  });
});
