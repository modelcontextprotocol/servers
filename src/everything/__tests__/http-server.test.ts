import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import { createServer as createHttpServer, Server } from 'node:http';
import { startHttpServer } from '../transports/http-server.js';

/** A node error carrying a `code`, as `net.Server` raises for bind failures. */
class ListenError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ListenError';
  }
}

describe('startHttpServer', () => {
  let started: Server[];
  let originalExit: typeof process.exit;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    started = [];
    originalExit = process.exit;
    // Record the exit without terminating the test runner.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exit = originalExit;
    await Promise.all(
      started.map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve()))
      )
    );
  });

  /** Occupy a port so the next `listen` on it fails with EADDRINUSE. */
  async function occupyPort(): Promise<{
    port: number;
    close: () => Promise<void>;
  }> {
    const blocker = createHttpServer();
    await new Promise<void>((resolve) =>
      blocker.listen(0, '127.0.0.1', resolve)
    );
    const address = blocker.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected the blocker to bind a TCP port');
    }
    return {
      port: address.port,
      close: () =>
        new Promise<void>((resolve) => blocker.close(() => resolve())),
    };
  }

  /** Wait for the asynchronous bind failure to reach the exit handler. */
  async function waitForExit(): Promise<number> {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (exitSpy.mock.calls.length > 0) {
        return exitSpy.mock.calls[0][0] as number;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the bind failure never reached the exit handler');
  }

  /** Bind `app` to a port already in use and require a non-zero exit. */
  async function expectNonZeroExitOnBusyPort(
    app: Express,
    port: number,
    listeningMessage: string
  ): Promise<void> {
    startHttpServer(app, { port, listeningMessage });
    expect(await waitForExit()).toBe(1);
  }

  it('prints the listening message on a successful bind', async () => {
    const app = express();
    const server = startHttpServer(app, {
      port: 0,
      listeningMessage: 'Server is running on port 0',
    });
    started.push(server);

    await new Promise((resolve) => server.once('listening', resolve));

    expect(console.error).toHaveBeenCalledWith('Server is running on port 0');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('reports the conflicting port instead of claiming to be running', async () => {
    const { port, close } = await occupyPort();
    const app = express();

    try {
      await expectNonZeroExitOnBusyPort(
        app,
        port,
        `Server is running on port ${port}`
      );

      // The false success line must not be printed for a server that never bound.
      expect(console.error).not.toHaveBeenCalledWith(
        `Server is running on port ${port}`
      );
      expect(console.error).toHaveBeenCalledWith(
        `Failed to start: Port ${port} is already in use. Set PORT to a free port or stop the conflicting process.`
      );
    } finally {
      await close();
    }
  });

  it('surfaces a non-EADDRINUSE bind error and still exits non-zero', async () => {
    const app = express();
    const server = startHttpServer(app, {
      port: 0,
      listeningMessage: 'should never be reported',
    });
    started.push(server);

    const permissionDenied = new ListenError('EACCES', 'permission denied');
    server.emit('error', permissionDenied);

    expect(await waitForExit()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'HTTP server encountered an error while starting:',
      permissionDenied
    );
    expect(console.error).not.toHaveBeenCalledWith('should never be reported');
  });

  it('handles a non-object emitted value without throwing itself', async () => {
    const app = express();
    const server = startHttpServer(app, {
      port: 0,
      listeningMessage: 'should never be reported',
    });
    started.push(server);

    server.emit('error', 'a string, not an Error');

    expect(await waitForExit()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'HTTP server encountered an error while starting:',
      'a string, not an Error'
    );
  });

  it('serves requests on the bound port after a successful start', async () => {
    const app = express();
    app.get('/ping', (_req, res) => {
      res.send('pong');
    });

    const server = startHttpServer(app, {
      port: 0,
      listeningMessage: 'listening',
    });
    started.push(server);

    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected the server to bind a TCP port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/ping`);
    expect(await response.text()).toBe('pong');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});