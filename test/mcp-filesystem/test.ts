#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ChildProcess } from "node:child_process";
import type { Interface } from "node:readline";

interface MCPRequest {
	type: string;
	params: {
		name: string;
		arguments: Record<string, unknown>;
	};
}

// Create a test directory

const testDir: string = "/Users/menepet/Development/mcp-servers/test";
const serverPath: string = "../../src/filesystem/dist/index.js";

// Start the MCP filesystem server
const server: ChildProcess = spawn("node", [serverPath, testDir], {
	stdio: ["pipe", "pipe", "pipe"],
});

if (!server.stdin || !server.stdout || !server.stderr) {
	throw new Error("Failed to create server process with proper stdio");
}

// Create readline interface for reading server output
const rl: Interface = createInterface({
	input: server.stdout,
	output: process.stdout,
});

// Handle server errors
server.stderr.on("data", (data: Buffer) => {
	const message = data.toString();
	console.log("Server error:", message);
	if (message.includes("Secure MCP Filesystem Server running on stdio")) {
		console.log("Server started successfully");
	} else {
		console.error(`Server error: ${message}`);
	}
});

// Handle server exit
server.on("close", (code: number | null) => {
	console.log(`Server exited with code ${code}`);
});

// Wait for server to be ready
await new Promise((resolve) => setTimeout(resolve, 1000));

// Example MCP request for searching files
const searchRequest: MCPRequest = {
	type: "call_tool",
	params: {
		name: "search_files",
		arguments: {
			path: testDir,
			pattern: "test", // Search for files containing 'test' in their name
			excludePatterns: ["node_modules"], // Exclude node_modules directory
		},
	},
};

console.log("\nSending search request...");
console.log('Searching for files containing "test" in:', testDir);

// Send request to server
server.stdin.write(`${JSON.stringify(searchRequest)}\n`);

// Handle server responses
rl.on("line", (line: string) => {
	try {
		const response = JSON.parse(line);
		console.log("\nSearch Results:");
		if (response.content?.[0]?.text) {
			const results = response.content[0].text.split("\n");
			if (results.length === 1 && results[0] === "No matches found") {
				console.log("No files found matching the search pattern");
			} else {
				for (const result of results) {
					console.log(`- ${result}`);
				}
			}
		} else {
			console.log("Unexpected response format:", response);
		}
	} catch (error) {
		console.error("Error parsing server response:", error);
	}
});

// Cleanup on exit
process.on("SIGINT", () => {
	server.kill();
	process.exit();
});
