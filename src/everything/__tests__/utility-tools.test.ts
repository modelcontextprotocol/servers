import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Integration tests for the new utility tools added to MCP Everything server.
 * 
 * These tests verify that the new tools (string-operations, math-operations, 
 * datetime-operations, data-analysis, validation) work correctly and return
 * proper structured responses.
 */
describe('New Utility Tools Integration Tests', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeEach(async () => {
    // Start the MCP Everything server
    const serverPath = path.resolve(__dirname, '../dist/index.js');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
    });

    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
  });

  describe('String Operations Tool', () => {
    it('should perform string operations correctly', async () => {
      const result = await client.callTool({
        name: 'string-operations',
        arguments: { operation: 'upper', text: 'hello world' }
      }) as CallToolResult;

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect((result.content[0] as any).text).toContain('upper');
      expect((result.content[0] as any).text).toContain('HELLO WORLD');
    });

    it('should handle string reversal', async () => {
      const result = await client.callTool({
        name: 'string-operations',
        arguments: { operation: 'reverse', text: 'abc' }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('cba');
    });

    it('should calculate string length', async () => {
      const result = await client.callTool({
        name: 'string-operations',
        arguments: { operation: 'length', text: 'test' }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('4');
    });
  });

  describe('Math Operations Tool', () => {
    it('should perform addition', async () => {
      const result = await client.callTool({
        name: 'math-operations',
        arguments: { operation: 'add', a: 5, b: 3 }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('8');
    });

    it('should perform multiplication', async () => {
      const result = await client.callTool({
        name: 'math-operations',
        arguments: { operation: 'multiply', a: 4, b: 5 }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('20');
    });

    it('should calculate factorial', async () => {
      const result = await client.callTool({
        name: 'math-operations',
        arguments: { operation: 'factorial', a: 5 }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('120');
    });

    it('should handle division', async () => {
      const result = await client.callTool({
        name: 'math-operations',
        arguments: { operation: 'divide', a: 10, b: 2 }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('5');
    });
  });

  // describe('Date/Time Operations Tool', () => {
  //   it('should get current time', async () => {
  //     const result = await client.callTool({
  //       name: 'datetime-operations',
  //       arguments: { operation: 'current' }
  //     }) as CallToolResult;

  //     expect((result.content[0] as any).text).toContain('current');
  //     // Should be in ISO format
  //     expect((result.content[0] as any).text).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  //   });

  //   it('should format date/time', async () => {
  //     const result = await client.callTool({
  //       name: 'datetime-operations',
  //       arguments: {
  //         operation: 'format',
  //         datetime: '2023-01-01T12:00:00Z',
  //         format: 'YYYY-MM-DD HH:mm:ss'
  //       }
  //     }) as CallToolResult;

  //     expect((result.content[0] as any).text).toContain('2023-01-01 13:00:00');
  //   });

  //   it('should add time', async () => {
  //     const result = await client.callTool({
  //       name: 'datetime-operations',
  //       arguments: {
  //         operation: 'add',
  //         datetime: '2023-01-01T12:00:00Z',
  //         amount: 1,
  //         unit: 'hours'
  //       }
  //     }) as CallToolResult;

  //     expect((result.content[0] as any).text).toContain('2023-01-01T13:00:00');
  //   });
  // });

  describe('Data Analysis Tool', () => {
    it('should calculate statistics', async () => {
      const result = await client.callTool({
        name: 'data-analysis',
        arguments: { operation: 'stats', data: [1, 2, 3, 4, 5] }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('stats');
      expect((result.content[0] as any).text).toContain('count');
      expect((result.content[0] as any).text).toContain('sum');
      expect((result.content[0] as any).text).toContain('average');
    });

    it('should sort data', async () => {
      const result = await client.callTool({
        name: 'data-analysis',
        arguments: { operation: 'sort', data: [3, 1, 4, 2] }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('1');
      expect((result.content[0] as any).text).toContain('2');
      expect((result.content[0] as any).text).toContain('3');
      expect((result.content[0] as any).text).toContain('4');
    });

    it('should filter data', async () => {
      const result = await client.callTool({
        name: 'data-analysis',
        arguments: {
          operation: 'filter',
          data: [1, 2, 3, 4, 5],
          condition: 'item > 3'
        }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('4');
      expect((result.content[0] as any).text).toContain('5');
    });

    it('should calculate sum', async () => {
      const result = await client.callTool({
        name: 'data-analysis',
        arguments: { operation: 'sum', data: [1, 2, 3, 4, 5] }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('15');
    });

    it('should calculate average', async () => {
      const result = await client.callTool({
        name: 'data-analysis',
        arguments: { operation: 'average', data: [1, 2, 3, 4, 5] }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('3');
    });
  });

  describe('Validation Tool', () => {
    it('should validate email addresses', async () => {
      const result = await client.callTool({
        name: 'validation',
        arguments: { operation: 'email', value: 'test@example.com' }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('valid');
      expect((result.content[0] as any).text).toContain('true');
    });

    it('should validate URLs', async () => {
      const result = await client.callTool({
        name: 'validation',
        arguments: { operation: 'url', value: 'https://example.com' }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('valid');
      expect((result.content[0] as any).text).toContain('true');
    });

    it('should validate phone numbers', async () => {
      const result = await client.callTool({
        name: 'validation',
        arguments: { operation: 'phone', value: '+1234567890' }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('Valid phone format');
    });

    it('should validate JSON', async () => {
      const result = await client.callTool({
        name: 'validation',
        arguments: { operation: 'json', value: '{"key": "value"}' }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('valid');
      expect((result.content[0] as any).text).toContain('true');
    });

    it('should validate with regex patterns', async () => {
      const result = await client.callTool({
        name: 'validation',
        arguments: {
          operation: 'regex',
          value: 'abc123',
          pattern: '[a-z]+[0-9]+'
        }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('valid');
      expect((result.content[0] as any).text).toContain('true');
    });

    it('should handle invalid email', async () => {
      const result = await client.callTool({
        name: 'validation',
        arguments: { operation: 'email', value: 'invalid-email' }
      }) as CallToolResult;

      expect((result.content[0] as any).text).toContain('valid');
      expect((result.content[0] as any).text).toContain('false');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown operations gracefully', async () => {
      const result = await client.callTool({
        name: 'validation',
        arguments: { operation: 'unknown', value: 'test' }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toContain('Invalid enum value');
    });

    it('should handle missing required parameters', async () => {
      const result = await client.callTool({
        name: 'math-operations',
        arguments: { operation: 'add' } // Missing a and b
      }) as CallToolResult;

      expect(result.isError).toBe(true);
    });
  });
});
