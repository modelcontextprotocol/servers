#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";

// Get search pattern from command line arguments or use default
const searchPattern = process.argv[2] || "test";
console.log(`Will search for files matching pattern: "${searchPattern}"`);

// Create a test directory
const testDir = "/Users/menepet/Development/mcp-servers/test";
const serverPath = "../../src/filesystem/dist/index.js";

console.log("Starting server with path:", serverPath);
console.log("Test directory:", testDir);

// Start the MCP filesystem server
const server = spawn(
	"node",
	[serverPath, testDir, "/Users/menepet/Downloads/Decode+/TEST PDFS"],
	{
		stdio: "pipe",
	},
);

// Create readline interfaces for reading server output
const stdoutReader = createInterface({
	input: server.stdout,
	crlfDelay: Number.POSITIVE_INFINITY,
});

const stderrReader = createInterface({
	input: server.stderr,
	crlfDelay: Number.POSITIVE_INFINITY,
});

// Handle server stdout
stdoutReader.on("line", (line) => {
	console.log("Server stdout:", line);

	try {
		// Try to parse as JSON
		const response = JSON.parse(line);
		console.log("\nParsed Server Response:");
		if (response.content?.[0]?.text) {
			const responseText = response.content[0].text;
			console.log("Server response text:");
			console.log(responseText);

			// Format search results nicely if they exist
			if (responseText !== "No matches found") {
				const files = responseText.split("\n");
				console.log(
					`\nFound ${files.length} file(s) matching "${searchPattern}":`,
				);
				files.forEach((file: string, index: number) => {
					console.log(`${index + 1}. ${file}`);
				});
			} else {
				console.log(`\nNo files found matching "${searchPattern}"`);
			}
		} else {
			console.log("Unexpected response format:", response);
		}
	} catch (error) {
		// Not JSON, just log it
	}
});

// Handle server stderr
stderrReader.on("line", (line) => {
	console.log("Server stderr:", line);
	if (line.includes("Secure MCP Filesystem Server running on stdio")) {
		console.log("Server started successfully");

		// Wait a moment to ensure the server is fully initialized
		setTimeout(sendSearchRequest, 500);
	}
});

// Handle server exit
server.on("close", (code) => {
	console.log(`Server exited with code ${code}`);
	process.exit();
});

// Function to send a search request
function sendSearchRequest() {
	console.log(
		`\nSending search_files request for pattern: "${searchPattern}"...`,
	);

	// Create a search request - Use an ID to track this request
	const requestId = `req-${Date.now()}`;
	const request = {
		jsonrpc: "2.0",
		id: requestId,
		method: "call_tool",
		params: {
			name: "search_files",
			arguments: {
				path: ".",
				pattern: searchPattern,
				excludePatterns: ["node_modules", "dist"],
			},
		},
	};

	// Send it to the server with proper MCP header format
	const requestJson = JSON.stringify(request);
	const messageHeader = `Content-Length: ${Buffer.byteLength(requestJson, "utf8")}\r\n\r\n`;

	console.log("Sending request with header:");
	console.log(`Header: ${messageHeader.replace(/\r\n/g, "\\r\\n")}`);
	console.log(`Body: ${requestJson}`);

	// Write header followed by JSON body
	server.stdin.write(messageHeader);
	server.stdin.write(requestJson);
}

// Function to manually search for files (fallback)
function searchFilesManually(
	dir: string,
	pattern: string,
	excludePatterns: string[],
): string[] {
	const results: string[] = [];

	function searchDir(currentDir: string, relativePath = "") {
		const files = fs.readdirSync(currentDir);

		for (const file of files) {
			const fullPath = path.join(currentDir, file);
			const relPath = path.join(relativePath, file);

			// Check if path should be excluded
			const shouldExclude = excludePatterns.some(
				(pattern) => relPath.includes(pattern) || file === pattern,
			);

			if (shouldExclude) {
				continue;
			}

			// Check if file matches pattern
			if (file.toLowerCase().includes(pattern.toLowerCase())) {
				results.push(fullPath);
			}

			// If directory, search recursively
			try {
				const stat = fs.statSync(fullPath);
				if (stat.isDirectory()) {
					searchDir(fullPath, relPath);
				}
			} catch (error) {
				// Skip if can't access
			}
		}
	}

	searchDir(dir);
	return results;
}

// Handle unexpected errors
process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
	server.kill();
	process.exit(1);
});

// Cleanup on exit
process.on("SIGINT", () => {
	server.kill();
	process.exit();
});
