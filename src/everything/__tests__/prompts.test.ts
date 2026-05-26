import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSimplePrompt } from '../prompts/simple.js';
import { registerArgumentsPrompt } from '../prompts/args.js';
import { registerPromptWithCompletions } from '../prompts/completions.js';
import { registerEmbeddedResourcePrompt } from '../prompts/resource.js';

// Helper to capture registered prompt handlers
function createMockServer() {
  const handlers: Map<string, Function> = new Map();
  const configs: Map<string, any> = new Map();

  const mockServer = {
    registerPrompt: vi.fn((name: string, config: any, handler: Function) => {
      handlers.set(name, handler);
      configs.set(name, config);
    }),
  } as unknown as McpServer;

  return { mockServer, handlers, configs };
}

describe('Prompts', () => {
  describe('simple-prompt', () => {
    it('should return fixed message with no arguments', () => {
      const { mockServer, handlers } = createMockServer();
      registerSimplePrompt(mockServer);

      const handler = handlers.get('simple-prompt')!;
      const result = handler();

      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'This is a simple prompt without arguments.',
            },
          },
        ],
      });
    });
  });

  describe('args-prompt', () => {
    it('should include city in message', () => {
      const { mockServer, handlers } = createMockServer();
      registerArgumentsPrompt(mockServer);

      const handler = handlers.get('args-prompt')!;
      const result = handler({ city: 'San Francisco' });

      expect(result.messages[0].content.text).toBe("What's weather in San Francisco?");
    });

    it('should include city and state in message', () => {
      const { mockServer, handlers } = createMockServer();
      registerArgumentsPrompt(mockServer);

      const handler = handlers.get('args-prompt')!;
      const result = handler({ city: 'San Francisco', state: 'California' });

      expect(result.messages[0].content.text).toBe(
        "What's weather in San Francisco, California?"
      );
    });

    it('should handle city only (optional state omitted)', () => {
      const { mockServer, handlers } = createMockServer();
      registerArgumentsPrompt(mockServer);

      const handler = handlers.get('args-prompt')!;
      const result = handler({ city: 'New York' });

      expect(result.messages[0].content.text).toBe("What's weather in New York?");
      expect(result.messages[0].content.text).not.toContain(',');
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('completable-prompt', () => {
    it('should generate promotion message with department and name', () => {
      const { mockServer, handlers } = createMockServer();
      registerPromptWithCompletions(mockServer);

      const handler = handlers.get('completable-prompt')!;
      const result = handler({ department: 'Engineering', name: 'Alice' });

      expect(result.messages[0].content.text).toBe(
        'Please promote Alice to the head of the Engineering team.'
      );
    });

    it('should work with different departments', () => {
      const { mockServer, handlers } = createMockServer();
      registerPromptWithCompletions(mockServer);

      const handler = handlers.get('completable-prompt')!;

      const salesResult = handler({ department: 'Sales', name: 'David' });
      expect(salesResult.messages[0].content.text).toContain('Sales');
      expect(salesResult.messages[0].content.text).toContain('David');
      expect(salesResult.messages[0].role).toBe('user');

      const marketingResult = handler({ department: 'Marketing', name: 'Grace' });
      expect(marketingResult.messages[0].content.text).toContain('Marketing');
      expect(marketingResult.messages[0].content.text).toContain('Grace');
    });
  });

  describe('resource-prompt', () => {
    it('should return text resource reference', () => {
      const { mockServer, handlers } = createMockServer();
      registerEmbeddedResourcePrompt(mockServer);

      const handler = handlers.get('resource-prompt')!;
      const result = handler({ resourceType: 'Text', resourceId: '1' });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content.text).toContain('Text');
      expect(result.messages[0].content.text).toContain('1');
      expect(result.messages[1].content.type).toBe('resource');
      expect(result.messages[1].content.resource.uri).toContain('text/1');
    });

    it('should return blob resource reference', () => {
      const { mockServer, handlers } = createMockServer();
      registerEmbeddedResourcePrompt(mockServer);

      const handler = handlers.get('resource-prompt')!;
      const result = handler({ resourceType: 'Blob', resourceId: '5' });

      expect(result.messages[0].content.text).toContain('Blob');
      expect(result.messages[1].content.resource.uri).toContain('blob/5');
    });

    it('should reject invalid resource type', () => {
      const { mockServer, handlers } = createMockServer();
      registerEmbeddedResourcePrompt(mockServer);

      const handler = handlers.get('resource-prompt')!;
      expect(() => handler({ resourceType: 'Invalid', resourceId: '1' })).toThrow(
        'Invalid resourceType'
      );
    });

    it('should reject invalid resource ID', () => {
      const { mockServer, handlers } = createMockServer();
      registerEmbeddedResourcePrompt(mockServer);

      const handler = handlers.get('resource-prompt')!;
      expect(() => handler({ resourceType: 'Text', resourceId: '-1' })).toThrow(
        'Invalid resourceId'
      );
      expect(() => handler({ resourceType: 'Text', resourceId: '0' })).toThrow(
        'Invalid resourceId'
      );
      expect(() => handler({ resourceType: 'Text', resourceId: 'abc' })).toThrow(
        'Invalid resourceId'
      );
    });

    it('should include both intro text and resource messages', () => {
      const { mockServer, handlers } = createMockServer();
      registerEmbeddedResourcePrompt(mockServer);

      const handler = handlers.get('resource-prompt')!;
      const result = handler({ resourceType: 'Text', resourceId: '3' });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content.type).toBe('resource');
    });
  });
});
