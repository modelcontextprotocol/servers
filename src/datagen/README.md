# MCP Data Generation Server

## Overview
A Model Context Protocol server for generating synthetic data across various domains. Leverages open-source libraries like Faker, Mimesis, NumPy, and SDV to create realistic, customizable datasets.

## Tools

### generate_data
Generate synthetic data based on specified schemas and parameters.

**Input:**
- `rows` (integer, required): Number of rows to generate
- `tables` (array[string], required): List of table names to generate
- `schemas` (object, required): Schema definitions for each table
  - Table schema format:
    ```json
    {
      "column_name": {
        "type": "string|integer|float|category|boolean",
        "min": number,  // Optional, for numeric types
        "max": number,  // Optional, for numeric types
        "categories": ["value1", "value2"]  // Required for category type
      }
    }
    ```

**Returns:**
- Generated data tables matching the specified schemas

## Installation

Using `uv` (recommended):
```bash
uvx mcp-server-datagen
```

Using `pip`:
```bash
pip install mcp-server-datagen
```

## Configuration
No additional configuration required. The server automatically configures data generation libraries based on schema specifications.

## Development

1. Create virtual environment and install dependencies:
```bash
uv venv
uv pip install -e ".[dev]"
```

2. Run tests:
```bash
uv run pytest tests/unit/
```

3. Run type checking:
```bash
uv run --frozen pyright
```

4. Run linting:
```bash
uv run ruff check .
```

## Debugging

Common issues:
1. Null values in generated data
   - Ensure correct type specification in schema
   - Verify min/max values are within valid ranges
   - Check category lists are non-empty for categorical fields

2. Type validation errors
   - Verify schema types match supported types
   - Ensure numeric ranges are appropriate for the type

## License
MIT License
