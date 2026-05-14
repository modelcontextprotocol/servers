"""Unit tests for synthetic data generation."""
import pytest
import numpy as np
from mcp_server_datagen.synthetic import SyntheticDataGenerator


@pytest.fixture
def data_generator():
    """Create a data generator instance for testing."""
    return SyntheticDataGenerator()


@pytest.fixture
def sample_schema():
    """Create a sample schema for testing."""
    return {
        "id": {"type": "int", "min": 1, "max": 1000},
        "name": {"type": "string", "categories": ["Alice", "Bob", "Charlie"]},
        "age": {"type": "int", "min": 18, "max": 100},
        "score": {"type": "float", "min": 0.0, "max": 1.0},
    }


@pytest.mark.asyncio
async def test_type_mapping(data_generator, sample_schema):
    """Test type mapping functionality."""
    # Test numpy type mapping
    generator = data_generator._map_type_to_generator("id", {"type": "integer", "generator": "numpy", "min": 1, "max": 100})
    assert callable(generator)
    value = generator()
    assert isinstance(value, (int, np.integer))
    assert 1 <= value <= 100

    generator = data_generator._map_type_to_generator("score", {"type": "float", "generator": "numpy", "min": 0.0, "max": 1.0})
    assert callable(generator)
    value = generator()
    assert isinstance(value, (float, np.floating))
    assert 0.0 <= value <= 1.0

    generator = data_generator._map_type_to_generator("active", {"type": "boolean", "generator": "numpy"})
    assert callable(generator)
    assert isinstance(generator(), bool)

    # Test faker type mapping
    generator = data_generator._map_type_to_generator("name", {"type": "first_name", "generator": "faker"})
    assert callable(generator)
    assert isinstance(generator(), str)

    generator = data_generator._map_type_to_generator("email", {"type": "email", "generator": "faker"})
    assert callable(generator)
    assert isinstance(generator(), str)


@pytest.mark.asyncio
async def test_generate_synthetic_data(data_generator, sample_schema):
    """Test synthetic data generation."""
    rows = 100
    data = await data_generator.generate_synthetic_data("test_table", sample_schema, rows)

    # Verify all columns are present
    assert set(data.keys()) == set(sample_schema.keys())

    # Verify number of rows
    assert all(len(values) == rows for values in data.values())

    # Verify data types and ranges
    assert all(isinstance(x, (int, np.integer)) for x in data["id"])
    assert all(1 <= x <= 1000 for x in data["id"])

    assert all(isinstance(x, str) for x in data["name"])
    assert all(x in ["Alice", "Bob", "Charlie"] for x in data["name"])

    assert all(isinstance(x, (int, np.integer)) for x in data["age"])
    assert all(18 <= x <= 100 for x in data["age"])

    assert all(isinstance(x, (float, np.floating)) for x in data["score"])
    assert all(0.0 <= x <= 1.0 for x in data["score"])


@pytest.mark.asyncio
async def test_generate_large_dataset(data_generator):
    """Test generation of a large dataset."""
    schema = {
        "customer_id": {"type": "int", "min": 10000, "max": 99999},
        "first_name": {"type": "string"},
        "last_name": {"type": "string"},
        "age": {"type": "int", "min": 18, "max": 100},
        "credit_score": {"type": "int", "min": 300, "max": 850},
    }

    rows = 10000
    data = await data_generator.generate_synthetic_data("customers", schema, rows)

    # Verify row count
    assert all(len(values) == rows for values in data.values())

    # Verify data constraints
    assert all(10000 <= x <= 99999 for x in data["customer_id"])
    assert all(18 <= x <= 100 for x in data["age"])
    assert all(300 <= x <= 850 for x in data["credit_score"])

    # Verify unique IDs
    assert len(set(data["customer_id"])) > rows * 0.95  # Allow for some duplicates due to random generation


@pytest.mark.asyncio
async def test_multiple_table_generation(data_generator):
    """Test generation of multiple related tables."""
    customers_schema = {
        "customer_id": {"type": "int", "min": 1, "max": 1000},
        "name": {"type": "string"},
    }

    policies_schema = {
        "policy_id": {"type": "int", "min": 1, "max": 2000},
        "customer_id": {"type": "int", "min": 1, "max": 1000, "correlated": True},
        "premium": {"type": "float", "min": 500.0, "max": 5000.0},
    }

    # Generate both tables
    customers = await data_generator.generate_synthetic_data("customers", customers_schema, 100)
    policies = await data_generator.generate_synthetic_data("policies", policies_schema, 200)

    # Verify referential integrity is maintained
    customer_ids = set(customers["customer_id"])
    policy_customer_ids = set(policies["customer_id"])

    # All policy customer_ids should exist in customers table
    assert policy_customer_ids.issubset(customer_ids)


