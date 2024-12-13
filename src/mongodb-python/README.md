# mcp-server-mongodb: A MongoDB MCP server

## Overview

A Model Context Protocol server for MongoDB database interaction and analysis. This server provides tools to analyze, query, and extract insights from MongoDB databases via Large Language Models.

### Tools

1. `describe-schema`
   - Analyzes and describes the schema of a MongoDB collection
   - Input:
     - `collection` (string): Name of the collection to analyze
     - `sampleSize` (number, optional): Number of documents to sample (default: 100, max: 1000)
     - `includeIndexes` (boolean, optional): Include collection index information (default: true)
   - Returns: Detailed schema analysis including field types, sample values, indexes, and collection statistics

2. `list-collections`
   - Lists all collections in the MongoDB database
   - Input: None required
   - Returns: Array of collection names

3. `aggregate`
   - Runs a MongoDB aggregation pipeline
   - Inputs:
     - `collection` (string): Name of the collection to query
     - `pipeline` (array): MongoDB aggregation pipeline stages
     - `options` (object, optional):
       - `allowDiskUse` (boolean): Allow writing to temporary files
       - `maxTimeMS` (number): Maximum execution time in milliseconds
       - `comment` (string): Optional comment to help trace operations
   - Returns: Results of the aggregation pipeline

4. `explain`
   - Gets the execution plan for an aggregation pipeline
   - Inputs:
     - `collection` (string): Name of the collection to analyze
     - `pipeline` (array): MongoDB aggregation pipeline stages to analyze
     - `verbosity` (string, optional): Level of detail in execution plan (default: "queryPlanner")
       - Options: "queryPlanner", "executionStats", "allPlansExecution"
   - Returns: Detailed execution plan for the pipeline

## Installation

First, make sure you have Claude for Desktop installed. You can install the latest version [here](https://github.com/anthropic-dev/claude-desktop/releases/latest).

Next, open your Claude for Desktop App configuration file in a text editor:

### MacOS/Linux
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Windows
```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

Add this configuration (replace the path with the absolute path to your servers/src/mongodb-python directory):

```json
{
  "mcpServers": {
    "mongodb-python": {
      "command": "uv",
      "args": [
        "--directory",
        "/ABSOLUTE/PATH/TO/servers/src/mongodb-python",
        "run",
        "mcp-server-mongodb"
      ],
      "env": {
        "MONGODB_URI": "<YOUR_MONGODB_URI>", // e.g. mongodb://localhost:27017
        "MONGODB_DB_NAME": "<YOUR_DB_NAME>"
      }
    }
  }
}
```

This tells Claude for Desktop:
- There's an MCP server named "mongodb-python"
- Launch it by running `uv --directory /ABSOLUTE/PATH/TO/servers/src/mongodb-python run mcp-server-mongodb`
- Connect to MongoDB using the connection string specified in the `MONGODB_URI` environment variable

Save the file, and restart Claude for Desktop.

### Configuration Options

- MongoDB connection is configured via environment variables:
  - `MONGODB_URI`: MongoDB [connection string](https://www.mongodb.com/docs/manual/reference/connection-string/) (required)
    - Format: `mongodb://[username:password@]host[:port][/database][?options]`
    - Example: `mongodb://localhost:27017`
  - `MONGODB_DB_NAME`: The name of the database to use

## Security Considerations

- Use connection strings with authentication when connecting to production databases
- Avoid exposing sensitive connection details in configuration files
- Consider using environment variables for sensitive configuration
- Review MongoDB's [security checklist](https://www.mongodb.com/docs/manual/administration/security-checklist/) for additional security measures
- Ensure proper [access controls](https://www.mongodb.com/docs/manual/tutorial/enable-authentication/) are set up in your MongoDB instance if running your own managed MongoDB server

## Debugging

You can use the MCP inspector to debug the server:

```bash
cd path/to/servers/src/mongodb-python
npx @modelcontextprotocol/inspector uv run mcp-server-mongodb
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.