#!/usr/bin/env node

import { spawn, ChildProcess } from "node:child_process";
import { createInterface, Interface } from "node:readline";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

interface MCPRequest {
	type: string;
	params: {
		name: string;
		arguments: Record<string, unknown>;
	};
}

interface TestOperation {
	name: string;
	args: Record<string, unknown>;
}

// Configuration
const testDir: string = "./test/mcp-filesystem/test-files";
const serverPath: string = "./src/filesystem/index.ts";

// Test operations
const testOperations: TestOperation[] = [
	{
		name: "create_directory",
		args: { path: "test-dir" },
	},
	{
		name: "write_file",
		args: {
			path: "test-dir/test.txt",
			content: "Hello, MCP!",
		},
	},
	{
		name: "read_file",
		args: { path: "test-dir/test.txt" },
	},
	{
		name: "list_directory",
		args: { path: "test-dir" },
	},
	{
		name: "get_file_info",
		args: { path: "test-dir/test.txt" },
	},
];

async function runTests(): Promise<void> {
	// Create test directory
	await mkdir(testDir, { recursive: true });

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
		console.error(`Server error: ${data}`);
	});

	// Handle server exit
	server.on("close", (code: number | null) => {
		console.log(`Server exited with code ${code}`);
	});

	// Handle server responses
	rl.on("line", (line: string) => {
		try {
			const response = JSON.parse(line);
			console.log("Server response:", response);
		} catch (error) {
			console.error("Error parsing server response:", error);
		}
	});

	// Run test operations
	for (const operation of testOperations) {
		const request: MCPRequest = {
			type: "call_tool",
			params: {
				name: operation.name,
				arguments: operation.args,
			},
		};

		console.log(`\nExecuting operation: ${operation.name}`);
		server.stdin.write(`${JSON.stringify(request)}\n`);

		// Add a small delay between operations
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	// Cleanup on exit
	process.on("SIGINT", () => {
		server.kill();
		process.exit();
	});
}

runTests().catch(console.error);
