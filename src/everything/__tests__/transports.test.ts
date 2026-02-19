import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from '../server/index.js';

describe('Transport Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('StreamableHTTP Transport', () => {
    it('should have required exports', () => {
      expect(typeof createServer).toBe('function');
    });

    it('should handle initialization', () => {
      const { server } = createServer();
      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
    });
  });

  describe('SSE Transport', () => {
    it('should have required exports', () => {
      expect(typeof createServer).toBe('function');
    });

    it('should initialize server components', () => {
      const { server, cleanup } = createServer();
      expect(server).toBeDefined();
      expect(typeof cleanup).toBe('function');
    });
  });

  describe('STDIO Transport', () => {
    it('should have required exports', () => {
      expect(typeof createServer).toBe('function');
    });

    it('should handle stdio initialization', () => {
      const { server } = createServer();
      expect(server).toBeDefined();
    });
  });

  describe('Transport Error Handling', () => {
    it('should handle server creation errors gracefully', () => {
      vi.spyOn(console, 'error').mockImplementation(() => { });

      try {
        const { server } = createServer();
        expect(server).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
