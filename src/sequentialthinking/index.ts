#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
// Fixed chalk import for ESM
import chalk from 'chalk';

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
  references?: number[];
  tags?: string[];
}

class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    // Validate references array if provided
    let references: number[] | undefined;
    if (data.references !== undefined) {
      if (!Array.isArray(data.references)) {
        throw new Error('Invalid references: must be an array of numbers');
      }
      references = data.references.filter(ref => typeof ref === 'number' && ref > 0);
    }

    // Validate tags array if provided
    let tags: string[] | undefined;
    if (data.tags !== undefined) {
      if (!Array.isArray(data.tags)) {
        throw new Error('Invalid tags: must be an array of strings');
      }
      tags = data.tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0)
        .map(tag => tag.trim().toLowerCase());
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
      references,
      tags,
    };
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId, references, tags } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    // Add references and tags information
    let metaInfo = '';
    if (references && references.length > 0) {
      metaInfo += ` | 🔗 References: ${references.join(', ')}`;
    }
    if (tags && tags.length > 0) {
      metaInfo += ` | 🏷️ Tags: ${tags.join(', ')}`;
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}${metaInfo}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  public getThought(thoughtNumber: number): ThoughtData | null {
    return this.thoughtHistory.find(thought => thought.thoughtNumber === thoughtNumber) || null;
  }

  public searchThoughts(query: string, tags?: string[]): ThoughtData[] {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedTags = tags?.map(tag => tag.toLowerCase().trim());

    return this.thoughtHistory.filter(thought => {
      // Check if thought content matches query
      const contentMatch = normalizedQuery === '' || 
        thought.thought.toLowerCase().includes(normalizedQuery);

      // Check if thought has all required tags
      const tagMatch = !normalizedTags || normalizedTags.length === 0 ||
        (thought.tags && normalizedTags.every(tag => thought.tags!.includes(tag)));

      return contentMatch && tagMatch;
    });
  }

  public getRelatedThoughts(thoughtNumber: number): ThoughtData[] {
    const baseThought = this.getThought(thoughtNumber);
    if (!baseThought) {
      return [];
    }

    const related: ThoughtData[] = [];

    // Find thoughts that reference this one
    const referencingThoughts = this.thoughtHistory.filter(thought => 
      thought.references && thought.references.includes(thoughtNumber)
    );

    // Find thoughts that this one references
    const referencedThoughts = baseThought.references ? 
      baseThought.references.map(ref => this.getThought(ref)).filter(Boolean) as ThoughtData[] : [];

    // Find thoughts in the same branch
    const branchThoughts = baseThought.branchId ? 
      this.thoughtHistory.filter(thought => thought.branchId === baseThought.branchId && thought.thoughtNumber !== thoughtNumber) : [];

    // Find thoughts with similar tags
    const similarTaggedThoughts = baseThought.tags && baseThought.tags.length > 0 ?
      this.thoughtHistory.filter(thought => 
        thought.thoughtNumber !== thoughtNumber &&
        thought.tags && 
        thought.tags.some(tag => baseThought.tags!.includes(tag))
      ) : [];

    // Combine and deduplicate
    const allRelated = [...referencingThoughts, ...referencedThoughts, ...branchThoughts, ...similarTaggedThoughts];
    const uniqueRelated = allRelated.filter((thought, index, arr) => 
      arr.findIndex(t => t.thoughtNumber === thought.thoughtNumber) === index
    );

    return uniqueRelated;
  }

  public processThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(validatedInput);
        console.error(formattedThought);
      }

      // Include references and tags in the response if they exist
      const responseData: any = {
        thoughtNumber: validatedInput.thoughtNumber,
        totalThoughts: validatedInput.totalThoughts,
        nextThoughtNeeded: validatedInput.nextThoughtNeeded,
        branches: Object.keys(this.branches),
        thoughtHistoryLength: this.thoughtHistory.length
      };

      if (validatedInput.references && validatedInput.references.length > 0) {
        responseData.references = validatedInput.references;
      }

      if (validatedInput.tags && validatedInput.tags.length > 0) {
        responseData.tags = validatedInput.tags;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

const SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "sequentialthinking",
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
- Reference previous thoughts by number to build connections
- Tag thoughts for easy categorization and retrieval
- Search and filter thoughts by content or tags
- Find related thoughts through references, branches, and tags
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed
- references: Array of thought numbers that this thought builds upon or references
- tags: Array of strings for categorizing and organizing this thought

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
11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached`,
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
        description: "Current thought number",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total thoughts needed",
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
      },
      references: {
        type: "array",
        items: {
          type: "integer",
          minimum: 1
        },
        description: "Array of thought numbers that this thought builds upon or references"
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of tags for categorizing and organizing this thought"
      }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

const GET_THOUGHT_TOOL: Tool = {
  name: "getThought",
  description: "Retrieve a specific thought by its number",
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: {
        type: "integer",
        minimum: 1,
        description: "The thought number to retrieve"
      }
    },
    required: ["thoughtNumber"]
  }
};

const SEARCH_THOUGHTS_TOOL: Tool = {
  name: "searchThoughts",
  description: "Search thoughts by content and/or tags",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query to match against thought content (empty string searches all)"
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of tags to filter by (thoughts must have all specified tags)"
      }
    },
    required: ["query"]
  }
};

const GET_RELATED_THOUGHTS_TOOL: Tool = {
  name: "getRelatedThoughts",
  description: "Find all thoughts related to a specific thought through references, branches, or shared tags",
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: {
        type: "integer",
        minimum: 1,
        description: "The thought number to find related thoughts for"
      }
    },
    required: ["thoughtNumber"]
  }
};

const server = new Server(
  {
    name: "sequential-thinking-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const thinkingServer = new SequentialThinkingServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SEQUENTIAL_THINKING_TOOL, GET_THOUGHT_TOOL, SEARCH_THOUGHTS_TOOL, GET_RELATED_THOUGHTS_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "sequentialthinking") {
      return thinkingServer.processThought(args);
    }

    if (name === "getThought") {
      const { thoughtNumber } = args as { thoughtNumber: number };
      const thought = thinkingServer.getThought(thoughtNumber);
      
      if (!thought) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Thought ${thoughtNumber} not found`,
              thoughtNumber
            }, null, 2)
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(thought, null, 2)
        }]
      };
    }

    if (name === "searchThoughts") {
      const { query, tags } = args as { query: string; tags?: string[] };
      const results = thinkingServer.searchThoughts(query, tags);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            tags,
            results: results.length,
            thoughts: results
          }, null, 2)
        }]
      };
    }

    if (name === "getRelatedThoughts") {
      const { thoughtNumber } = args as { thoughtNumber: number };
      const related = thinkingServer.getRelatedThoughts(thoughtNumber);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber,
            relatedCount: related.length,
            relatedThoughts: related
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `Unknown tool: ${name}`
      }],
      isError: true
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          tool: name
        }, null, 2)
      }],
      isError: true
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
