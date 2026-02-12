#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { ProcessThoughtRequest } from './lib.js';
import { SequentialThinkingServer } from './lib.js';
import type { AppConfig } from './interfaces.js';
import { ConfigManager } from './config.js';

// Load configuration
let config: AppConfig;
try {
  config = ConfigManager.load();
} catch (error) {
  console.error('Failed to load configuration:', error);
  process.exit(1);
}

const server = new McpServer({
  name: config.server.name,
  version: config.server.version,
});

const thinkingServer = new SequentialThinkingServer();

// Register the main sequential thinking tool
server.registerTool(
  'sequentialthinking',
  {
    title: 'Sequential Thinking',
    description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer
- Enhanced with security controls, rate limiting, and bounded memory management

Parameters explained:
- thought: Your current thinking step, which can include:
  * Regular analytical steps
  * Revisions of previous thoughts
  * Questions about previous decisions
  * Realizations about needing more analysis
  * Changes in approach
  * Hypothesis generation
  * Hypothesis verification
- nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
- thoughtNumber: Current number in sequence (can go beyond initial total if needed)
- totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
- isRevision: A boolean indicating if this thought revises previous thinking
- revisesThought: If is_revision is true, which thought number is being reconsidered
- branchFromThought: If branching, which thought number is the branching point
- branchId: Identifier for the current branch (if any)
- needsMoreThoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set nextThoughtNeeded to false when truly done and a satisfactory answer is reached

Security Notes:
- All thoughts are validated and sanitized
- Rate limiting is enforced per session
- Maximum thought length and history size are enforced
- Malicious content is automatically filtered`,
    inputSchema: {
      thought: z.string().describe('Your current thinking step'),
      nextThoughtNeeded: z.boolean().describe('Whether another thought step is needed'),
      thoughtNumber: z.number().int().min(1).describe('Current thought number (numeric value, e.g., 1, 2, 3)'),
      totalThoughts: z.number().int().min(1).describe('Estimated total thoughts needed (numeric value, e.g., 5, 10)'),
      isRevision: z.boolean().optional().describe('Whether this revises previous thinking'),
      revisesThought: z.number().int().min(1).optional().describe('Which thought is being reconsidered'),
      branchFromThought: z.number().int().min(1).optional().describe('Branching point thought number'),
      branchId: z.string().optional().describe('Branch identifier'),
      needsMoreThoughts: z.boolean().optional().describe('If more thoughts are needed'),
      sessionId: z.string().optional().describe('Session identifier for tracking'),
      thinkingMode: z.enum(['fast', 'expert', 'deep']).optional().describe('Set thinking mode on first thought: fast (3-5 linear steps), expert (balanced branching), deep (exhaustive exploration)'),
    },
  },
  async (args) => {
    const result = await thinkingServer.processThought(args as ProcessThoughtRequest);

    if (result.isError === true || result.content.length === 0) {
      return {
        content: result.content,
        isError: true,
      };
    }

    return { content: result.content };
  },
);

// Register the thought history retrieval tool
server.registerTool(
  'get_thought_history',
  {
    title: 'Get Thought History',
    description: 'Retrieve past thoughts from a session. Use this to review thinking history, examine branch contents, or recall earlier reasoning steps.',
    inputSchema: {
      sessionId: z.string().describe('Session identifier to retrieve thoughts for'),
      branchId: z.string().optional().describe('Optional branch identifier to filter thoughts by branch'),
      limit: z.number().int().min(1).optional().describe('Maximum number of thoughts to return (most recent first)'),
    },
  },
  async (args) => {
    const thoughts = thinkingServer.getFilteredHistory({
      sessionId: args.sessionId,
      branchId: args.branchId,
      limit: args.limit,
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          sessionId: args.sessionId,
          branchId: args.branchId ?? null,
          count: thoughts.length,
          thoughts: thoughts.map((t) => ({
            thoughtNumber: t.thoughtNumber,
            totalThoughts: t.totalThoughts,
            thought: t.thought,
            nextThoughtNeeded: t.nextThoughtNeeded,
            isRevision: t.isRevision ?? false,
            revisesThought: t.revisesThought ?? null,
            branchId: t.branchId ?? null,
            branchFromThought: t.branchFromThought ?? null,
            timestamp: t.timestamp,
          })),
        }, null, 2),
      }],
    };
  },
);

// Add health check tool for monitoring
server.registerTool(
  'health_check',
  {
    title: 'Health Check',
    description: 'Check the health and status of the Sequential Thinking server',
    inputSchema: {},
  },
  async () => {
    try {
      const healthStatus = await thinkingServer.getHealthStatus();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(healthStatus, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'unhealthy',
            summary: 'Health check failed',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          }, null, 2),
        }],
        isError: true,
      };
    }
  },
);

// Add metrics tool for monitoring
server.registerTool(
  'metrics',
  {
    title: 'Server Metrics',
    description: 'Get detailed metrics and statistics about the server',
    inputSchema: {},
  },
  async () => {
    try {
      const metrics = thinkingServer.getMetrics();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(metrics, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          }, null, 2),
        }],
        isError: true,
      };
    }
  },
);

// Register thinking mode tool
server.registerTool(
  'set_thinking_mode',
  {
    title: 'Set Thinking Mode',
    description: `Set a thinking mode for a session to shape exploration behavior. Modes:
- fast: Linear, exploit-focused. 3-5 steps, no branching, auto-evaluation.
- expert: Balanced exploration with targeted branching, backtracking on low scores, convergence at 0.7.
- deep: Exhaustive exploration. Wide branching (up to 5), aggressive backtracking, convergence at 0.85.

Once set, each processThought response includes modeGuidance with recommended actions.`,
    inputSchema: {
      sessionId: z.string().describe('Session identifier'),
      mode: z.enum(['fast', 'expert', 'deep']).describe('Thinking mode to activate'),
    },
  },
  async (args) => {
    const result = await thinkingServer.setThinkingMode(args.sessionId, args.mode);
    if (result.isError === true) {
      return { content: result.content, isError: true };
    }
    return { content: result.content };
  },
);

// Register MCTS tree exploration tools
server.registerTool(
  'backtrack',
  {
    title: 'Backtrack',
    description: 'Move the thought tree cursor back to a previous node, allowing exploration of alternative paths from that point. Returns the node info, its children, and tree statistics.',
    inputSchema: {
      sessionId: z.string().describe('Session identifier'),
      nodeId: z.string().describe('The node ID to backtrack to'),
    },
  },
  async (args) => {
    const result = await thinkingServer.backtrack(args.sessionId, args.nodeId);
    if (result.isError === true) {
      return { content: result.content, isError: true };
    }
    return { content: result.content };
  },
);

server.registerTool(
  'evaluate_thought',
  {
    title: 'Evaluate Thought',
    description: 'Score a thought node with a value between 0 and 1. The value is backpropagated up the tree to all ancestors, updating their visit counts and total values. This drives the MCTS selection process.',
    inputSchema: {
      sessionId: z.string().describe('Session identifier'),
      nodeId: z.string().describe('The node ID to evaluate'),
      value: z.number().min(0).max(1).describe('Evaluation score between 0 (poor) and 1 (excellent)'),
    },
  },
  async (args) => {
    const result = await thinkingServer.evaluateThought(args.sessionId, args.nodeId, args.value);
    if (result.isError === true) {
      return { content: result.content, isError: true };
    }
    return { content: result.content };
  },
);

server.registerTool(
  'suggest_next_thought',
  {
    title: 'Suggest Next Thought',
    description: 'Use UCB1-based selection to suggest the most promising node to explore next. Strategies: "explore" favors unvisited nodes, "exploit" favors high-value nodes, "balanced" (default) balances both.',
    inputSchema: {
      sessionId: z.string().describe('Session identifier'),
      strategy: z.enum(['explore', 'exploit', 'balanced']).optional().describe('Selection strategy (default: balanced)'),
    },
  },
  async (args) => {
    const result = await thinkingServer.suggestNextThought(args.sessionId, args.strategy);
    if (result.isError === true) {
      return { content: result.content, isError: true };
    }
    return { content: result.content };
  },
);

server.registerTool(
  'get_thinking_summary',
  {
    title: 'Get Thinking Summary',
    description: 'Get a comprehensive summary of the thought tree including the best reasoning path (highest average value), full tree structure, and statistics.',
    inputSchema: {
      sessionId: z.string().describe('Session identifier'),
      maxDepth: z.number().int().min(0).optional().describe('Maximum depth to include in tree structure (omit for full tree)'),
    },
  },
  async (args) => {
    const result = await thinkingServer.getThinkingSummary(args.sessionId, args.maxDepth);
    if (result.isError === true) {
      return { content: result.content, isError: true };
    }
    return { content: result.content };
  },
);

// Setup graceful shutdown
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

async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  const envInfo = ConfigManager.getEnvironmentInfo();
  console.error(`Sequential Thinking MCP Server ${config.server.version} running on stdio`);
  console.error(`Node.js ${envInfo.nodeVersion} on ${envInfo.platform}-${envInfo.arch} (PID: ${envInfo.pid})`);
  console.error(`Configuration: Max thoughts=${config.state.maxHistorySize}, Rate limit=${config.security.maxThoughtsPerMinute}/min`);
  
  if (config.monitoring.enableMetrics) {
    console.error('Metrics collection enabled');
  }
  if (config.monitoring.enableHealthChecks) {
    console.error('Health checks enabled');
  }
}

runServer().catch((error) => {
  console.error('Fatal error running server:', error);
  thinkingServer.destroy();
  process.exit(1);
});
