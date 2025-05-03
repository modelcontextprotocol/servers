#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";

// Define types based on MCP SDK response
interface TextContent {
	type: "text";
	text: string;
}

interface ToolCallResponse {
	content?: Array<TextContent>;
	isError?: boolean;
}

// Get search pattern from command line arguments or use default
const searchPattern = process.argv[2] || "test";
console.log(`Will search for files matching pattern: "${searchPattern}"`);

// Define server paths
const testDir = "/Users/menepet/Development/mcp-servers/test";
const pdfDir = "/Users/menepet/Downloads/Decode+/TEST PDFS";
const serverPath = path.resolve("../../src/filesystem/dist/index.js");

console.log("Starting MCP client using SDK...");
console.log("Server path:", serverPath);
console.log("Test directories:", [testDir, pdfDir]);

async function runTest() {
	try {
		// Create the client transport
		const transport = new StdioClientTransport({
			command: "node",
			args: [serverPath, testDir, pdfDir],
			// Only include environment variables that are strings (not undefined)
			env: Object.fromEntries(
				Object.entries(process.env).filter(([_, v]) => v !== undefined),
			) as Record<string, string>,
		});

		// Create the client
		const client = new Client({
			name: "mcp-filesystem-test-client",
			version: "1.0.0",
		});

		// Connect to the server
		console.log("Connecting to server...");
		await client.connect(transport);
		console.log("Connected to server successfully!");

		// List available tools
		console.log("\nListing available tools...");
		const tools = await client.listTools();
		console.log(`Found ${tools.tools.length} available tools:`);
		for (const tool of tools.tools) {
			const description = tool.description || "No description available";
			console.log(`- ${tool.name}: ${description.substring(0, 80)}...`);
		}

		// Search for files
		console.log(`\nSearching for files matching "${searchPattern}"...`);
		const result = (await client.callTool({
			name: "search_files",
			arguments: {
				path: ".",
				pattern: searchPattern,
				excludePatterns: ["node_modules", "dist"],
			},
		})) as ToolCallResponse;

		// Display results
		if (result.content && result.content.length > 0 && result.content[0].text) {
			const responseText = result.content[0].text;
			console.log("\nSearch Results:");

			if (responseText !== "No matches found") {
				const files = responseText.split("\n");
				console.log(
					`Found ${files.length} file(s) matching "${searchPattern}":`,
				);
				files.forEach((file: string, index: number) => {
					console.log(`${index + 1}. ${file}`);
				});
			} else {
				console.log(`No files found matching "${searchPattern}"`);
			}
		} else {
			console.log("Unexpected response format:", result);
		}

		// Clean up and exit
		console.log("\nTest completed successfully!");
		process.exit(0);
	} catch (error) {
		console.error("Error during test:", error);
		process.exit(1);
	}
}

// Run the test
runTest().catch((error) => {
	console.error("Unhandled error:", error);
	process.exit(1);
});
