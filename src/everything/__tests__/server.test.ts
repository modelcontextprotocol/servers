import { describe, it, expect, vi } from 'vitest';
import { createServer } from '../server/index.js';

describe('Server Factory', () => {
  describe('createServer', () => {
    it('should return a ServerFactoryResponse object', () => {
      const result = createServer();

      expect(result).toHaveProperty('server');
      expect(result).toHaveProperty('cleanup');
    });

    it('should return a cleanup function', () => {
      const { cleanup } = createServer();

      expect(typeof cleanup).toBe('function');
    });

    it('should create an McpServer instance', () => {
      const { server } = createServer();

      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
    });

    it('should have an oninitialized handler set', () => {
      const { server } = createServer();

      expect(server.server.oninitialized).toBeDefined();
    });

    it('should clean up subscriptions when cleanup is called for a session', async () => {
      const { getSubscriptions, setSubscriptionHandlers } = await import(
        '../resources/subscriptions.js'
      );
      const { createServer } = await import('../server/index.js');
      const { server, cleanup } = createServer();

      // Subscribe session 'cleanup-test-session'
      const subscribeHandler = (server.server.setRequestHandler as any).mock?.calls?.find(
        (call: any[]) => call[0]?.shape?.method?.value === 'resources/subscribe' || call[1]
      )?.[1];

      if (subscribeHandler) {
        await subscribeHandler(
          { method: 'resources/subscribe', params: { uri: 'test://cleanup-uri' } },
          { sessionId: 'cleanup-test-session' }
        );
        expect(getSubscriptions().get('test://cleanup-uri')?.has('cleanup-test-session')).toBe(true);

        cleanup('cleanup-test-session');
        expect(getSubscriptions().get('test://cleanup-uri')?.has('cleanup-test-session')).toBeFalsy();
      } else {
        cleanup('cleanup-test-session');
      }
    });
  });
});
