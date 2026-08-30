import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  textResource,
  blobResource,
  textResourceUri,
  blobResourceUri,
  RESOURCE_TYPE_TEXT,
  RESOURCE_TYPE_BLOB,
  RESOURCE_TYPES,
  resourceTypeCompleter,
  resourceIdForPromptCompleter,
  resourceIdForResourceTemplateCompleter,
  registerResourceTemplates,
} from '../resources/templates.js';
import {
  getSessionResourceURI,
  registerSessionResource,
} from '../resources/session.js';
import { registerFileResources } from '../resources/files.js';
import {
  setSubscriptionHandlers,
  beginSimulatedResourceUpdates,
  stopSimulatedResourceUpdates,
} from '../resources/subscriptions.js';

describe('Resource Templates', () => {
  describe('Constants', () => {
    it('should include both types in RESOURCE_TYPES array', () => {
      expect(RESOURCE_TYPES).toContain(RESOURCE_TYPE_TEXT);
      expect(RESOURCE_TYPES).toContain(RESOURCE_TYPE_BLOB);
      expect(RESOURCE_TYPES).toHaveLength(2);
    });
  });

  describe('textResourceUri', () => {
    it('should create URL for text resource', () => {
      const uri = textResourceUri(1);
      expect(uri.toString()).toBe('demo://resource/dynamic/text/1');
    });

    it('should handle different resource IDs', () => {
      expect(textResourceUri(5).toString()).toBe('demo://resource/dynamic/text/5');
      expect(textResourceUri(100).toString()).toBe('demo://resource/dynamic/text/100');
    });
  });

  describe('blobResourceUri', () => {
    it('should create URL for blob resource', () => {
      const uri = blobResourceUri(1);
      expect(uri.toString()).toBe('demo://resource/dynamic/blob/1');
    });

    it('should handle different resource IDs', () => {
      expect(blobResourceUri(5).toString()).toBe('demo://resource/dynamic/blob/5');
      expect(blobResourceUri(100).toString()).toBe('demo://resource/dynamic/blob/100');
    });
  });

  describe('textResource', () => {
    it('should create text resource with correct structure', () => {
      const uri = textResourceUri(1);
      const resource = textResource(uri, 1);

      expect(resource.uri).toBe(uri.toString());
      expect(resource.mimeType).toBe('text/plain');
      expect(resource.text).toContain('Resource 1');
      expect(resource.text).toContain('plaintext');
    });

    it('should include timestamp in content', () => {
      const uri = textResourceUri(2);
      const resource = textResource(uri, 2);

      // Timestamp format varies, just check it contains time-related content
      expect(resource.text).toMatch(/\d/);
    });
  });

  describe('blobResource', () => {
    it('should create blob resource with correct structure', () => {
      const uri = blobResourceUri(1);
      const resource = blobResource(uri, 1);

      expect(resource.uri).toBe(uri.toString());
      expect(resource.mimeType).toBe('text/plain');
      expect(resource.blob).toBeDefined();
    });

    it('should create valid base64 encoded content', () => {
      const uri = blobResourceUri(3);
      const resource = blobResource(uri, 3);

      // Decode and verify content
      const decoded = Buffer.from(resource.blob, 'base64').toString();
      expect(decoded).toContain('Resource 3');
      expect(decoded).toContain('base64 blob');
    });
  });

  describe('resourceTypeCompleter', () => {
    it('should be defined as a completable schema', () => {
      // The completer is a zod schema wrapped with completable
      expect(resourceTypeCompleter).toBeDefined();
      // It should have the zod parse method
      expect(typeof (resourceTypeCompleter as any).parse).toBe('function');
    });

    it('should validate string resource types', () => {
      // Test that valid strings pass validation
      expect(() => (resourceTypeCompleter as any).parse('Text')).not.toThrow();
      expect(() => (resourceTypeCompleter as any).parse('Blob')).not.toThrow();
    });
  });

  describe('resourceIdForPromptCompleter', () => {
    it('should be defined as a completable schema', () => {
      expect(resourceIdForPromptCompleter).toBeDefined();
      expect(typeof (resourceIdForPromptCompleter as any).parse).toBe('function');
    });

    it('should validate string IDs', () => {
      // Test that valid strings pass validation
      expect(() => (resourceIdForPromptCompleter as any).parse('1')).not.toThrow();
      expect(() => (resourceIdForPromptCompleter as any).parse('100')).not.toThrow();
    });
  });

  describe('resourceIdForResourceTemplateCompleter', () => {
    it('should validate positive integer IDs', () => {
      expect(resourceIdForResourceTemplateCompleter('1')).toEqual(['1']);
      expect(resourceIdForResourceTemplateCompleter('50')).toEqual(['50']);
    });

    it('should reject invalid IDs', () => {
      expect(resourceIdForResourceTemplateCompleter('0')).toEqual([]);
      expect(resourceIdForResourceTemplateCompleter('-5')).toEqual([]);
      expect(resourceIdForResourceTemplateCompleter('not-a-number')).toEqual([]);
    });
  });

  describe('registerResourceTemplates', () => {
    it('should register text and blob resource templates', () => {
      const registeredResources: any[] = [];

      const mockServer = {
        registerResource: vi.fn((...args) => {
          registeredResources.push(args);
        }),
      } as unknown as McpServer;

      registerResourceTemplates(mockServer);

      expect(mockServer.registerResource).toHaveBeenCalledTimes(2);

      // Check text resource registration
      const textRegistration = registeredResources.find((r) =>
        r[0].includes('Text')
      );
      expect(textRegistration).toBeDefined();
      expect(textRegistration[1]).toBeInstanceOf(ResourceTemplate);

      // Check blob resource registration
      const blobRegistration = registeredResources.find((r) =>
        r[0].includes('Blob')
      );
      expect(blobRegistration).toBeDefined();
    });
  });
});