@pytest.mark.asyncio
async def test_integer_type_handling(data_generator):
    """Test handling of both 'integer' and 'int' type fields."""
    schema = {
        "age": {"type": "integer", "min": 25, "max": 65},
        "claims": {"type": "integer", "min": 0, "max": 3},
        "count": {"type": "int", "min": 1, "max": 10},
    }

    rows = 100
    data = await data_generator.generate_synthetic_data("test_table", schema, rows)

    # Verify all columns are present
    assert set(data.keys()) == set(schema.keys())

    # Verify number of rows
    assert all(len(values) == rows for values in data.values())

    # Verify age field (integer type)
    assert all(isinstance(x, (int, np.integer)) for x in data["age"]), "Age values should be integers"
    assert all(25 <= x <= 65 for x in data["age"]), "Age values should be within range"
    assert not any(x is None for x in data["age"]), "Age values should not be null"

    # Verify claims field (integer type)
    assert all(isinstance(x, (int, np.integer)) for x in data["claims"]), "Claims values should be integers"
    assert all(0 <= x <= 3 for x in data["claims"]), "Claims values should be within range"
    assert not any(x is None for x in data["claims"]), "Claims values should not be null"

    # Verify count field (int type)
    assert all(isinstance(x, (int, np.integer)) for x in data["count"]), "Count values should be integers"
    assert all(1 <= x <= 10 for x in data["count"]), "Count values should be within range"
    assert not any(x is None for x in data["count"]), "Count values should not be null"


@pytest.mark.asyncio
async def test_faker_string_generation(data_generator):
    """Test that faker properly generates string values."""
    # Test generic string type with faker generator
    schema = {
        "customer_name": {
            "type": "string",
            "generator": "faker"
        }
    }
    data = await data_generator.generate_synthetic_data("test", schema, 10)
    assert all(isinstance(x, str) and x is not None for x in data["customer_name"]), "Customer names should be non-null strings"
    assert all(len(x) > 0 for x in data["customer_name"]), "Customer names should not be empty"

    # Test specific faker types
    schema = {
        "first_name": {
            "type": "first_name",
            "generator": "faker"
        },
        "email": {
            "type": "email",
            "generator": "faker"
        },
        "address": {
            "type": "address",
            "generator": "faker"
        }
    }
    data = await data_generator.generate_synthetic_data("test", schema, 10)

    # Verify first_name generation
    assert all(isinstance(x, str) and x is not None for x in data["first_name"]), "First names should be non-null strings"
    assert all(len(x) > 0 for x in data["first_name"]), "First names should not be empty"

    # Verify email generation
    assert all(isinstance(x, str) and x is not None for x in data["email"]), "Emails should be non-null strings"
    assert all("@" in x for x in data["email"]), "Emails should contain @ symbol"

    # Verify address generation
    assert all(isinstance(x, str) and x is not None for x in data["address"]), "Addresses should be non-null strings"
    assert all(len(x) > 0 for x in data["address"]), "Addresses should not be empty"

    # Test legacy faker.method format still works
    schema = {
        "legacy_name": {
            "type": "string",
            "generator": "faker.name"
        }
    }
    data = await data_generator.generate_synthetic_data("test", schema, 10)
    assert all(isinstance(x, str) and x is not None for x in data["legacy_name"]), "Legacy faker format should still work"
    assert all(len(x) > 0 for x in data["legacy_name"]), "Legacy faker names should not be empty"


@pytest.mark.asyncio
async def test_boolean_type_handling(data_generator):
    """Test handling of boolean type fields."""
    schema = {
        "active": {"type": "boolean"},
        "verified": {"type": "boolean"},
        "premium": {"type": "boolean"}
    }

    rows = 100
    data = await data_generator.generate_synthetic_data("test_table", schema, rows)

    # Verify all columns are present
    assert set(data.keys()) == set(schema.keys())

    # Verify number of rows
    assert all(len(values) == rows for values in data.values())

    # Verify boolean fields
    for field in ["active", "verified", "premium"]:
        assert all(isinstance(x, bool) for x in data[field]), f"{field} values should be booleans"
        assert not any(x is None for x in data[field]), f"{field} values should not be null"
        # Verify we get both True and False values
        assert any(x is True for x in data[field]), f"{field} should have some True values"
        assert any(x is False for x in data[field]), f"{field} should have some False values"

@pytest.mark.asyncio
async def test_string_prefix_generation(data_generator):
    """Test generation of string IDs with prefixes."""
    schema = {
        "policy_id": {
            "type": "integer",
            "generator": "numpy",
            "min": 100000,
            "max": 999999,
            "prefix": "POL-2024-"
        }
    }

    # Generate 100 policy IDs
    data = await data_generator.generate_synthetic_data("test", schema, rows=100)

    # Verify all IDs have correct prefix
    assert all(str(id).startswith("POL-2024-") for id in data["policy_id"])

    # Verify all IDs are unique
    assert len(set(data["policy_id"])) == 100

    # Verify numeric portion is within range
    numeric_parts = [int(str(id)[len("POL-2024-"):]) for id in data["policy_id"]]
    assert all(100000 <= num <= 999999 for num in numeric_parts)

    # Test with larger dataset
    large_data = await data_generator.generate_synthetic_data("test", schema, rows=10000)
    assert len(set(large_data["policy_id"])) == 10000
    assert all(str(id).startswith("POL-2024-") for id in large_data["policy_id"])
