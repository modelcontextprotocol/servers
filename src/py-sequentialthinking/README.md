# Sequential Thinking MCP Server
<subtitler>_Now in Python!_</subtitle>

A Python MCP server implementation that provides a tool for dynamic and reflective problem-solving through a structured thinking process. Adapted from the identically named project by Anthropic, PBC (https://anthropic.com).

## Features

- Break down complex problems into manageable steps
- Revise and refine thoughts as understanding deepens
- Branch into alternative paths of reasoning
- Adjust the total number of thoughts dynamically
- Generate and verify solution hypotheses

## Tool

### sequential_thinking

Facilitates a detailed, step-by-step thinking process for problem-solving and analysis.

**Inputs:**
- `thought` (string): The current thinking step
- `next_thought_needed` (boolean): Whether another thought step is needed
- `thought_number` (integer): Current thought number
- `total_thoughts` (integer): Estimated total thoughts needed
- `is_revision` (boolean, optional): Whether this revises previous thinking
- `revises_thought` (integer, optional): Which thought is being reconsidered
- `branch_from_thought` (integer, optional): Branching point thought number
- `branch_id` (string, optional): Branch identifier
- `needs_more_thoughts` (boolean, optional): If more thoughts are needed

## Usage

The Sequential Thinking tool is designed for:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

## Installation

Install the package using pip:

```bash
pip install sequentialthinking
```

Or using uv:

```bash
uv add sequentialthinking
```

## Running the Server

Run the server using Python's module execution:

```bash
python -m sequentialthinking
```

This will start the FastAPI server on port 6201.

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sequentialthinking": {
      "command": "python",
      "args": [
        "-m",
        "sequentialthinking"
      ]
    }
  }
}
```

## Building

Docker:

```bash
docker build -t sequentialthinking -f Dockerfile .
```

## Project Structure

- `pyproject.toml`: Project metadata and build configuration
- `requirements.txt`: List of project dependencies
- `Dockerfile`: Instructions for building the Docker image
- `src/sequentialthinking/index.py`: Main FastAPI application
- `src/sequentialthinking/__main__.py`: Package entry point
- `src/sequentialthinking/__init__.py`: Exposes the FastAPI app for importing

## Differences from Node.js Version

This Python version of the Sequential Thinking MCP server differs from the original Node.js version in the following ways:

- Uses the `[project]` tags in `pyproject.toml` for metadata instead of the Poetry-specific sections
- Lists dependencies in a separate `requirements.txt` file
- Installs dependencies using pip in the Dockerfile
- Runs the server using `python -m sequentialthinking`
- Has a package entry point in `__main__.py`
- Exposes the FastAPI app in `__init__.py`

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
