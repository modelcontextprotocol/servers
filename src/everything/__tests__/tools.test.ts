import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEchoTool, EchoSchema } from '../tools/echo.js';
import { registerGetSumTool } from '../tools/get-sum.js';
import { registerGetEnvTool } from '../tools/get-env.js';
import { registerGetTinyImageTool, MCP_TINY_IMAGE } from '../tools/get-tiny-image.js';
import { registerGetStructuredContentTool } from '../tools/get-structured-content.js';
import { registerGetAnnotatedMessageTool } from '../tools/get-annotated-message.js';
import { registerTriggerLongRunningOperationTool } from '../tools/trigger-long-running-operation.js';
import { registerGetResourceLinksTool } from '../tools/get-resource-links.js';
import { registerGetResourceReferenceTool } from '../tools/get-resource-reference.js';
import { registerToggleSimulatedLoggingTool } from '../tools/toggle-simulated-logging.js';
import { registerToggleSubscriberUpdatesTool } from '../tools/toggle-subscriber-updates.js';
import { registerTriggerSamplingRequestTool } from '../tools/trigger-sampling-request.js';
import { registerTriggerElicitationRequestTool } from '../tools/trigger-elicitation-request.js';
import { registerGetRootsListTool } from '../tools/get-roots-list.js';
import { registerGZipFileAsResourceTool } from '../tools/gzip-file-as-resource.js';

// Helper to capture registered tool handlers
function createMockServer() {
  const handlers: Map<string, Function> = new Map();
  const configs: Map<string, any> = new Map();

  const mockServer = {
    registerTool: vi.fn((name: string, config: any, handler: Function) => {
      handlers.set(name, handler);
      configs.set(name, config);
    }),
    server: {
      getClientCapabilities: vi.fn(() => ({})),
      notification: vi.fn(),
    },
    sendLoggingMessage: vi.fn(),
    sendResourceUpdated: vi.fn(),
  } as unknown as McpServer;

  return { mockServer, handlers, configs };
}

