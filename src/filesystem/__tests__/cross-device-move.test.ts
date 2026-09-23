import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { moveFile } from '../lib.js';

describe.skipIf(process.platform === 'win32')('moveFile cross-device fallback', () => {
  let testDirectory: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (testDirectory) {
      await fs.rm(testDirectory, { recursive: true, force: true });
      testDirectory = undefined;
    }
  });

  function simulateCrossDeviceRename() {
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device link'), { code: 'EXDEV' }),
      )
      .mockImplementation(rename);
  }

  it('preserves relative symbolic links', async () => {
    testDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mcp-cross-device-symlink-'),
    );
    const source = path.join(testDirectory, 'source');
    const destination = path.join(testDirectory, 'destination');
    await fs.mkdir(source, { mode: 0o751 });
    await fs.writeFile(path.join(source, 'target.txt'), 'payload', {
      mode: 0o640,
    });
    await fs.symlink('target.txt', path.join(source, 'link.txt'));
    simulateCrossDeviceRename();

    await moveFile(source, destination);

    await expect(fs.readlink(path.join(destination, 'link.txt'))).resolves.toBe(
      'target.txt',
    );
    await expect(
      fs.readFile(path.join(destination, 'link.txt'), 'utf8'),
    ).resolves.toBe('payload');
    expect((await fs.stat(destination)).mode & 0o777).toBe(0o751);
    expect(
      (await fs.stat(path.join(destination, 'target.txt'))).mode & 0o777,
    ).toBe(0o640);
    await expect(fs.access(source)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not expose a partial destination when copying fails', async () => {
    testDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mcp-cross-device-failure-'),
    );
    const source = path.join(testDirectory, 'source');
    const destination = path.join(testDirectory, 'destination');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'copied-first.txt'), 'payload');

    const socketServer = net.createServer();
    await new Promise<void>((resolve, reject) => {
      socketServer.once('error', reject);
      socketServer.listen(path.join(source, 'unsupported.sock'), resolve);
    });
    simulateCrossDeviceRename();

    try {
      await expect(moveFile(source, destination)).rejects.toMatchObject({
        code: 'ERR_FS_CP_SOCKET',
      });
    } finally {
      await new Promise<void>((resolve) => socketServer.close(() => resolve()));
    }

    await expect(fs.access(source)).resolves.toBeUndefined();
    await expect(fs.access(destination)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await fs.readdir(testDirectory)).sort()).toEqual(['source']);
  });
});
