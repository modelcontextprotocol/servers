# Sequential Thinking MCP Server

A Model Context Protocol (MCP) server implementation that enables dynamic and reflective problem-solving through thought sequences, with enhanced visualization and templating capabilities.

## Features

- **Dynamic Problem Solving**: Break down complex problems into manageable thought sequences
- **Chain of Thought Reasoning**: Support for explicit reasoning steps with validation
- **Flexible Thinking Process**: Ability to revise, branch, and merge thought paths
- **Visualization Support**: Generate visual representations of thinking processes
- **Template System**: Pre-built thinking patterns for common problem types
- **Confidence Scoring**: Evaluate hypotheses with confidence levels
- **Thought Process Persistence**: Save and resume thinking sessions
- **Branch Management**: Create and merge different lines of thinking
- **Validation Framework**: Verify chain of thought reasoning steps

## Tools

### Sequential Thinking
A detailed tool for dynamic and reflective problem-solving that supports:

- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

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

## Installation

```bash
npm install @modelcontextprotocol/server-sequentialthinking
```

## Usage

Start the server:

```bash
npx @modelcontextprotocol/server-sequentialthinking
```

Configure in your MCP client (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "sequentialthinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequentialthinking"]
    }
  }
}
```

## Documentation

For detailed documentation on using the sequential thinking server, please visit the `/src/sequentialthinking/README.md` file.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
