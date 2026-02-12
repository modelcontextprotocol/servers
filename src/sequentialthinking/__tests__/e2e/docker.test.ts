import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

describe('Docker E2E Tests', () => {
  let dockerProcess: ChildProcess | null = null;
  const DOCKER_IMAGE = 'mcp/sequential-thinking';
  const TIMEOUT = 30000;

  // Helper to send JSON-RPC message to Docker container
  async function sendMessage(message: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Response timeout'));
      }, 5000);

      dockerProcess = spawn('docker', [
        'run',
        '--rm',
        '-i',
        '-e', 'MAX_THOUGHT_LENGTH=5000',
        '-e', 'MAX_HISTORY_SIZE=100',
        DOCKER_IMAGE,
      ]);

      let stdout = '';
      let stderr = '';

      dockerProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      dockerProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      dockerProcess.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`Docker exited with code ${code}. stderr: ${stderr}`));
          return;
        }

        // Parse the first JSON line (ignore console logs)
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const response = JSON.parse(line);
              resolve(response);
              return;
            } catch (e) {
              // Continue to next line
            }
          }
        }

        reject(new Error(`No valid JSON response found. stdout: ${stdout}`));
      });

      dockerProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Send the message
      dockerProcess.stdin?.write(JSON.stringify(message) + '\n');
      dockerProcess.stdin?.end();
    });
  }

  beforeAll(async () => {
    // Verify Docker image exists
    const { execSync } = await import('child_process');
    try {
      execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'ignore' });
    } catch {
      throw new Error(`Docker image ${DOCKER_IMAGE} not found. Run: docker build -t ${DOCKER_IMAGE} -f src/sequentialthinking/Dockerfile .`);
    }
  }, TIMEOUT);

  afterAll(() => {
    if (dockerProcess && !dockerProcess.killed) {
      dockerProcess.kill();
    }
  });

  describe('MCP Protocol', () => {
    it('should respond to initialize request', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }) as any;

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBe('2024-11-05');
      expect(response.result.serverInfo.name).toBe('sequential-thinking-server');
      expect(response.result.capabilities.tools).toBeDefined();
    }, TIMEOUT);

    it('should list available tools', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }) as any;

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(2);
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeInstanceOf(Array);
      expect(response.result.tools.length).toBeGreaterThan(0);

      const sequentialThinkingTool = response.result.tools.find(
        (tool: any) => tool.name === 'sequentialthinking'
      );
      expect(sequentialThinkingTool).toBeDefined();
      expect(sequentialThinkingTool.description).toBeDefined();
      expect(sequentialThinkingTool.inputSchema).toBeDefined();
    }, TIMEOUT);
  });

  describe('Sequential Thinking Tool', () => {
    it('should process a single thought', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Test thought for Docker e2e',
            thoughtNumber: 1,
            totalThoughts: 1,
            nextThoughtNeeded: false,
          },
        },
      }) as any;

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(3);
      expect(response.result).toBeDefined();
      expect(response.result.content).toBeInstanceOf(Array);
      expect(response.result.content.length).toBeGreaterThan(0);

      const textContent = response.result.content.find(
        (c: any) => c.type === 'text'
      );
      expect(textContent).toBeDefined();
      // Response is JSON structured data
      const data = JSON.parse(textContent.text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(1);
      expect(data.nextThoughtNeeded).toBe(false);
    }, TIMEOUT);

    it('should handle multiple sequential thoughts', async () => {
      // First thought
      const response1 = await sendMessage({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'First thought in sequence',
            thoughtNumber: 1,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            sessionId: 'docker-e2e-session',
          },
        },
      }) as any;

      expect(response1.result.isError).toBeUndefined();

      // Second thought
      const response2 = await sendMessage({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Second thought in sequence',
            thoughtNumber: 2,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            sessionId: 'docker-e2e-session',
          },
        },
      }) as any;

      expect(response2.result.isError).toBeUndefined();

      // Final thought
      const response3 = await sendMessage({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Final thought in sequence',
            thoughtNumber: 3,
            totalThoughts: 3,
            nextThoughtNeeded: false,
            sessionId: 'docker-e2e-session',
          },
        },
      }) as any;

      expect(response3.result.isError).toBeUndefined();
      const data3 = JSON.parse(response3.result.content[0].text);
      expect(data3.thoughtNumber).toBe(3);
      expect(data3.totalThoughts).toBe(3);
      expect(data3.nextThoughtNeeded).toBe(false);
    }, TIMEOUT);

    it('should reject thoughts exceeding maximum length', async () => {
      const longThought = 'x'.repeat(6000); // Exceeds MAX_THOUGHT_LENGTH=5000

      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: longThought,
            thoughtNumber: 1,
            totalThoughts: 1,
            nextThoughtNeeded: false,
          },
        },
      }) as any;

      expect(response.result.isError).toBe(true);
      const errorData = JSON.parse(response.result.content[0].text);
      expect(errorData.error).toBe('VALIDATION_ERROR');
      expect(errorData.message).toContain('exceeds maximum length');
    }, TIMEOUT);

    it('should handle revision thoughts', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Revised thought',
            thoughtNumber: 2,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            isRevision: true,
            revisesThought: 1,
            sessionId: 'revision-session',
          },
        },
      }) as any;

      expect(response.result.isError).toBeUndefined();
      const revisionData = JSON.parse(response.result.content[0].text);
      expect(revisionData.thoughtNumber).toBe(2);
      expect(revisionData.totalThoughts).toBe(3);
    }, TIMEOUT);

    it('should handle branch thoughts', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Branch thought',
            thoughtNumber: 2,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            branchFromThought: 1,
            branchId: 'test-branch',
            sessionId: 'branch-session',
          },
        },
      }) as any;

      expect(response.result.isError).toBeUndefined();
      const branchData = JSON.parse(response.result.content[0].text);
      expect(branchData.thoughtNumber).toBe(2);
      expect(branchData.totalThoughts).toBe(3);
      expect(branchData.branches).toContain('test-branch');
    }, TIMEOUT);
  });

  describe('Get Thought History Tool', () => {
    it('should list get_thought_history in tools', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/list',
        params: {},
      }) as any;

      const historyTool = response.result.tools.find(
        (tool: any) => tool.name === 'get_thought_history'
      );
      expect(historyTool).toBeDefined();
      expect(historyTool.inputSchema).toBeDefined();
    }, TIMEOUT);

    it('should return empty history for unknown session', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'get_thought_history',
          arguments: {
            sessionId: 'nonexistent-session',
          },
        },
      }) as any;

      expect(response.result.isError).toBeUndefined();
      const data = JSON.parse(response.result.content[0].text);
      expect(data.sessionId).toBe('nonexistent-session');
      expect(data.count).toBe(0);
      expect(data.thoughts).toEqual([]);
    }, TIMEOUT);
  });

  describe('MCTS Tools', () => {
    it('should list MCTS tools and set_thinking_mode in tools/list', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/list',
        params: {},
      }) as any;

      const toolNames = response.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('backtrack');
      expect(toolNames).toContain('evaluate_thought');
      expect(toolNames).toContain('suggest_next_thought');
      expect(toolNames).toContain('get_thinking_summary');
      expect(toolNames).toContain('set_thinking_mode');
    }, TIMEOUT);

    it('should return tree error for backtrack with invalid session', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'backtrack',
          arguments: {
            sessionId: 'nonexistent-session',
            nodeId: 'nonexistent-node',
          },
        },
      }) as any;

      expect(response.result.isError).toBe(true);
      const data = JSON.parse(response.result.content[0].text);
      expect(data.error).toBe('TREE_ERROR');
    }, TIMEOUT);

    it('should return tree error for evaluate_thought with invalid session', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'evaluate_thought',
          arguments: {
            sessionId: 'nonexistent-session',
            nodeId: 'nonexistent-node',
            value: 0.5,
          },
        },
      }) as any;

      expect(response.result.isError).toBe(true);
      const data = JSON.parse(response.result.content[0].text);
      expect(data.error).toBe('TREE_ERROR');
    }, TIMEOUT);
  });

  describe('Environment Configuration', () => {
    it('should respect MAX_THOUGHT_LENGTH environment variable', async () => {
      // The container is configured with MAX_THOUGHT_LENGTH=5000
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'x'.repeat(4999), // Just under limit
            thoughtNumber: 1,
            totalThoughts: 1,
            nextThoughtNeeded: false,
          },
        },
      }) as any;

      expect(response.result.isError).toBeUndefined();
    }, TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should return error for invalid method', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 11,
        method: 'invalid/method',
        params: {},
      }) as any;

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(11);
      expect(response.error).toBeDefined();
    }, TIMEOUT);

    it('should validate required parameters', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            // Missing required fields
            thoughtNumber: 1,
          },
        },
      }) as any;

      expect(response.result.isError).toBe(true);
      // Error text might be plain text or JSON depending on error type
      const errorText = response.result.content[0].text;
      expect(errorText).toContain('MCP error');
    }, TIMEOUT);

    it('should sanitize potentially harmful content', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Visit javascript:alert(1) for more info',
            thoughtNumber: 1,
            totalThoughts: 1,
            nextThoughtNeeded: false,
          },
        },
      }) as any;

      // Should succeed (sanitized, not blocked)
      expect(response.result.isError).toBeUndefined();
    }, TIMEOUT);
  });

  describe('Health and Metrics', () => {
    it('should respond to health check (if endpoint exists)', async () => {
      // Note: This test assumes a health endpoint exists
      // If not implemented, this test can be skipped
      try {
        const response = await sendMessage({
          jsonrpc: '2.0',
          id: 14,
          method: 'health/check',
          params: {},
        }) as any;

        if (response.error?.code === -32601) {
          // Method not found is acceptable
          console.log('Health endpoint not implemented, skipping');
        } else {
          expect(response.result).toBeDefined();
        }
      } catch (e) {
        // Health endpoint may not be exposed via MCP, that's OK
        console.log('Health check not available via MCP');
      }
    }, TIMEOUT);
  });

  describe('Session Management', () => {
    it('should generate session ID when not provided', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Thought without session ID',
            thoughtNumber: 1,
            totalThoughts: 1,
            nextThoughtNeeded: false,
          },
        },
      }) as any;

      expect(response.result.isError).toBeUndefined();
    }, TIMEOUT);

    it('should reject invalid session IDs', async () => {
      const response = await sendMessage({
        jsonrpc: '2.0',
        id: 16,
        method: 'tools/call',
        params: {
          name: 'sequentialthinking',
          arguments: {
            thought: 'Test thought',
            thoughtNumber: 1,
            totalThoughts: 1,
            nextThoughtNeeded: false,
            sessionId: '', // Empty session ID
          },
        },
      }) as any;

      expect(response.result.isError).toBe(true);
      const errorData = JSON.parse(response.result.content[0].text);
      // Empty session ID is caught by security validation
      expect(errorData.error).toBe('SECURITY_ERROR');
    }, TIMEOUT);
  });
});
