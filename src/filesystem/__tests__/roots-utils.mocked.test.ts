import { describe, it, expect, vi } from 'vitest';
import path from 'path';

describe('getValidRootDirectories (mocked fs.promises)', () => {
  it('keeps root when realpath throws ENOENT but stat shows it exists', async () => {
    vi.resetModules();

    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';

    const realpath = vi.fn(async () => {
      throw enoent;
    });
    const stat = vi.fn(async () => ({
      isDirectory: () => true,
    }));

    vi.doMock('fs', () => ({
      promises: { realpath, stat },
    }));

    const { getValidRootDirectories } = await import('../roots-utils.js');

    // The key behavior under test: realpath() fails with ENOENT even though stat succeeds.
    // Use a POSIX absolute path so the test is platform-independent.
    const roots = [{ uri: '/mapped/project', name: 'mapped root' }];
    const result = await getValidRootDirectories(roots as any);

    expect(result).toEqual([path.resolve('/mapped/project')]);
    expect(realpath).toHaveBeenCalledTimes(1);
    expect(stat).toHaveBeenCalledTimes(1);
  });
});

