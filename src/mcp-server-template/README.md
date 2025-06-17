# MCP Template Server

> **General:** This repository serves as a template for creating new MCP (Model Context Protocol) servers.
> It provides a basic structure and examples for implementing MCP-compatible microservices.

## Overview

This template demonstrates how to create a microservice that exposes functionality through the Model Context Protocol (MCP). It includes a basic calculator service as an example implementation.

## MCP Tools: 


1. `calculate`
    - **Description:** Performs basic arithmetic calculations
    - **Input:**
        - Operand (Literal["add", "subtract", "multiply", "divide"])
        - Variable 1 (float)
        - Variable 2 (float)
    - **Output:** A string containing the calculated result


## Requirements

- Python 3.12+
- UV (for dependency management)
- Docker (optional, for containerization)

## Setup

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd mcp-server-template
   ```

2. **Create `.env` File based on `.env.example`**:
   ```dotenv
   # Example environment variables
   MCP_CALCULATOR_HOST="0.0.0.0"
   MCP_CALCULATOR_PORT=8000
   LOGGING_LEVEL="info"
   ```

3. **Install Dependencies**:
   ```bash
   uv sync .
   ```

## Running the Server

### Locally

```bash
# Basic run
python -m mcp_server_calculator

# Custom port and host
python -m mcp_server_calculator --host 0.0.0.0 --port 8000
```

### Using Docker

```bash
# Build the image
docker build -t mcp-server-calculator .

# Run the container
docker run --rm -it -p 8000:8000 --env-file .env mcp-server-calculator
```

## Example Client
When server startup is completed, any MCP client
can utilize connection to it


This example shows how to use the calculator service with a LangGraph ReAct agent:

```python
import os
import asyncio
from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

async def main():
    # Load environment variables from .env, should contain OPENAI_API_KEY
    load_dotenv()
    
    # Initialize LLM
    model = ChatOpenAI(model="gpt-4")
    
    # Connect to MCP server
    async with MultiServerMCPClient({
        "calculate": {
            "url": "http://localhost:8000/sse",
            "transport": "sse",
        }
    }) as client:
        # Get available tools
        tools = client.get_tools()
        
        # !! IMPORTANT : Get tools and modify them to have return_direct=True!!! 
        # Otherwise langgraph agent could fall in an eternal loop,
        # ignoring tool results
        tools: list[StructuredTool] = client.get_tools()
        for tool in tools:
            tool.return_direct = True

        # Use case 1: Create agent with tools
        agent = create_react_agent(model, tools)
        
        # Example query using the calculator
        response = await agent.ainvoke({
            "messages": [{
                "role": "user",
                "content": "What is 15% of 850, rounded to 2 decimal places?"
            }]
        })
        
        print(response["messages"][-1].content)

        # Use case 2: Run tool directly: 
        
        
        # !IMPORTANT
        # Always set tool_call_id to some value: otherwise 
        # tool cool would not return any artifacts beyond text
        # https://github.com/langchain-ai/langchain/issues/29874
        result: ToolMessage = await tool.arun(parameters, 
                                              response_format='content_and_artifact',  
                                              tool_call_id=uuid.uuid4())
        print("Tool result:", result)

if __name__ == "__main__":
    asyncio.run(main())
```

## Project Structure

```
mcp-server-template/
├── src/
│   └── mcp_server_calculator/
        └── calculator/ # Contains all the business logic 
            ├── __init__.py # Exposes all needed functionality to server.py  
            ├── config.py # Contains module env settings, custom Error classes 
            ├── module.py # Business module core logic
│       ├── __init__.py
│       ├── __main__.py # Contains uvicorn server setup logic
│       ├── logging_config.py # Contains shared logging configuration
│       ├── server.py # Contains tool schemas/definitions, sets MCP server up
├── .env.example
├── .gitignore
├── Dockerfile
├── LICENSE
├── pyproject.toml
├── README.md
└── uv.lock
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT
