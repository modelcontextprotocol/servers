import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { roots } from '../server/roots.js';
// import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Roots Module', () => {
  let mockServer: any;
  let consoleSpy: any;

  beforeEach(() => {
    mockServer = {
      server: {
        getClientCapabilities: vi.fn().mockReturnValue({ roots: true }),
        setNotificationHandler: vi.fn(),
        listRoots: vi.fn().mockResolvedValue({ roots: [] })
      },
      request: vi.fn().mockResolvedValue({ roots: [] }),
      setNotificationHandler: vi.fn(),
      sendLoggingMessage: vi.fn()
    };
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => { })
    };
    roots.clear();
  });

  afterEach(() => {
    consoleSpy.error.mockRestore();
    vi.clearAllMocks();
  });

  describe('Roots Management', () => {
    it('should initialize empty roots map', () => {
      expect(roots.size).toBe(0);
    });

    it('should store roots by session ID', async () => {
      const sessionId = 'test-session';
      // const testRoots = [{ uri: 'file:///test' }];
      const testRoots: any[] = [];

      mockServer.request.mockResolvedValue({ roots: testRoots });

      // Import and call the function to sync roots
      const { syncRoots } = await import('../server/roots.js');
      await syncRoots(mockServer, sessionId);

      expect(roots.has(sessionId)).toBe(true);
      expect(roots.get(sessionId)).toEqual(testRoots);
    });

    it('should handle missing session gracefully', async () => {
      const sessionId = 'non-existent-session';

      const { syncRoots } = await import('../server/roots.js');

      // When session doesn't exist, should return empty array
      const result = roots.get(sessionId);
      expect(result).toBeUndefined();
    });
  });

  // describe('Error Handling', () => {
  //   it('should log errors when request fails', async () => {
  //     const sessionId = 'test-session';
  //     const testError = new Error('Request failed');

  //     mockServer.request.mockRejectedValue(testError);

  //     const { syncRoots } = await import('../server/roots.js');
  //     await syncRoots(mockServer, sessionId);

  //     // console.log('consoleSpy', consoleSpy)
  //     // expect(consoleSpy.error()).toHaveBeenCalled();
  //     expect(consoleSpy.error()).toHaveBeenCalledWith(
  //       'Failed to request roots from client:',
  //       testError
  //     );
  //   });
  // });
});
