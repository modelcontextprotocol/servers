import process from 'node:process';
import { Readable, Writable } from 'node:stream';
import { JSONRPCMessageSchema, ErrorCode, type JSONRPCMessage, type RequestId } from '@modelcontextprotocol/sdk/types.js';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';

const NEWLINE = 0x0a;
export const DEFAULT_MAX_STDIO_MESSAGE_LENGTH = 1024 * 1024;

type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: RequestId | null;
  error: {
    code: number;
    message: string;
  };
};

function getRequestId(value: unknown): RequestId | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

/**
 * Stdio transport with defensive JSON-RPC line framing.
 *
 * The SDK stdio transport reports parse/schema failures through `onerror`, but
 * clients waiting for a JSON-RPC response can still hang on malformed input.
 * This transport sends JSON-RPC error responses for bad frames, drops oversized
 * frames before parsing, and then continues processing subsequent messages.
 */
export class SafeStdioServerTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  private _buffer = Buffer.alloc(0);
  private _discardingOversizedLine = false;
  private _started = false;

  constructor(
    private readonly _stdin: Readable = process.stdin,
    private readonly _stdout: Writable = process.stdout,
    private readonly _options: { maxLineLength?: number } = {},
  ) {}

  private get maxLineLength() {
    return this._options.maxLineLength ?? DEFAULT_MAX_STDIO_MESSAGE_LENGTH;
  }

  private readonly _ondata = (chunk: Buffer) => {
    this.processChunk(chunk);
  };

  private readonly _onerror = (error: Error) => {
    this.onerror?.(error);
  };

  async start() {
    if (this._started) {
      throw new Error('SafeStdioServerTransport already started! If using Server class, note that connect() calls start() automatically.');
    }

    this._started = true;
    this._stdin.on('data', this._ondata);
    this._stdin.on('error', this._onerror);
  }

  private processChunk(chunk: Buffer) {
    let remaining = chunk;

    while (remaining.length > 0) {
      if (this._discardingOversizedLine) {
        const newlineIndex = remaining.indexOf(NEWLINE);
        if (newlineIndex === -1) {
          return;
        }

        this._discardingOversizedLine = false;
        remaining = remaining.subarray(newlineIndex + 1);
        continue;
      }

      const newlineIndex = remaining.indexOf(NEWLINE);
      const segmentEnd = newlineIndex === -1 ? remaining.length : newlineIndex;
      const nextLineLength = this._buffer.length + segmentEnd;

      if (nextLineLength > this.maxLineLength) {
        this._buffer = Buffer.alloc(0);
        this._discardingOversizedLine = newlineIndex === -1;
        void this.sendError(null, ErrorCode.InvalidRequest, `JSON-RPC message exceeds maximum stdio line length of ${this.maxLineLength} bytes`);
        remaining = newlineIndex === -1 ? Buffer.alloc(0) : remaining.subarray(newlineIndex + 1);
        continue;
      }

      if (newlineIndex === -1) {
        this._buffer = Buffer.concat([this._buffer, remaining]);
        return;
      }

      const lineBuffer = Buffer.concat([this._buffer, remaining.subarray(0, newlineIndex)]);
      this._buffer = Buffer.alloc(0);
      remaining = remaining.subarray(newlineIndex + 1);
      this.processLine(lineBuffer.toString('utf8').replace(/\r$/, ''));
    }
  }

  private processLine(line: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      void this.sendError(null, ErrorCode.ParseError, 'Parse error');
      return;
    }

    const message = JSONRPCMessageSchema.safeParse(parsed);
    if (!message.success) {
      this.onerror?.(message.error);
      void this.sendError(getRequestId(parsed), ErrorCode.InvalidRequest, 'Invalid JSON-RPC message');
      return;
    }

    this.onmessage?.(message.data);
  }

  async close() {
    this._stdin.off('data', this._ondata);
    this._stdin.off('error', this._onerror);
    if (this._stdin.listenerCount('data') === 0) {
      this._stdin.pause();
    }
    this._buffer = Buffer.alloc(0);
    this._discardingOversizedLine = false;
    this.onclose?.();
  }

  send(message: JSONRPCMessage, _options?: TransportSendOptions) {
    return this.write(serializeMessage(message));
  }

  private sendError(id: RequestId | null, code: number, message: string) {
    const response: JsonRpcErrorResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
    return this.write(`${JSON.stringify(response)}\n`);
  }

  private write(data: string) {
    return new Promise<void>((resolve) => {
      if (this._stdout.write(data)) {
        resolve();
      } else {
        this._stdout.once('drain', resolve);
      }
    });
  }
}
