#!/usr/bin/env node

/**
 * Test script for the Templates and Patterns enhancement
 * 
 * This script demonstrates how to use the Templates and Patterns enhancement
 * for the Sequential Thinking tool.
 * 
 * To run this script:
 * 1. Build the TypeScript files: npm run build
 * 2. Run this script: node dist/test-templates.js
 */

import { exampleUsage } from './template-integration-example.js';

// Run the example usage
console.log('=== Templates and Patterns Enhancement Demo ===\n');
exampleUsage();
console.log('\n=== Demo Complete ===');

/**
 * In a real application, you would integrate the Templates and Patterns enhancement
 * with the Sequential Thinking server. Here's an example of how you might do that:
 * 
 * ```typescript
 * import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 * import { integrateTemplatesWithServer } from './template-integration-example.js';
 * 
 * async function runServer() {
 *   const server = new Server(
 *     {
 *       name: "sequential-thinking-server",
 *       version: "0.5.0", // Updated version to reflect new enhancements
 *     },
 *     {
 *       capabilities: {
 *         tools: {},
 *       },
 *     }
 *   );
 * 
 *   const thinkingServer = new SequentialThinkingServer();
 * 
 *   // Integrate the Templates and Patterns enhancement
 *   integrateTemplatesWithServer(server, thinkingServer);
 * 
 *   const transport = new StdioServerTransport();
 *   await server.connect(transport);
 *   console.error("Sequential Thinking MCP Server running on stdio");
 * }
 * 
 * runServer().catch((error) => {
 *   console.error("Fatal error running server:", error);
 *   process.exit(1);
 * });
 * ```
 */
