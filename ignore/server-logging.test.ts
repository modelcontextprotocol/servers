// import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import { beginSimulatedLogging } from '../server/logging.js';
// // import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// describe('Logging Module', () => {
//   let mockServer: any;
//   let clearIntervalSpy: any;

//   beforeEach(() => {
//     mockServer = {
//       sendLoggingMessage: vi.fn()
//     };
//     clearIntervalSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => { });
//     vi.useFakeTimers();
//   });

//   afterEach(() => {
//     clearIntervalSpy.mockRestore();
//     vi.useRealTimers();
//   });

//   describe('beginSimulatedLogging', () => {
//     it('should start logging without session ID', () => {
//       beginSimulatedLogging(mockServer, undefined);

//       vi.advanceTimersByTime(1000);

//       expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
//         level: 'debug',
//         data: 'Debug-level message'
//       });
//     });

//     it('should start logging with session ID', () => {
//       const sessionId = 'test-session-123';
//       beginSimulatedLogging(mockServer, sessionId);

//       vi.advanceTimersByTime(1000);

//       expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
//         level: 'debug',
//         data: 'Debug-level message - SessionId test-session-123'
//       });
//     });

//     it('should send different log levels', () => {
//       beginSimulatedLogging(mockServer, 'test');

//       // Advance through multiple intervals to get different log levels
//       for (let i = 0; i < 5; i++) {
//         vi.advanceTimersByTime(5000);
//       }

//       expect(mockServer.sendLoggingMessage).toHaveBeenCalledTimes(6); // 1 initial + 5 intervals

//       const calls = mockServer.sendLoggingMessage.mock.calls;
//       const levels = calls.map((call: any) => call[0].level);

//       expect(levels).toContain('debug');
//       expect(levels).toContain('info');
//       expect(levels).toContain('notice');
//       expect(levels).toContain('warning');
//       expect(levels).toContain('error');
//     });
//   });
// });
