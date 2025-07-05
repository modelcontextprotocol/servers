# MCP YouTube Server

> **General:** This repository implements an MCP (Model Context Protocol) server for YouTube search and transcript retrieval functionality.
> It allows language models or other agents to easily query YouTube content through a standardized protocol.

## Overview

This project provides a microservice that exposes YouTube video searching and transcript retrieval functionality through the Model Context Protocol (MCP). It uses the YouTube Data API v3 for searching videos and the `youtube-transcript-api` library for retrieving transcripts.

## MCP Tools:

1. `youtube_search_and_transcript`
    - **Description:** Searches YouTube for videos and retrieves their transcripts
    - **Input:**
        - `query` (string, required): The search query string for YouTube videos
        - `max_results` (integer, optional, default: 3, min: 1, max: 20): Maximum number of video results
        - `transcript_language` (string, optional, default: 'en'): Desired transcript language code
    - **Output:** A string containing formatted results with video details and transcripts


## Requirements

- Python 3.12+
- uv (for dependency management)
- Docker (optional, for containerization)
- YouTube Data API Key

## Setup

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd mcp-server-youtube
   ```

2. **Create `.env` File**:
   ```dotenv
   YOUTUBE_API_KEY="YOUR_YOUTUBE_API_KEY_HERE"
   MCP_YOUTUBE_HOST="127.0.0.1"
   MCP_YOUTUBE_PORT=8000
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
python -m mcp_server_youtube

# Custom port and host
python -m mcp_server_youtube --host 0.0.0.0 --port 8000
```

### Using Docker

```bash
# Build the image
docker build -t mcp-server-youtube .

# Run the container
docker run --rm -it -p 8000:8000 --env-file .env mcp-server-youtube
```

## Example Client

This example demonstrates using the YouTube service with a LangGraph ReAct agent:

```python
import os
import asyncio
from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

async def main():
    # Load environment variables
    load_dotenv()
    
    # Initialize LLM
    model = ChatOpenAI(model="gpt-4")
    
    # Connect to MCP server
    async with MultiServerMCPClient({
        "youtube_search_and_transcript": {
            "url": "http://localhost:8000/sse",
            "transport": "sse",
        }
    }) as client:
        # Get available tools
        tools = client.get_tools()
        
        # Create ReAct agent
        agent = create_react_agent(model, tools)
        
        # Example query
        response = await agent.ainvoke({
            "messages": [{
                "role": "user",
                "content": "Find recent videos about quantum computing breakthroughs"
            }]
        })
        
        print(response["messages"][-1].content)

if __name__ == "__main__":
    asyncio.run(main())
```

## Project Structure

```
mcp-server-youtube/
├── src/
│   └── mcp_server_youtube/
│       └── youtube/
│           ├── __init__.py
│           ├── config.py
│           ├── module.py
│       ├── __init__.py
│       ├── __main__.py
│       ├── logging_config.py
│       ├── server.py
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