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

interface Match {
	file: string;
	lineNumber: number;
	line: string;
}

// Get command line arguments
const searchPattern = process.argv[2] || "function";
const searchDirectory = process.argv[3] || ".";
console.log(
	`Will search for pattern "${searchPattern}" inside files in directory: "${searchDirectory}"`,
);

// Define server paths
const testDir = "/Users/menepet/Development/mcp-servers/test";
const pdfDir = "/Users/menepet/Downloads/Decode+/TEST PDFS";
const serverPath = path.resolve("../../src/filesystem/dist/index.js");

console.log("Starting MCP client using SDK...");
console.log("Server path:", serverPath);
console.log("Base directories:", [testDir, pdfDir]);

async function runContentSearch() {
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
			name: "mcp-filesystem-content-search",
			version: "1.0.0",
		});

		// Connect to the server
		console.log("Connecting to server...");
		await client.connect(transport);
		console.log("Connected to server successfully!");

		// First, find all files in the target directory
		console.log(`\nFinding files in directory "${searchDirectory}"...`);
		const listResult = (await client.callTool({
			name: "list_directory",
			arguments: {
				path: searchDirectory,
			},
		})) as ToolCallResponse;

		if (!listResult.content?.[0]?.text) {
			throw new Error("Failed to list directory contents");
		}

		// Extract file paths from the directory listing
		const dirContents = listResult.content[0].text.split("\n");
		const filePaths = dirContents
			.filter((line) => line.startsWith("[FILE]"))
			.map((line) => line.substring(7).trim())
			.filter((filename) => {
				// Filter out binary files and focus on text files
				const ext = path.extname(filename).toLowerCase();
				return [
					".ts",
					".js",
					".json",
					".md",
					".txt",
					".html",
					".css",
					".yaml",
					".yml",
				].includes(ext);
			});

		console.log(`Found ${filePaths.length} text files to search in.`);

		// Create the full file paths
		const fullPaths = filePaths.map((file) =>
			path.isAbsolute(file) ? file : path.join(searchDirectory, file),
		);

		// Create array to store matches
		const matches: Match[] = [];

		// Search inside each file
		console.log(`\nSearching for "${searchPattern}" inside files...`);

		for (const filePath of fullPaths) {
			try {
				// Read the file content
				const readResult = (await client.callTool({
					name: "read_file",
					arguments: {
						path: filePath,
					},
				})) as ToolCallResponse;

				if (!readResult.content?.[0]?.text) {
					console.log(`Could not read file: ${filePath}`);
					continue;
				}

				const content = readResult.content[0].text;

				// Search for the pattern in the content
				const regex = new RegExp(searchPattern, "gi");
				let lineNumber = 1;
				const lines = content.split("\n");

				for (const line of lines) {
					regex.lastIndex = 0; // Reset regex for each line
					if (regex.test(line)) {
						matches.push({
							file: filePath,
							lineNumber,
							line: line.trim(),
						});
					}
					lineNumber++;
				}
			} catch (error) {
				console.log(`Error processing file ${filePath}: ${error}`);
			}
		}

		// Display results
		if (matches.length > 0) {
			console.log(`\nFound ${matches.length} matches for "${searchPattern}":`);

			// Group matches by file
			const groupedMatches = matches.reduce(
				(acc, match) => {
					if (!acc[match.file]) {
						acc[match.file] = [];
					}
					acc[match.file].push(match);
					return acc;
				},
				{} as Record<string, Match[]>,
			);

			// Display matches by file
			for (const [file, fileMatches] of Object.entries(groupedMatches)) {
				console.log(`\n${file} (${fileMatches.length} matches):`);
				for (const match of fileMatches) {
					console.log(`  Line ${match.lineNumber}: ${match.line}`);
				}
			}
		} else {
			console.log(`\nNo matches found for "${searchPattern}" in any files.`);
		}

		// Clean up and exit
		console.log("\nSearch completed successfully!");
		process.exit(0);
	} catch (error) {
		console.error("Error during search:", error);
		process.exit(1);
	}
}

// Run the content search
runContentSearch().catch((error) => {
	console.error("Unhandled error:", error);
	process.exit(1);
});
