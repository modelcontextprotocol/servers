import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { ProcessThoughtRequest } from './server.js';
import { SequentialThinkingServer } from './server.js';

// Simple configuration from environment
const config = {
  maxHistorySize: parseInt(process.env.MAX_HISTORY_SIZE ?? '1000', 10),
  maxThoughtLength: parseInt(process.env.MAX_THOUGHT_LENGTH ?? '5000', 10),
  enableLogging: (process.env.DISABLE_THOUGHT_LOGGING ?? '').toLowerCase() !== 'true',
  serverName: process.env.SERVER_NAME ?? 'sequential-thinking-server',
  serverVersion: process.env.SERVER_VERSION ?? '1.0.0',
};

const thinkingServer = new SequentialThinkingServer(
  config.maxHistorySize,
  config.maxThoughtLength,
);

const server = new McpServer({
  name: config.serverName,
  version: config.serverVersion,
});

server.registerTool(
  'sequentialthinking',
  {
    title: 'Sequential Thinking',
    description: `A tool for dynamic and reflective problem-solving through sequential thoughts.

This tool helps break down complex problems into manageable steps with the ability to:
- Adjust total_thoughts up or down as you progress
- Question or revise previous thoughts
- Branch into alternative reasoning paths
- Express uncertainty and explore different approaches

Parameters:
- thought: Your current thinking step
- nextThoughtNeeded: True if you need more thinking
- thoughtNumber: Current number in sequence
- totalThoughts: Estimated total thoughts needed
- isRevision: Whether this revises previous thinking
- revisesThought: Which thought number is being reconsidered
- branchFromThought: Branching point thought number
- branchId: Identifier for the current branch
- needsMoreThoughts: If more thoughts are needed
- sessionId: Optional session identifier
- origin: Optional request origin
- ipAddress: Optional IP address for security

Security features:
- Input validation and sanitization
- Maximum thought length enforcement
- Malicious content detection
- Configurable history limits`,
    
    inputSchema: {
      thought: z.string().describe('Your current thinking step'),
      nextThoughtNeeded: z.boolean().describe('Whether another thought step is needed'),
      thoughtNumber: z.number().int().min(1).describe('Current thought number (e.g., 1, 2, 3)'),
      totalThoughts: z.number().int().min(1).describe('Estimated total thoughts needed (e.g., 5, 10)'),
      isRevision: z.boolean().optional().describe('Whether this revises previous thinking'),
      revisesThought: z.number().int().min(1).optional().describe('Which thought is being reconsidered'),
      branchFromThought: z.number().int().min(1).optional().describe('Branching point thought number'),
      branchId: z.string().optional().describe('Branch identifier'),
      needsMoreThoughts: z.boolean().optional().describe('If more thoughts are needed'),
      sessionId: z.string().optional().describe('Session identifier'),
      origin: z.string().optional().describe('Request origin'),
      ipAddress: z.string().optional().describe('IP address for rate limiting'),
    },
    outputSchema: {
      thoughtNumber: z.number(),
      totalThoughts: z.number(),
      nextThoughtNeeded: z.boolean(),
      branches: z.array(z.string()),
      thoughtHistoryLength: z.number(),
      sessionId: z.string().optional(),
      timestamp: z.number().optional(),
    },
  },
  async (args) => {
    const startTime = Date.now();
    
    try {
      const result = thinkingServer.processThought(args as ProcessThoughtRequest);
      
      if (config.enableLogging) {
        const duration = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] Processed thought ${args.thoughtNumber}/${args.totalThoughts} in ${duration}ms`);
        
        if (result.isError) {
          console.error(`Error: ${result.content[0].text}`);
        }
      }
      
      return result;
    } catch (error) {
      const errorResponse = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: 'PROCESSING_ERROR',
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }),
        }],
        isError: true,
      };
      
      if (config.enableLogging) {
        console.error('Error processing thought:', error);
      }
      
      return errorResponse;
    }
  },
);

// Simple health check for monitoring
server.registerTool(
  'server_health',
  {
    title: 'Server Health Check',
    description: 'Returns basic server health and statistics',
    inputSchema: {},
    outputSchema: {
      status: z.string(),
      uptime: z.number(),
      stats: z.object({
        totalThoughts: z.number(),
        historySize: z.number(),
        maxHistorySize: z.number(),
        branchCount: z.number(),
      }),
    },
  },
  async () => {
    const stats = thinkingServer.getStats();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'healthy',
          uptime: process.uptime(),
          stats,
          timestamp: new Date().toISOString(),
        }, null, 2),
      }],
    };
  },
);

async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error(`${config.serverName} v${config.serverVersion} running on stdio`);
  console.error(`Configuration: maxHistory=${config.maxHistorySize}, maxLength=${config.maxThoughtLength}, logging=${!config.enableLogging}`);
}

runServer().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down gracefully...');
  thinkingServer.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  thinkingServer.destroy();
  process.exit(0);
});