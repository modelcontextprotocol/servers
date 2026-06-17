import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const SERVER_PATH = path.join(__dirname, '..', 'dist', 'index.js');

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Minimal stdio JSON-RPC client for tests. Spawns the filesystem server
 * and exchanges line-delimited JSON messages over stdin/stdout.
 */
class StdioRpcClient {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = '';
  private pending: Array<(line: string) => void> = [];

  constructor(args: string[]) {
    this.proc = spawn('node', [SERVER_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      let newlineIndex: number;
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (line.length === 0) continue;
        const resolver = this.pending.shift();
        if (resolver) resolver(line);
      }
    });
  }

  send(message: object): void {
    this.proc.stdin.write(JSON.stringify(message) + '\n');
  }

  async recv(timeoutMs = 2000): Promise<JsonRpcResponse> {
    const line = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`recv timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      this.pending.push((received) => {
        clearTimeout(timer);
        resolve(received);
      });
    });
    return JSON.parse(line) as JsonRpcResponse;
  }

  close(): void {
    this.proc.kill('SIGTERM');
  }
}

describe('MCP handshake gating', () => {
  let allowedDir: string;

  beforeEach(async () => {
    allowedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-handshake-test-'));
  });

  afterEach(async () => {
    await fs.rm(allowedDir, { recursive: true, force: true });
  });

  it('rejects tools/list with InvalidRequest before initialize handshake', async () => {
    const client = new StdioRpcClient([allowedDir]);
    try {
      client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const response = await client.recv();

      expect(response.id).toBe(1);
      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32600);
      expect(response.error?.message).toMatch(/handshake|initialize/i);
    } finally {
      client.close();
    }
  });

  it('accepts tools/list after completing initialize handshake', async () => {
    const client = new StdioRpcClient([allowedDir]);
    try {
      // 1. initialize request
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'handshake-gating-test', version: '0.0.0' },
        },
      });
      const initResponse = await client.recv();
      expect(initResponse.result).toBeDefined();
      expect(initResponse.error).toBeUndefined();

      // 2. notifications/initialized (no response expected)
      client.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      });

      // 3. tools/list now allowed
      client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      const listResponse = await client.recv();
      expect(listResponse.id).toBe(2);
      expect(listResponse.error).toBeUndefined();
      expect(listResponse.result).toBeDefined();
      const tools = (listResponse.result as { tools: unknown[] }).tools;
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    } finally {
      client.close();
    }
  });
});
