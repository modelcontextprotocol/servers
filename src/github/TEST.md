# GitHub MCP Server Test

This directory contains a test script for the GitHub MCP server, which validates its core functionality.

## Test Summary

The test script (`test.js`) validates:

1. **Authentication**: Checks if GitHub CLI authentication is available
2. **List Tools**: Verifies the server can list all available tools
3. **Repository Search**: Tests searching for GitHub repositories
4. **File Content Retrieval**: Tests retrieving file contents from a repository

## Running Tests

Make sure you've built the server first:

```bash
npm install
npm run build
```

Then run the test:

```bash
node test.js
```

## Authentication

For complete testing, authenticate with GitHub CLI:

```bash
gh auth login
```

## Test Results

A successful test run will show:

- ✅ Tools listing test passed
- ✅ Repository search test passed
- ✅ Get file contents test passed (if authenticated)

## Troubleshooting

If tests fail:

1. Make sure the server is built correctly (`npm run build`)
2. Check GitHub CLI authentication status (`gh auth status`)
3. Verify network connectivity to GitHub API