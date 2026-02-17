// import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import { registerFileOperationsTool } from '../tools/file-operations.js';

// describe('File Operations Tool', () => {
//   let mockServer: any;
//   let mockFs: any;

//   beforeEach(() => {
//     mockServer = {
//       registerTool: vi.fn()
//     };

//     // Mock fs/promises
//     mockFs = {
//       readFile: vi.fn().mockResolvedValue('test content'),
//       writeFile: vi.fn().mockResolvedValue(undefined),
//       mkdir: vi.fn().mockResolvedValue(undefined),
//       unlink: vi.fn().mockResolvedValue(undefined),
//       readdir: vi.fn().mockResolvedValue([
//         { name: 'test.txt', isDirectory: () => false },
//         { name: 'test-dir', isDirectory: () => true }
//       ]),
//       stat: vi.fn().mockResolvedValue({ isDirectory: () => true })
//     };

//     // Mock the fs/promises module
//     vi.doMock('fs/promises', () => mockFs);
//     vi.doMock('path', () => ({
//       dirname: vi.fn().mockReturnValue('/test'),
//       join: vi.fn().mockImplementation((...args) => args.join('/'))
//     }));
//   });

//   afterEach(() => {
//     vi.restoreAllMocks();
//   });

//   describe('Tool Registration', () => {
//     it('should register with correct name and config', () => {
//       registerFileOperationsTool(mockServer);

//       expect(mockServer.registerTool).toHaveBeenCalledWith(
//         'file-operations',
//         expect.objectContaining({
//           title: 'File Operations Tool',
//           description: 'Perform basic file operations with proper error handling and validation'
//         }),
//         expect.any(Function)
//       );
//     });
//   });

//   describe('Read Operation', () => {
//     it('should read file successfully', async () => {
//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({ operation: 'read', path: '/test.txt' });

//       expect(result.content[0].text).toBe('test content');
//       expect(result.isError).toBe(false);
//     });

//     it('should handle read errors', async () => {
//       mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({ operation: 'read', path: '/test.txt' });

//       expect(result.isError).toBe(true);
//       expect(result.content[0].text).toContain('Read error: Permission denied');
//     });
//   });

//   describe('Write Operation', () => {
//     it('should write file successfully', async () => {
//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({
//         operation: 'write',
//         path: '/test.txt',
//         content: 'hello world'
//       });

//       expect(result.content[0].text).toContain('Successfully wrote 11 characters');
//       expect(result.isError).toBe(false);
//     });

//     it('should require content for write operation', async () => {
//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({
//         operation: 'write',
//         path: '/test.txt'
//       });

//       expect(result.isError).toBe(true);
//       expect(result.content[0].text).toContain('Content required for write operation');
//     });
//   });

//   describe('List Operation', () => {
//     it('should list directory successfully', async () => {
//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({
//         operation: 'list',
//         path: '/test-dir'
//       });

//       expect(result.content[0].text).toContain('[FILE] test.txt');
//       expect(result.content[0].text).toContain('[DIR] test-dir');
//       expect(result.isError).toBe(false);
//     });

//     it('should handle non-directory path for list', async () => {
//       mockFs.stat.mockResolvedValue({ isDirectory: () => false });

//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({
//         operation: 'list',
//         path: '/test.txt'
//       });

//       expect(result.isError).toBe(true);
//       expect(result.content[0].text).toContain('Path must be a directory');
//     });
//   });

//   describe('Input Validation', () => {
//     it('should reject empty path', async () => {
//       registerFileOperationsTool(mockServer);
//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({
//         operation: 'read',
//         path: ''
//       });

//       expect(result.isError).toBe(true);
//       expect(result.content[0].text).toContain('Path cannot be empty');
//     });

//     it('should reject unknown operations', async () => {
//       registerFileOperationsTool(mockServer);
//       const mockHandler = mockServer.registerTool.mock.calls[0][2];
//       const result = await mockHandler({
//         operation: 'unknown',
//         path: '/test.txt'
//       });

//       expect(result.isError).toBe(true);
//       expect(result.content[0].text).toContain('Unknown operation');
//     });
//   });
// });
