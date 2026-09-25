import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { ErrorCode, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { SafeStdioServerTransport } from '../stdio-transport.js';

function createTransport(maxLineLength = 1024) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const transport = new SafeStdioServerTransport(stdin, stdout, { maxLineLength });
  const messages: JSONRPCMessage[] = [];
  const outputLines: string[] = [];
  let stdoutBuffer = '';

  transport.onmessage = (message) => {
    messages.push(message);
  };
  stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      outputLines.push(stdoutBuffer.slice(0, newlineIndex));
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });

  return { stdin, stdout, transport, messages, outputLines };
}

async function waitForMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('SafeStdioServerTransport', () => {
  it('returns a JSON-RPC parse error and keeps processing later messages', async () => {
    const { stdin, transport, messages, outputLines } = createTransport();
    await transport.start();

    stdin.write('not-json\n');
    stdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await waitForMicrotasks();

    expect(outputLines).toHaveLength(1);
    expect(JSON.parse(outputLines[0])).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: ErrorCode.ParseError },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'ping' });

    await transport.close();
  });

  it('drops oversized frames and recovers at the next newline', async () => {
    const { stdin, transport, messages, outputLines } = createTransport(48);
    await transport.start();

    stdin.write('{"jsonrpc":"2.0","id":1,"method":"');
    stdin.write(`${'x'.repeat(64)}"}\n`);
    stdin.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    await waitForMicrotasks();

    expect(outputLines).toHaveLength(1);
    expect(JSON.parse(outputLines[0])).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: ErrorCode.InvalidRequest },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ jsonrpc: '2.0', id: 2, method: 'ping' });

    await transport.close();
  });
});
