# Stagehand MCP Server

A Model Context Protocol (MCP) server that provides AI-powered web automation capabilities using [Stagehand](https://github.com/browserbase/stagehand). This server enables LLMs to interact with web pages, perform actions, extract data, and observe possible actions in a real browser environment.

## Components

### Tools

- **stagehand_navigate**
  - Navigate to any URL in the browser
  - Input:
    - `url` (string): The URL to navigate to

- **stagehand_act**
  - Perform an action on the web page
  - Inputs:
    - `action` (string): The action to perform (e.g., "click the login button")
    - `variables` (object, optional): Variables used in the action template

- **stagehand_extract**
  - Extract data from the web page based on an instruction and schema
  - Inputs:
    - `instruction` (string): Instruction for extraction (e.g., "extract the price of the item")
    - `schema` (object): JSON schema for the extracted data

- **stagehand_observe**
  - Observe actions that can be performed on the web page
  - Input:
    - `instruction` (string, optional): Instruction for observation

## Key Features

- AI-powered web automation
- Perform actions on web pages
- Extract structured data from web pages
- Observe possible actions on web pages
- Simple and extensible API
- Model-agnostic support for various LLM providers

## Configuration to Use Stagehand Server

### Installation

First, install the Stagehand MCP server package globally:

```bash
npm install -g @modelcontextprotocol/server-stagehand
```

### Setup

Here's how to configure your application to use the Stagehand server:

```json
{
  "mcpServers": {
    "stagehand": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-stagehand"]
    }
  }
}
```

## License

Licensed under the MIT License.

Copyright 2024 Browserbase, Inc.