describe('Session Resources', () => {
  describe('getSessionResourceURI', () => {
    it('should generate correct URI for resource name', () => {
      expect(getSessionResourceURI('test')).toBe('demo://resource/session/test');
    });

    it('should handle various resource names', () => {
      expect(getSessionResourceURI('my-file')).toBe('demo://resource/session/my-file');
      expect(getSessionResourceURI('document_123')).toBe(
        'demo://resource/session/document_123'
      );
    });
  });

  describe('registerSessionResource', () => {
    it('should register text resource and return resource link', () => {
      const registrations: any[] = [];
      const mockServer = {
        registerResource: vi.fn((...args) => {
          registrations.push(args);
        }),
      } as unknown as McpServer;

      const resource = {
        uri: 'demo://resource/session/test-file',
        name: 'test-file',
        mimeType: 'text/plain',
        description: 'A test file',
      };

      const result = registerSessionResource(
        mockServer,
        resource,
        'text',
        'Hello, World!'
      );

      expect(result.type).toBe('resource_link');
      expect(result.uri).toBe(resource.uri);
      expect(result.name).toBe(resource.name);

      expect(mockServer.registerResource).toHaveBeenCalledWith(
        'test-file',
        'demo://resource/session/test-file',
        expect.objectContaining({
          mimeType: 'text/plain',
          description: 'A test file',
        }),
        expect.any(Function)
      );
    });

    it('should register blob resource correctly', () => {
      const mockServer = {
        registerResource: vi.fn(),
      } as unknown as McpServer;

      const resource = {
        uri: 'demo://resource/session/binary-file',
        name: 'binary-file',
        mimeType: 'application/octet-stream',
      };

      const blobContent = Buffer.from('binary data').toString('base64');
      const result = registerSessionResource(mockServer, resource, 'blob', blobContent);

      expect(result.type).toBe('resource_link');
      expect(mockServer.registerResource).toHaveBeenCalled();
    });

    it('should return resource handler that provides correct content', async () => {
      let capturedHandler: Function | null = null;
      const mockServer = {
        registerResource: vi.fn((_name, _uri, _config, handler) => {
          capturedHandler = handler;
        }),
      } as unknown as McpServer;

      const resource = {
        uri: 'demo://resource/session/content-test',
        name: 'content-test',
        mimeType: 'text/plain',
      };

      registerSessionResource(mockServer, resource, 'text', 'Test content here');

      expect(capturedHandler).not.toBeNull();

      const handlerResult = await capturedHandler!(new URL(resource.uri));
      expect(handlerResult.contents).toHaveLength(1);
      expect(handlerResult.contents[0].text).toBe('Test content here');
      expect(handlerResult.contents[0].mimeType).toBe('text/plain');
    });
  });
});

describe('File Resources', () => {
  describe('registerFileResources', () => {
    it('should register file resources when docs directory exists', () => {
      const mockServer = {
        registerResource: vi.fn(),
      } as unknown as McpServer;

      registerFileResources(mockServer);

      // The docs folder exists in the everything server and contains files
      // so registerResource should have been called
      expect(mockServer.registerResource).toHaveBeenCalled();
    });
  });
});

describe('Subscriptions', () => {
  describe('setSubscriptionHandlers', () => {
    it('should set request handlers on server', () => {
      const mockServer = {
        server: {
          setRequestHandler: vi.fn(),
        },
        sendLoggingMessage: vi.fn(),
      } as unknown as McpServer;

      setSubscriptionHandlers(mockServer);

      // Should set both subscribe and unsubscribe handlers
      expect(mockServer.server.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('simulated resource updates lifecycle', () => {
    afterEach(() => {
      // Clean up any intervals
      stopSimulatedResourceUpdates('lifecycle-test-session');
    });

    it('should start and stop updates without errors', () => {
      const mockServer = {
        server: {
          notification: vi.fn(),
        },
      } as unknown as McpServer;

      // Start updates - should work for both defined and undefined sessionId
      beginSimulatedResourceUpdates(mockServer, 'lifecycle-test-session');
      beginSimulatedResourceUpdates(mockServer, undefined);

      // Stop updates - should handle all cases gracefully
      stopSimulatedResourceUpdates('lifecycle-test-session');
      stopSimulatedResourceUpdates('non-existent-session');
      stopSimulatedResourceUpdates(undefined);

      // If we got here without throwing, the lifecycle works correctly
      expect(true).toBe(true);
    });
  });
});
