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

    it('should allow multiple servers to be created', () => {
      const result1 = createServer();
      const result2 = createServer();

      expect(result1.server).toBeDefined();
      expect(result2.server).toBeDefined();
      expect(result1.server).not.toBe(result2.server);
    });
  });
});
