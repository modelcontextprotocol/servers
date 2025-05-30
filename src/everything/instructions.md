# Everything Server

This is a comprehensive MCP server that demonstrates all major MCP features and capabilities.

## Available Tools

- **echo**: Echo back any message
- **add**: Add two numbers together
- **longRunningOperation**: Demonstrate progress notifications with configurable duration and steps
- **printEnv**: Display all environment variables for debugging server configuration
- **sampleLLM**: Request LLM sampling from the client with a custom prompt
- **getTinyImage**: Return a small example image in PNG format
- **annotatedMessage**: Show how content annotations work for different message types
- **getResourceReference**: Return an embedded resource reference by ID (1-100)

## Available Resources

- Static resources numbered 1-100 accessible via `test://static/resource/{id}`
- Even-numbered resources contain plain text, odd-numbered contain binary data
- Resources support subscription for real-time updates every 10 seconds
- Resource templates allow dynamic URI construction

## Available Prompts

- **simple_prompt**: Basic prompt without arguments
- **complex_prompt**: Advanced prompt with temperature and style arguments, includes image content
- **resource_prompt**: Prompt that embeds a specific resource by ID

## Features

- Pagination support for large resource lists
- Argument completion for prompt parameters and resource IDs
- Progress notifications for long-running operations
- Configurable logging levels with automatic log message generation
- Resource subscription system with periodic update notifications
- LLM sampling integration for server-initiated model requests
- Content annotations for priority and audience targeting

Use this server to test MCP client implementations and explore all protocol features.
