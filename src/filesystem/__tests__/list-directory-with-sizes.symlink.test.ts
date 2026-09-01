import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Regression test: list_directory_with_sizes must not follow a symlink that points
// outside the allowed directories (it previously used fs.stat and leaked the target's
// size/mtime). Place under src/filesystem/__tests__/ and run after `npm run build`.
describe('list_directory_with_sizes symlink confinement', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let allowedDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    allowedDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-allowed-')));
    outsideDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-outside-')));

    // A distinctively large file OUTSIDE the sandbox (1 MiB -> "1.00 MB" via formatSize).
    await fs.writeFile(path.join(outsideDir, 'secret.bin'), Buffer.alloc(1024 * 1024));
    // A symlink INSIDE the allowed dir pointing at it.
    await fs.symlink(path.join(outsideDir, 'secret.bin'), path.join(allowedDir, 'leak_link'));
    await fs.writeFile(path.join(allowedDir, 'normal.txt'), 'hello');

    const serverPath = path.resolve(__dirname, '../dist/index.js');
    transport = new StdioClientTransport({ command: 'node', args: [serverPath, allowedDir] });
    client = new Client({ name: 'list-sizes-symlink-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
    await fs.rm(allowedDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it('does not report the out-of-sandbox target size for a symlink', async () => {
    const result = await client.callTool({
      name: 'list_directory_with_sizes',
      arguments: { path: allowedDir },
    });
    const text = (result.structuredContent as { content: string }).content;

    // The link is still listed...
    expect(text).toContain('leak_link');
    // ...but its target's size must not leak. With fs.stat it showed "1.00 MB";
    // with fs.lstat it shows the link's own (tiny) size.
    expect(text).not.toContain('MB');
  });
});
