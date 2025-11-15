import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SequentialThinkingServer } from '../lib.js';
import {
  CallToolRequest,
  ListToolsResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Mock chalk to avoid ESM issues
vi.mock('chalk', () => {
  const chalkMock = {
    yellow: (str: string) => str,
    green: (str: string) => str,
    blue: (str: string) => str,
  };
  return {
    default: chalkMock,
  };
});

const SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "sequentialthinking",
  description: "A detailed tool for dynamic and reflective problem-solving through thoughts.",
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current thinking step"
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought step is needed"
      },
      thoughtNumber: {
        type: "integer",
        description: "Current thought number (numeric value, e.g., 1, 2, 3)",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total thoughts needed (numeric value, e.g., 5, 10)",
        minimum: 1
      },
      isRevision: {
        type: "boolean",
        description: "Whether this revises previous thinking"
      },
      revisesThought: {
        type: "integer",
        description: "Which thought is being reconsidered",
        minimum: 1
      },
      branchFromThought: {
        type: "integer",
        description: "Branching point thought number",
        minimum: 1
      },
      branchId: {
        type: "string",
        description: "Branch identifier"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more thoughts are needed"
      }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

describe('Sequential Thinking MCP Server Integration', () => {
  let thinkingServer: SequentialThinkingServer;

  beforeEach(() => {
    process.env.DISABLE_THOUGHT_LOGGING = 'true';
    thinkingServer = new SequentialThinkingServer();
  });

  describe('ListToolsRequest', () => {
    it('should return correct tool schema', () => {
      const tools: ListToolsResult = {
        tools: [SEQUENTIAL_THINKING_TOOL]
      };

      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0].name).toBe('sequentialthinking');
      expect(tools.tools[0].inputSchema.required).toEqual([
        'thought',
        'nextThoughtNeeded',
        'thoughtNumber',
        'totalThoughts'
      ]);
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('thought');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('nextThoughtNeeded');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('thoughtNumber');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('totalThoughts');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('isRevision');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('revisesThought');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('branchFromThought');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('branchId');
      expect(tools.tools[0].inputSchema.properties).toHaveProperty('needsMoreThoughts');
    });
  });

  describe('CallToolRequest', () => {
    const handleToolCall = (name: string, args: unknown) => {
      if (name === "sequentialthinking") {
        return thinkingServer.processThought(args);
      }
      return {
        content: [{
          type: "text",
          text: `Unknown tool: ${name}`
        }],
        isError: true
      };
    };

    it('should process valid tool call correctly', () => {
      const response = handleToolCall('sequentialthinking', {
        thought: 'First step in problem solving',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');

      const data = JSON.parse(response.content[0].text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(3);
      expect(data.nextThoughtNeeded).toBe(true);
      expect(data.thoughtHistoryLength).toBe(1);
    });

    it('should return error for invalid arguments - missing thought', () => {
      const response = handleToolCall('sequentialthinking', {
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Invalid thought');
    });

    it('should return error for invalid arguments - non-integer thoughtNumber', () => {
      const response = handleToolCall('sequentialthinking', {
        thought: 'Test thought',
        thoughtNumber: 1.5,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('must be an integer');
    });

    it('should return error for unknown tool name', () => {
      const response = handleToolCall('unknown_tool', {});

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unknown tool: unknown_tool');
    });
  });

  describe('Server initialization', () => {
    it('should initialize server successfully', () => {
      expect(thinkingServer).toBeDefined();
      expect(thinkingServer).toBeInstanceOf(SequentialThinkingServer);
    });
  });

  describe('Tool schema runtime validation alignment', () => {
    it('should ensure schema matches runtime validation for required fields', () => {
      const schema = SEQUENTIAL_THINKING_TOOL.inputSchema;
      const requiredFields = schema.required as string[];

      // Test each required field triggers validation error when missing
      for (const field of requiredFields) {
        const args: Record<string, unknown> = {
          thought: 'Test',
          thoughtNumber: 1,
          totalThoughts: 1,
          nextThoughtNeeded: true
        };

        delete args[field];

        const response = thinkingServer.processThought(args);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain(`Invalid ${field}`);
      }
    });
  });
});
