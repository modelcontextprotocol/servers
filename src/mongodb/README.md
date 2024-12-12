# MongoDB MCP Server

A Model Context Protocol server that provides read-only access to MongoDB databases. This server enables LLMs to inspect collection schemas and execute aggregation pipelines.

## Components

### Tools

- **aggregate**
  - Execute MongoDB aggregation pipelines against the connected database
  - Input:
    - `collection` (string): The collection to query
    - `pipeline` (array): MongoDB aggregation pipeline stages
    - `options` (object): Optional aggregation settings
      - `allowDiskUse` (boolean): Allow operations that require disk usage
      - `maxTimeMS` (number): Maximum execution time in milliseconds
      - `comment` (string): Comment to identify the operation
  - Default limit of 1000 documents if no limit stage is specified
  - Default timeout of 30 seconds

- **explain**
  - Get execution plans for aggregation pipelines
  - Input:
    - `collection` (string): The collection to analyze
    - `pipeline` (array): MongoDB aggregation pipeline stages
    - `verbosity` (string): Detail level of the explanation
      - Options: "queryPlanner", "executionStats", "allPlansExecution"
      - Default: "queryPlanner"

### Resources

The server provides schema information for each collection in the database:

- **Collection Schemas** (`mongodb://<host>/<collection>/schema`)
  - Inferred JSON schema information for each collection
  - Includes field names and data types
  - Schema is derived from sampling collection documents

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

```json
"mongodb": {
      "command": "npx",
      "args": [
        "-y" ,
        "@modelcontextprotocol/server-mongodb"
      ],
     "env" : {
	"MONGODB_URI" : "mongodb+srv://<yourcluster>" // 'mongodb://localhost:27017'
	}
    }
```

Replace `mydb` with your database name and adjust the connection string as needed.

## Example Usage

### Basic Aggregation

```javascript
{
  "collection": "users",
  "pipeline": [
    { "$match": { "age": { "$gt": 21 } } },
    { "$group": {
      "_id": "$city",
      "avgAge": { "$avg": "$age" },
      "count": { "$sum": 1 }
    }},
    { "$sort": { "count": -1 } },
    { "$limit": 10 }
  ],
  "options": {
    "allowDiskUse": true,
    "maxTimeMS": 60000,
    "comment": "City-wise user statistics"
  }
}
```

### Query Explanation

```javascript
{
  "collection": "users",
  "pipeline": [
    { "$match": { "age": { "$gt": 21 } } },
    { "$sort": { "age": 1 } }
  ],
  "verbosity": "executionStats"
}
```

## Safety Features

- Automatic limit of 1000 documents if no limit is specified in the pipeline
- Default timeout of 30 seconds for all operations
- Read-only operations only
- Safe schema inference from collection samples

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.