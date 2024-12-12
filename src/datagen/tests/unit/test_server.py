"""Unit tests for MCP data generation server."""
import pytest
from typing import Dict
from mcp_server_datagen.server import DataGenServer


@pytest.fixture
def server():
    """Create a server instance for testing."""
    return DataGenServer()


@pytest.mark.asyncio
async def test_list_tools(server):
    """Test that the server correctly lists available tools."""
    tools = await server.list_tools()

    # Verify tool list structure
    assert isinstance(tools, list)
    assert len(tools) > 0

    # Verify required tools are present
    tool_names = [tool.name for tool in tools]
    assert "generate_tables" in tool_names

    # Verify tool schema
    generate_tool = next(tool for tool in tools if tool.name == "generate_tables")
    assert generate_tool.inputSchema is not None
    assert "tables" in generate_tool.inputSchema["properties"]
    assert "rows" in generate_tool.inputSchema["properties"]
    assert "schemas" in generate_tool.inputSchema["properties"]


@pytest.mark.asyncio
async def test_generate_insurance_tables(server):
    """Test generation of insurance tables through the server."""
    # Test parameters
    params = {
        "tables": ["customers", "policies", "claims"],
        "rows": 100
    }

    # Call the tool
    result = await server.handle_generate_tables(params)

    # Verify result structure
    assert isinstance(result, Dict)
    assert all(table in result for table in params["tables"])

    # Verify each table's data
    for table_name, table_data in result.items():
        assert isinstance(table_data, Dict)
        assert len(next(iter(table_data.values()))) == params["rows"]


@pytest.mark.asyncio
async def test_generate_custom_schema(server):
    """Test generation with custom schema."""
    custom_schema = {
        "test_table": {
            "id": {"type": "int", "min": 1, "max": 100},
            "name": {"type": "string", "generator": "faker.name"},
            "description": {"type": "string", "generator": "mimesis.text.text"}
        }
    }

    params = {
        "tables": ["test_table"],
        "rows": 50,
        "schemas": custom_schema
    }

    result = await server.handle_generate_tables(params)

    # Verify custom schema generation
    assert "test_table" in result
    table_data = result["test_table"]
    assert len(table_data["id"]) == 50
    assert all(1 <= x <= 100 for x in table_data["id"])
    assert all(isinstance(x, str) for x in table_data["name"])
    assert all(isinstance(x, str) for x in table_data["description"])


@pytest.mark.asyncio
async def test_invalid_table_name(server):
    """Test error handling for invalid table names."""
    params = {
        "tables": ["nonexistent_table"],
        "rows": 100
    }

    with pytest.raises(ValueError):
        await server.handle_generate_tables(params)


@pytest.mark.asyncio
async def test_invalid_row_count(server):
    """Test error handling for invalid row counts."""
    params = {
        "tables": ["customers"],
        "rows": -1
    }

    with pytest.raises(ValueError):
        await server.handle_generate_tables(params)


@pytest.mark.asyncio
async def test_large_dataset_generation(server):
    """Test generation of large datasets (10,000 rows)."""
    params = {
        "tables": ["customers", "policies", "claims"],
        "rows": 10000
    }

    result = await server.handle_generate_tables(params)

    # Verify row counts
    assert all(len(next(iter(table_data.values()))) == 10000
              for table_data in result.values())

    # Verify data relationships
    customers = result["customers"]
    policies = result["policies"]
    claims = result["claims"]

    # Customer IDs from policies should exist in customers
    customer_ids = set(customers["customer_id"])
    policy_customer_ids = set(policies["customer_id"])
    assert policy_customer_ids.issubset(customer_ids)

    # Policy IDs from claims should exist in policies
    policy_ids = set(policies["policy_id"])
    claim_policy_ids = set(claims["policy_id"])
    assert claim_policy_ids.issubset(policy_ids)


@pytest.mark.asyncio
async def test_csv_export_format(server):
    """Test that generated data can be exported as CSV."""
    import pandas as pd
    import tempfile
    import os

    params = {
        "tables": ["customers"],
        "rows": 100
    }

    result = await server.handle_generate_tables(params)

    # Convert to DataFrame and save as CSV
    with tempfile.TemporaryDirectory() as tmp_dir:
        csv_path = os.path.join(tmp_dir, "customers.csv")
        df = pd.DataFrame(result["customers"])
        df.to_csv(csv_path, index=False)


        # Read back and verify
        df_read = pd.read_csv(csv_path)
        assert len(df_read) == 100
        assert all(col in df_read.columns
                  for col in server.default_schemas["customers"].keys())
