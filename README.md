# Sequential Thinking MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/server-sequential-thinking.svg)](https://www.npmjs.com/package/server-sequential-thinking)

A Model Context Protocol (MCP) server implementation that enables dynamic, self-aware problem-solving through adaptive thought sequences. The server continuously evolves its understanding while maintaining context awareness, enhanced by powerful visualization and templating capabilities.

## Table of Contents
- [Features](#features)
- [Tools](#tools)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)
- [Links](#links)

## Features

- **Dynamic Problem Solving**: Break down complex problems into manageable thought sequences
- **Chain of Thought Reasoning**: Support for explicit reasoning steps with validation
- **Flexible Thinking Process**: Ability to revise, branch, and merge thought paths
- **Improved Token Estimation and Compression Metrics**: Enhanced accuracy in token estimation and compression ratio calculations, providing more reliable metrics for prompt optimization.
- **Visualization Support**: Generate visual representations of thinking processes
- **Template System**: Pre-built thinking patterns for common problem types
- **Confidence Scoring**: Evaluate hypotheses with confidence levels
- **Thought Process Persistence**: Save and resume thinking sessions
- **Branch Management**: Create and merge different lines of thinking
- **Validation Framework**: Verify chain of thought reasoning steps
- **Enhanced Context Awareness (New!)**:
    - **Long-Term Memory**: Utilizes a persistent LanceDB vector store (`~/.sequential-thinking/vector_store`) to retain and retrieve relevant information across sessions, enabling the AI to build upon past knowledge.
    - **Full Content Embeddings**: Generates semantic embeddings based on the full content of thoughts, rather than summaries, for more accurate relevance scoring and retrieval.
    - **Richer Prompt Context**: Injects more comprehensive context (including decompressed full content from relevant memories) into prompts for the underlying LLMs, providing better grounding for reasoning.
    - **Improved Retrieval Queries**: Uses the full text of the current thought/analysis/synthesis as the basis for querying both working memory and long-term memory, improving the relevance of retrieved context.

## Tools

### Sequential Thinking
A detailed tool for dynamic and reflective problem-solving that supports:

- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

The server leverages a synergistic multi-model AI system for intelligent processing:

- **Gemini**: Powers the core cognitive engine, handling complex reasoning and dynamic thought adaptation
- **Claude**: Orchestrates preprocessing and contextual optimization, ensuring optimal thought flow

These models work with specialized AI roles that actively enhance the thinking process:

- **AI Advisor**: Provides strategic guidance and next steps recommendations
- **Pattern Analyzer**: Identifies patterns and trends in thinking sequences
- **Issue Detector**: Proactively identifies potential problems in reasoning
- **Prompt Optimizer**: Refines and improves thinking prompts for better results

### Visualization
Generate visual representations of sequential thinking processes in formats like:
- Mermaid diagrams
- JSON structured output

### Templates
Access and utilize pre-built thinking templates for common problem patterns:
- List available templates
- Get template details
- Create sessions from templates
- Save custom templates

## Requirements

- Node.js 18.x or higher
- npm 7.x or higher
- An MCP-compatible client (e.g., Claude Desktop)

## Setup

This server requires API keys to function correctly.

1.  Create a `.env` file in the root directory of this project (`/Users/justincornelius/Downloads/servers`).
2.  Add your API keys to the `.env` file like this:

    ```
    OPENROUTER_API_KEY=your_openrouter_api_key_here
    OPENAI_API_KEY=your_openai_api_key_here
    ```

    *   `OPENROUTER_API_KEY`: Used for accessing Gemini and Claude models via OpenRouter for the core reasoning steps.
    *   `OPENAI_API_KEY`: Used for generating text embeddings (via `text-embedding-3-small`) if the embeddings feature is utilized. If not provided, a basic fallback embedding method will be used.

## Installation

```bash
npm install @modelcontextprotocol/sequential-thinking
```

## Quick Start

1. Start the server:
```bash
npx @modelcontextprotocol/sequential-thinking
```

2. Configure in your MCP client (e.g., Claude Desktop):
```json
{
  "mcpServers": {
    "sequentialthinking": {
      "command": "npx",
      "args": ["@modelcontextprotocol/sequential-thinking"]
    }
  }
}
```

3. The server is now ready to use with your MCP client!

## Examples

Here are some ways you can use the Sequential Thinking server:

```javascript
// Example 1: Break down a complex problem
const result = await mcpClient.useTool('sequentialthinking', {
  thought: "Let's break down the problem of optimizing a web application",
  thoughtNumber: 1,
  totalThoughts: 5
});

// Example 2: Generate a visualization
const diagram = await mcpClient.useTool('visualize_thinking', {
  format: 'mermaid'
});

// Example 3: Use a template for common patterns
const session = await mcpClient.useTool('create_from_template', {
  templateId: 'problem-analysis'
});
```

## Documentation

For detailed documentation on using the sequential thinking server, please visit the [sequentialthinking documentation](src/sequentialthinking/README.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [Homepage](https://modelcontextprotocol.io)
- [Report Issues](https://github.com/spotty118/servers/issues)
- [NPM Package](https://www.npmjs.com/package/server-sequential-thinking)
