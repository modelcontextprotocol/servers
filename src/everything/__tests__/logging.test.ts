import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from '../server/index.js';

describe('Server Logging', () => {
  let consoleSpy: { error: any };

  beforeEach(() => {
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => { })
    };
  });

  afterEach(() => {
    consoleSpy.error.mockRestore();
  });

  describe('createServer', () => {
    it('should initialize without logging errors', () => {
      const { server } = createServer();

      expect(server).toBeDefined();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should handle multiple server creations', () => {
      const { server: server1 } = createServer();
      const { server: server2 } = createServer();

      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1).not.toBe(server2);
    });
  });
});
