import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SequentialThinkingServer } from '../../lib.js';

describe('Session ID Validation at Entry Point', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    server = new SequentialThinkingServer();
  });

  afterEach(() => {
    server.destroy();
  });

  describe('Valid session IDs', () => {
    it('should accept valid UUID format session ID', async () => {
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should accept short alphanumeric session ID', async () => {
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'session123',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe('session123');
    });

    it('should accept session ID at maximum length (100 chars)', async () => {
      const maxLengthId = 'a'.repeat(100);
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: maxLengthId,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe(maxLengthId);
    });

    it('should accept session ID with hyphens and underscores', async () => {
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'my-session_id-123',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe('my-session_id-123');
    });
  });

  describe('Invalid session IDs', () => {
    it('should reject empty string session ID', async () => {
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: '',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
      expect(data.message).toContain('Invalid session ID format');
      expect(data.message).toContain('got 0');
    });

    it('should reject session ID exceeding maximum length (101 chars)', async () => {
      const tooLongId = 'a'.repeat(101);
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: tooLongId,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
      expect(data.message).toContain('Invalid session ID format');
      expect(data.message).toContain('got 101');
    });

    it('should reject extremely long session ID', async () => {
      const extremelyLongId = 'x'.repeat(1000);
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: extremelyLongId,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
      expect(data.message).toContain('Invalid session ID format');
    });
  });

  describe('Session ID generation when not provided', () => {
    it('should generate session ID when undefined', async () => {
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        // sessionId not provided
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      // Should have generated a UUID-format session ID
      expect(data.sessionId).toBeTruthy();
      expect(data.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate different session IDs for different requests', async () => {
      const result1 = await server.processThought({
        thought: 'thought 1',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const result2 = await server.processThought({
        thought: 'thought 2',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const data1 = JSON.parse(result1.content[0].text);
      const data2 = JSON.parse(result2.content[0].text);

      expect(data1.sessionId).not.toBe(data2.sessionId);
    });
  });

  describe('Session ID validation vs user intent', () => {
    it('should preserve valid user-provided session ID exactly', async () => {
      const userSessionId = 'my-custom-session-2024';
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: userSessionId,
      });

      const data = JSON.parse(result.content[0].text);
      // Should NOT replace with anonymous- prefix
      expect(data.sessionId).toBe(userSessionId);
      expect(data.sessionId).not.toContain('anonymous-');
    });

    it('should fail fast on invalid session ID rather than silently replacing', async () => {
      // This test verifies that we don't silently replace invalid IDs
      const invalidId = ''; // Empty string is invalid

      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: invalidId,
      });

      // Should error, not silently replace
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
    });
  });

  describe('Edge cases', () => {
    it('should handle session ID with special characters', async () => {
      // Test that validation is based on length, not content restrictions
      const specialId = 'session-!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: specialId,
      });

      // Should accept if within length bounds
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe(specialId);
    });

    it('should handle session ID with Unicode characters', async () => {
      const unicodeId = 'session-世界-🌍';
      const result = await server.processThought({
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: unicodeId,
      });

      // Should accept if within length bounds
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe(unicodeId);
    });
  });
});