describe('Tools', () => {
  describe('echo', () => {
    it('should echo back the message', async () => {
      const { mockServer, handlers } = createMockServer();
      registerEchoTool(mockServer);

      const handler = handlers.get('echo')!;
      const result = await handler({ message: 'Hello, World!' });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Echo: Hello, World!' }],
      });
    });

    it('should handle empty message', async () => {
      const { mockServer, handlers } = createMockServer();
      registerEchoTool(mockServer);

      const handler = handlers.get('echo')!;
      const result = await handler({ message: '' });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Echo: ' }],
      });
    });

    it('should reject invalid input', async () => {
      const { mockServer, handlers } = createMockServer();
      registerEchoTool(mockServer);

      const handler = handlers.get('echo')!;

      await expect(handler({})).rejects.toThrow();
      await expect(handler({ message: 123 })).rejects.toThrow();
    });
  });

  describe('EchoSchema', () => {
    it('should validate correct input', () => {
      const result = EchoSchema.parse({ message: 'test' });
      expect(result).toEqual({ message: 'test' });
    });

    it('should reject missing message', () => {
      expect(() => EchoSchema.parse({})).toThrow();
    });

    it('should reject non-string message', () => {
      expect(() => EchoSchema.parse({ message: 123 })).toThrow();
    });
  });

  describe('get-sum', () => {
    it('should calculate sum of two positive numbers', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get('get-sum')!;
      const result = await handler({ a: 5, b: 3 });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'The sum of 5 and 3 is 8.' }],
      });
    });

    it('should calculate sum with negative numbers', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get('get-sum')!;
      const result = await handler({ a: -5, b: 3 });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'The sum of -5 and 3 is -2.' }],
      });
    });

    it('should calculate sum with zero', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get('get-sum')!;
      const result = await handler({ a: 0, b: 0 });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'The sum of 0 and 0 is 0.' }],
      });
    });

    it('should handle floating point numbers', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get('get-sum')!;
      const result = await handler({ a: 1.5, b: 2.5 });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'The sum of 1.5 and 2.5 is 4.' }],
      });
    });

    it('should reject invalid input', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get('get-sum')!;

      await expect(handler({})).rejects.toThrow();
      await expect(handler({ a: 'not a number', b: 5 })).rejects.toThrow();
      await expect(handler({ a: 5 })).rejects.toThrow();
    });
  });

  describe('get-env', () => {
    it('should return all environment variables as JSON', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetEnvTool(mockServer);

      const handler = handlers.get('get-env')!;
      process.env.TEST_VAR_EVERYTHING = 'test_value';
      const result = await handler({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const envJson = JSON.parse(result.content[0].text);
      expect(envJson.TEST_VAR_EVERYTHING).toBe('test_value');

      delete process.env.TEST_VAR_EVERYTHING;
    });

    it('should return valid JSON', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetEnvTool(mockServer);

      const handler = handlers.get('get-env')!;
      const result = await handler({});

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('get-tiny-image', () => {
    it('should return image content with text descriptions', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetTinyImageTool(mockServer);

      const handler = handlers.get('get-tiny-image')!;
      const result = await handler({});

      expect(result.content).toHaveLength(3);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: "Here's the image you requested:",
      });
      expect(result.content[1]).toEqual({
        type: 'image',
        data: MCP_TINY_IMAGE,
        mimeType: 'image/png',
      });
      expect(result.content[2]).toEqual({
        type: 'text',
        text: 'The image above is the MCP logo.',
      });
    });

    it('should return valid base64 image data', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetTinyImageTool(mockServer);

      const handler = handlers.get('get-tiny-image')!;
      const result = await handler({});

      const imageContent = result.content[1];
      expect(imageContent.type).toBe('image');
      expect(imageContent.mimeType).toBe('image/png');
      // Verify it's valid base64
      expect(() => Buffer.from(imageContent.data, 'base64')).not.toThrow();
    });
  });

  describe('get-structured-content', () => {
    it('should return weather for New York', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentTool(mockServer);

      const handler = handlers.get('get-structured-content')!;
      const result = await handler({ location: 'New York' });

      expect(result.structuredContent).toEqual({
        temperature: 33,
        conditions: 'Cloudy',
        humidity: 82,
      });
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    });

    it('should return weather for Chicago', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentTool(mockServer);

      const handler = handlers.get('get-structured-content')!;
      const result = await handler({ location: 'Chicago' });

      expect(result.structuredContent).toEqual({
        temperature: 36,
        conditions: 'Light rain / drizzle',
        humidity: 82,
      });
    });

    it('should return weather for Los Angeles', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentTool(mockServer);

      const handler = handlers.get('get-structured-content')!;
      const result = await handler({ location: 'Los Angeles' });

      expect(result.structuredContent).toEqual({
        temperature: 73,
        conditions: 'Sunny / Clear',
        humidity: 48,
      });
    });
  });

  describe('get-annotated-message', () => {
    it('should return error message with high priority', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get('get-annotated-message')!;
      const result = await handler({ messageType: 'error', includeImage: false });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('Error: Operation failed');
      expect(result.content[0].annotations).toEqual({
        priority: 1.0,
        audience: ['user', 'assistant'],
      });
    });

    it('should return success message with medium priority', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get('get-annotated-message')!;
      const result = await handler({ messageType: 'success', includeImage: false });

      expect(result.content[0].text).toBe('Operation completed successfully');
      expect(result.content[0].annotations.priority).toBe(0.7);
      expect(result.content[0].annotations.audience).toEqual(['user']);
    });

    it('should return debug message with low priority', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get('get-annotated-message')!;
      const result = await handler({ messageType: 'debug', includeImage: false });

      expect(result.content[0].text).toContain('Debug:');
      expect(result.content[0].annotations.priority).toBe(0.3);
      expect(result.content[0].annotations.audience).toEqual(['assistant']);
    });

    it('should include annotated image when requested', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get('get-annotated-message')!;
      const result = await handler({ messageType: 'success', includeImage: true });

      expect(result.content).toHaveLength(2);
      expect(result.content[1].type).toBe('image');
      expect(result.content[1].annotations).toEqual({
        priority: 0.5,
        audience: ['user'],
      });
    });
  });

  describe('trigger-long-running-operation', () => {
    it('should complete operation and return result', async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerLongRunningOperationTool(mockServer);

      const handler = handlers.get('trigger-long-running-operation')!;
      // Use very short duration for test
      const result = await handler(
        { duration: 0.1, steps: 2 },
        { _meta: {}, requestId: 'test-123' }
      );

      expect(result.content[0].text).toContain('Long running operation completed');
      expect(result.content[0].text).toContain('Duration: 0.1 seconds');
      expect(result.content[0].text).toContain('Steps: 2');
    }, 10000);

    it('should send progress notifications when progressToken provided', async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerLongRunningOperationTool(mockServer);

      const handler = handlers.get('trigger-long-running-operation')!;
      await handler(
        { duration: 0.1, steps: 2 },
        { _meta: { progressToken: 'token-123' }, requestId: 'test-456', sessionId: 'session-1' }
      );

      expect(mockServer.server.notification).toHaveBeenCalledTimes(2);
      expect(mockServer.server.notification).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'notifications/progress',
          params: expect.objectContaining({
            progressToken: 'token-123',
          }),
        }),
        expect.any(Object)
      );
    }, 10000);
  });

  describe('get-resource-links', () => {
    it('should return specified number of resource links', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceLinksTool(mockServer);

      const handler = handlers.get('get-resource-links')!;
      const result = await handler({ count: 3 });

      // 1 intro text + 3 resource links
      expect(result.content).toHaveLength(4);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('3 resource links');

      // Check resource links
      for (let i = 1; i < 4; i++) {
        expect(result.content[i].type).toBe('resource_link');
        expect(result.content[i].uri).toBeDefined();
        expect(result.content[i].name).toBeDefined();
      }
    });

    it('should alternate between text and blob resources', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceLinksTool(mockServer);

      const handler = handlers.get('get-resource-links')!;
      const result = await handler({ count: 4 });

      // Odd IDs (1, 3) are blob, even IDs (2, 4) are text
      expect(result.content[1].name).toContain('Blob');
      expect(result.content[2].name).toContain('Text');
      expect(result.content[3].name).toContain('Blob');
      expect(result.content[4].name).toContain('Text');
    });

    it('should use default count of 3', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceLinksTool(mockServer);

      const handler = handlers.get('get-resource-links')!;
      const result = await handler({});

      // 1 intro text + 3 resource links (default)
      expect(result.content).toHaveLength(4);
    });
  });

  describe('get-resource-reference', () => {
    it('should return text resource reference', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get('get-resource-reference')!;
      const result = await handler({ resourceType: 'Text', resourceId: 1 });

      expect(result.content).toHaveLength(3);
      expect(result.content[0].text).toContain('Resource 1');
      expect(result.content[1].type).toBe('resource');
      expect(result.content[1].resource.uri).toContain('text/1');
      expect(result.content[2].text).toContain('URI');
    });

    it('should return blob resource reference', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get('get-resource-reference')!;
      const result = await handler({ resourceType: 'Blob', resourceId: 5 });

      expect(result.content[1].resource.uri).toContain('blob/5');
    });

    it('should reject invalid resource type', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get('get-resource-reference')!;
      await expect(handler({ resourceType: 'Invalid', resourceId: 1 })).rejects.toThrow(
        'Invalid resourceType'
      );
    });

    it('should reject invalid resource ID', async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get('get-resource-reference')!;
      await expect(handler({ resourceType: 'Text', resourceId: -1 })).rejects.toThrow(
        'Invalid resourceId'
      );
      await expect(handler({ resourceType: 'Text', resourceId: 0 })).rejects.toThrow(
        'Invalid resourceId'
      );
      await expect(handler({ resourceType: 'Text', resourceId: 1.5 })).rejects.toThrow(
        'Invalid resourceId'
      );
    });
  });

  describe('toggle-simulated-logging', () => {
    it('should start logging when not active', async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSimulatedLoggingTool(mockServer);

      const handler = handlers.get('toggle-simulated-logging')!;
      const result = await handler({}, { sessionId: 'test-session-1' });

      expect(result.content[0].text).toContain('Started');
      expect(result.content[0].text).toContain('test-session-1');
    });

    it('should stop logging when already active', async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSimulatedLoggingTool(mockServer);

      const handler = handlers.get('toggle-simulated-logging')!;

      // First call starts logging
      await handler({}, { sessionId: 'test-session-2' });

      // Second call stops logging
      const result = await handler({}, { sessionId: 'test-session-2' });

      expect(result.content[0].text).toContain('Stopped');
      expect(result.content[0].text).toContain('test-session-2');
    });

    it('should handle undefined sessionId', async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSimulatedLoggingTool(mockServer);

      const handler = handlers.get('toggle-simulated-logging')!;
      const result = await handler({}, {});

      expect(result.content[0].text).toContain('Started');
    });
  });

  describe('toggle-subscriber-updates', () => {
    it('should start updates when not active', async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSubscriberUpdatesTool(mockServer);

      const handler = handlers.get('toggle-subscriber-updates')!;
      const result = await handler({}, { sessionId: 'sub-session-1' });

      expect(result.content[0].text).toContain('Started');
      expect(result.content[0].text).toContain('sub-session-1');
    });

    it('should stop updates when already active', async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSubscriberUpdatesTool(mockServer);

      const handler = handlers.get('toggle-subscriber-updates')!;

      // First call starts updates
      await handler({}, { sessionId: 'sub-session-2' });

      // Second call stops updates
      const result = await handler({}, { sessionId: 'sub-session-2' });

      expect(result.content[0].text).toContain('Stopped');
      expect(result.content[0].text).toContain('sub-session-2');
    });
  });

  describe('trigger-sampling-request', () => {
    it('should not register when client does not support sampling', () => {
      const { mockServer } = createMockServer();
      registerTriggerSamplingRequestTool(mockServer);

      // Tool should not be registered since mock server returns empty capabilities
      expect(mockServer.registerTool).not.toHaveBeenCalled();
    });

    it('should register when client supports sampling', () => {
      const handlers: Map<string, Function> = new Map();
      const mockServer = {
        registerTool: vi.fn((name: string, config: any, handler: Function) => {
          handlers.set(name, handler);
        }),
        server: {
          getClientCapabilities: vi.fn(() => ({ sampling: {} })),
        },
      } as unknown as McpServer;

      registerTriggerSamplingRequestTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'trigger-sampling-request',
        expect.objectContaining({
          title: 'Trigger Sampling Request Tool',
          description: expect.stringContaining('Sampling'),
        }),
        expect.any(Function)
      );
    });

    it('should send sampling request and return result', async () => {
      const handlers: Map<string, Function> = new Map();
      const mockSendRequest = vi.fn().mockResolvedValue({
        model: 'test-model',
        content: { type: 'text', text: 'LLM response' },
      });

      const mockServer = {
        registerTool: vi.fn((name: string, config: any, handler: Function) => {
          handlers.set(name, handler);
        }),
        server: {
          getClientCapabilities: vi.fn(() => ({ sampling: {} })),
        },
      } as unknown as McpServer;

      registerTriggerSamplingRequestTool(mockServer);

      const handler = handlers.get('trigger-sampling-request')!;
      const result = await handler(
        { prompt: 'Test prompt', maxTokens: 50 },
        { sendRequest: mockSendRequest }
      );

      expect(mockSendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'sampling/createMessage',
          params: expect.objectContaining({
            maxTokens: 50,
          }),
        }),
        expect.anything()
      );
      expect(result.content[0].text).toContain('LLM sampling result');
    });
  });

  describe('trigger-elicitation-request', () => {
    it('should not register when client does not support elicitation', () => {
      const { mockServer } = createMockServer();
      registerTriggerElicitationRequestTool(mockServer);

      expect(mockServer.registerTool).not.toHaveBeenCalled();
    });

    it('should register when client supports elicitation', () => {
      const handlers: Map<string, Function> = new Map();
      const mockServer = {
        registerTool: vi.fn((name: string, config: any, handler: Function) => {
          handlers.set(name, handler);
        }),
        server: {
          getClientCapabilities: vi.fn(() => ({ elicitation: {} })),
        },
      } as unknown as McpServer;

      registerTriggerElicitationRequestTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'trigger-elicitation-request',
        expect.objectContaining({
          title: 'Trigger Elicitation Request Tool',
          description: expect.stringContaining('Elicitation'),
        }),
        expect.any(Function)
      );
    });

    it('should handle accept action with user content', async () => {
      const handlers: Map<string, Function> = new Map();
      const mockSendRequest = vi.fn().mockResolvedValue({
        action: 'accept',
        content: {
          name: 'John Doe',
          check: true,
          email: 'john@example.com',
        },
      });

      const mockServer = {
        registerTool: vi.fn((name: string, config: any, handler: Function) => {
          handlers.set(name, handler);
        }),
        server: {
          getClientCapabilities: vi.fn(() => ({ elicitation: {} })),
        },
      } as unknown as McpServer;

      registerTriggerElicitationRequestTool(mockServer);

      const handler = handlers.get('trigger-elicitation-request')!;
      const result = await handler({}, { sendRequest: mockSendRequest });

      expect(result.content[0].text).toContain('✅');
      expect(result.content[0].text).toContain('provided');
      expect(result.content[1].text).toContain('John Doe');
    });

    it('should handle decline action', async () => {
      const handlers: Map<string, Function> = new Map();
      const mockSendRequest = vi.fn().mockResolvedValue({
        action: 'decline',
      });

      const mockServer = {
        registerTool: vi.fn((name: string, config: any, handler: Function) => {
          handlers.set(name, handler);
        }),
        server: {
          getClientCapabilities: vi.fn(() => ({ elicitation: {} })),
        },
      } as unknown as McpServer;

      registerTriggerElicitationRequestTool(mockServer);

      const handler = handlers.get('trigger-elicitation-request')!;
      const result = await handler({}, { sendRequest: mockSendRequest });

      expect(result.content[0].text).toContain('❌');
      expect(result.content[0].text).toContain('declined');
    });

    it('should handle cancel action', async () => {
      const handlers: Map<string, Function> = new Map();
      const mockSendRequest = vi.fn().mockResolvedValue({
        action: 'cancel',
      });

      const mockServer = {
        registerTool: vi.fn((name: string, config: any, handler: Function) => {
          handlers.set(name, handler);
        }),
        server: {
          getClientCapabilities: vi.fn(() => ({ elicitation: {} })),
        },
      } as unknown as McpServer;

      registerTriggerElicitationRequestTool(mockServer);

      const handler = handlers.get('trigger-elicitation-request')!;
      const result = await handler({}, { sendRequest: mockSendRequest });

      expect(result.content[0].text).toContain('⚠️');
      expect(result.content[0].text).toContain('cancelled');
    });
  });

  describe('get-roots-list', () => {
    it('should not register when client does not support roots', () => {
      const { mockServer } = createMockServer();
      registerGetRootsListTool(mockServer);

      expect(mockServer.registerTool).not.toHaveBeenCalled();
    });

    it('should register when client supports roots', () => {
      const handlers: Map<string, Function> = new Map();
      const mockServer = {
        registerTool: vi.fn((name: string, config: any, handler: Function) => {
          handlers.set(name, handler);
        }),
        server: {
          getClientCapabilities: vi.fn(() => ({ roots: {} })),
        },
      } as unknown as McpServer;

      registerGetRootsListTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'get-roots-list',
        expect.objectContaining({
          title: 'Get Roots List Tool',
          description: expect.stringContaining('roots'),
        }),
        expect.any(Function)
      );
    });
  });

  describe('gzip-file-as-resource', () => {
    it('should compress data URI and return resource link', async () => {
      const registeredResources: any[] = [];
      const mockServer = {
        registerTool: vi.fn(),
        registerResource: vi.fn((...args) => {
          registeredResources.push(args);
        }),
      } as unknown as McpServer;

      // Get the handler
      let handler: Function | null = null;
      (mockServer.registerTool as any).mockImplementation(
        (name: string, config: any, h: Function) => {
          handler = h;
        }
      );

      registerGZipFileAsResourceTool(mockServer);

      // Create a data URI with test content
      const testContent = 'Hello, World!';
      const dataUri = `data:text/plain;base64,${Buffer.from(testContent).toString('base64')}`;

      const result = await handler!(
        { name: 'test.txt.gz', data: dataUri, outputType: 'resourceLink' }
      );

      expect(result.content[0].type).toBe('resource_link');
      expect(result.content[0].uri).toContain('test.txt.gz');
    });

    it('should return resource directly when outputType is resource', async () => {
      const mockServer = {
        registerTool: vi.fn(),
        registerResource: vi.fn(),
      } as unknown as McpServer;

      let handler: Function | null = null;
      (mockServer.registerTool as any).mockImplementation(
        (name: string, config: any, h: Function) => {
          handler = h;
        }
      );

      registerGZipFileAsResourceTool(mockServer);

      const testContent = 'Test content for compression';
      const dataUri = `data:text/plain;base64,${Buffer.from(testContent).toString('base64')}`;

      const result = await handler!(
        { name: 'output.gz', data: dataUri, outputType: 'resource' }
      );

      expect(result.content[0].type).toBe('resource');
      expect(result.content[0].resource.mimeType).toBe('application/gzip');
      expect(result.content[0].resource.blob).toBeDefined();
    });

    it('should reject unsupported URL protocols', async () => {
      const mockServer = {
        registerTool: vi.fn(),
        registerResource: vi.fn(),
      } as unknown as McpServer;

      let handler: Function | null = null;
      (mockServer.registerTool as any).mockImplementation(
        (name: string, config: any, h: Function) => {
          handler = h;
        }
      );

      registerGZipFileAsResourceTool(mockServer);

      await expect(
        handler!({ name: 'test.gz', data: 'ftp://example.com/file.txt', outputType: 'resource' })
      ).rejects.toThrow('Unsupported URL protocol');
    });
  });
});
