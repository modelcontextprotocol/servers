import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('move_file tool', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    // Create a temp directory for testing
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-move-test-'));
    testDir = await fs.realpath(tmpDir);

    // Start the MCP server with testDir as allowed directory
    const serverPath = path.resolve(__dirname, '../dist/index.js');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath, testDir],
    });

    client = new Client(
      { name: 'move-file-test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should successfully move a file when destination does not exist', async () => {
    const sourcePath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'moved.txt');
    await fs.writeFile(sourcePath, 'hello world');

    const result = await client.callTool({
      name: 'move_file',
      arguments: {
        source: sourcePath,
        destination: destPath,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain(`Successfully moved ${sourcePath} to ${destPath}`);

    // Verify source no longer exists and dest has content
    await expect(fs.stat(sourcePath)).rejects.toThrow();
    const destContent = await fs.readFile(destPath, 'utf-8');
    expect(destContent).toBe('hello world');
  });

  it('should fail when destination file already exists and not overwrite it (issue #4628)', async () => {
    const sourcePath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'dest.txt');
    await fs.writeFile(sourcePath, 'original source content');
    await fs.writeFile(destPath, 'original destination content');

    const result = await client.callTool({
      name: 'move_file',
      arguments: {
        source: sourcePath,
        destination: destPath,
      },
    });

    // Tool should report error
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain(`Destination already exists: ${destPath}`);

    // Verify neither file was overwritten or removed
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    expect(sourceContent).toBe('original source content');

    const destContent = await fs.readFile(destPath, 'utf-8');
    expect(destContent).toBe('original destination content');
  });

  it('should fail when destination directory already exists', async () => {
    const sourcePath = path.join(testDir, 'source.txt');
    const destDir = path.join(testDir, 'dest_dir');
    await fs.writeFile(sourcePath, 'original source content');
    await fs.mkdir(destDir);

    const result = await client.callTool({
      name: 'move_file',
      arguments: {
        source: sourcePath,
        destination: destDir,
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain(`Destination already exists: ${destDir}`);

    // Verify source and dest_dir are intact
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    expect(sourceContent).toBe('original source content');
    const dirStat = await fs.stat(destDir);
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('should successfully move a directory when destination does not exist', async () => {
    const sourceDir = path.join(testDir, 'source_folder');
    const nestedFile = path.join(sourceDir, 'nested.txt');
    const destDir = path.join(testDir, 'dest_folder');

    await fs.mkdir(sourceDir);
    await fs.writeFile(nestedFile, 'nested file content');

    const result = await client.callTool({
      name: 'move_file',
      arguments: {
        source: sourceDir,
        destination: destDir,
      },
    });

    expect(result.isError).toBeFalsy();
    await expect(fs.stat(sourceDir)).rejects.toThrow();
    const destNestedContent = await fs.readFile(path.join(destDir, 'nested.txt'), 'utf-8');
    expect(destNestedContent).toBe('nested file content');
  });
});
