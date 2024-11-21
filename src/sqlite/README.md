# SQLite MCP Server

## Overview
A Model Context Protocol (MCP) server implementation that provides database interaction and business intelligence capabilities through SQLite. This server enables running SQL queries, analyzing business data, and automatically generating business insight memos that can be enhanced with Claude's analysis when an Anthropic API key is provided.

## Components

### Resources
The server exposes a single dynamic resource:
- `memo://insights`: A continuously updated business insights memo that aggregates discovered insights during analysis
  - Auto-updates as new insights are discovered via the append-insight tool
  - Optional enhancement through Claude for professional formatting (requires Anthropic API key)

### Prompts
The server provides a demonstration prompt:
- `mcp-demo`: Interactive prompt that guides users through database operations
  - Required argument: `topic` - The business domain to analyze
  - Generates appropriate database schemas and sample data
  - Guides users through analysis and insight generation
  - Integrates with the business insights memo

### Tools
The server offers six core tools:

#### Query Tools
- `read-query`: Execute SELECT queries on the database
- `write-query`: Execute INSERT, UPDATE, or DELETE queries
- `create-table`: Create new database tables

#### Schema Tools
- `list-tables`: Get a list of all tables in the database
- `describe-table`: View the schema of a specific table

#### Analysis Tools
- `append-insight`: Add new business insights to the memo resource

## Installation

```bash
# Required: Python 3.10+
python -m pip install mcp-sqlite-server

# Run with default settings
mcp-sqlite-server

# Run with custom database and Anthropic integration
mcp-sqlite-server --db-path ~/analysis.db --anthropic-key sk-xxx
```
