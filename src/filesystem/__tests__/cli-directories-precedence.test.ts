import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const SERVER_PATH = path.join(__dirname, '..', 'dist', 'index.js');

/**
 * Sends a JSON-RPC message to the server via stdin (newline-delimited JSON).
 */
function sendMessage(proc: ChildProcess, message: object): void {
  proc.stdin!.write(JSON.stringify(message) + '\n');
}

/**
 * Reads newline-delimited JSON-RPC messages from the server stdout,
 * collecting them until a message matching the predicate arrives or timeout is reached.
 */
function waitForMessage(
  proc: ChildProcess,
  predicate: (msg: any) => boolean,
  timeoutMs = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for message'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      proc.stdout!.removeListener('data', onData);
    }

    function onData(chunk: Buffer) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (predicate(msg)) {
            cleanup();
            resolve(msg);
            return;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    proc.stdout!.on('data', onData);
  });
}

/**
 * Spawns the filesystem server as a child process with the given CLI args,
 * performs the MCP initialize handshake, and returns the process.
 */
async function startServer(
  cliArgs: string[],
  clientCapabilities: Record<string, any> = {}
): Promise<{ proc: ChildProcess; stderr: string[] }> {
  const stderrLines: string[] = [];
  const proc = spawn('node', [SERVER_PATH, ...cliArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stderr!.on('data', (data) => {
    stderrLines.push(data.toString());
  });

  // Send initialize request
  sendMessage(proc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: clientCapabilities,
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  });

  // Wait for initialize response
  await waitForMessage(proc, (msg) => msg.id === 1);

  // Send initialized notification
  sendMessage(proc, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });

  // Give the server a moment to process oninitialized
  await new Promise((resolve) => setTimeout(resolve, 300));

  return { proc, stderr: stderrLines };
}

function killProc(proc: ChildProcess): void {
  proc.stdin!.end();
  proc.kill('SIGTERM');
}

describe('CLI directories precedence over MCP roots', () => {
  let testDir: string;
  let cliDir: string;
  let cliDir2: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-cli-prec-test-'));
    cliDir = path.join(testDir, 'cli-dir');
    cliDir2 = path.join(testDir, 'cli-dir-2');
    await fs.mkdir(cliDir, { recursive: true });
    await fs.mkdir(cliDir2, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should ignore MCP roots on initialization when CLI directories are provided', async () => {
    const { proc, stderr } = await startServer([cliDir], {
      roots: { listChanged: true },
    });

    try {
      const stderrText = stderr.join('');
      expect(stderrText).toContain('CLI directories provided, ignoring MCP roots');

      // Verify allowed directories are still the CLI-provided ones
      sendMessage(proc, {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'list_allowed_directories',
          arguments: {},
        },
      });

      const response = await waitForMessage(proc, (msg) => msg.id === 10);
      const text = response.result?.content?.[0]?.text ?? '';
      const resolvedCliDir = await fs.realpath(cliDir);
      expect(text).toContain(resolvedCliDir);
    } finally {
      killProc(proc);
    }
  });

  it('should ignore roots/list_changed notifications when CLI directories are provided', async () => {
    const { proc, stderr } = await startServer([cliDir], {
      roots: { listChanged: true },
    });

    try {
      // Send a roots/list_changed notification
      sendMessage(proc, {
        jsonrpc: '2.0',
        method: 'notifications/roots/list_changed',
      });

      // Give the server time to process the notification
      await new Promise((resolve) => setTimeout(resolve, 300));

      const stderrText = stderr.join('');
      expect(stderrText).toContain('Ignoring roots update: CLI directories take precedence');

      // Verify allowed directories are still the CLI-provided ones
      sendMessage(proc, {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'list_allowed_directories',
          arguments: {},
        },
      });

      const response = await waitForMessage(proc, (msg) => msg.id === 20);
      const text = response.result?.content?.[0]?.text ?? '';
      const resolvedCliDir = await fs.realpath(cliDir);
      expect(text).toContain(resolvedCliDir);
    } finally {
      killProc(proc);
    }
  });

  it('should use MCP roots when no CLI directories are provided (backward compat)', async () => {
    const stderrLines: string[] = [];
    const proc = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stderr!.on('data', (data) => {
      stderrLines.push(data.toString());
    });

    try {
      // Send initialize with roots capability
      sendMessage(proc, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

      await waitForMessage(proc, (msg) => msg.id === 1);

      // Send initialized notification -- this triggers oninitialized which
      // calls roots/list since the client advertised roots capability
      sendMessage(proc, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // The server will send a roots/list request; respond to it
      const rootsRequest = await waitForMessage(
        proc,
        (msg) => msg.method === 'roots/list',
        3000
      );

      const resolvedCliDir = await fs.realpath(cliDir);

      // Respond with roots pointing to our test directory
      sendMessage(proc, {
        jsonrpc: '2.0',
        id: rootsRequest.id,
        result: {
          roots: [{ uri: `file://${resolvedCliDir}`, name: 'Test Root' }],
        },
      });

      // Wait for server to process roots
      await new Promise((resolve) => setTimeout(resolve, 500));

      const stderrText = stderrLines.join('');
      expect(stderrText).toContain('Updated allowed directories from MCP roots');
      expect(stderrText).not.toContain('CLI directories provided');

      // Verify allowed directories now include the MCP root
      sendMessage(proc, {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'list_allowed_directories',
          arguments: {},
        },
      });

      const response = await waitForMessage(proc, (msg) => msg.id === 30);
      const text = response.result?.content?.[0]?.text ?? '';
      expect(text).toContain(resolvedCliDir);
    } finally {
      proc.stdin!.end();
      proc.kill('SIGTERM');
    }
  });
});
