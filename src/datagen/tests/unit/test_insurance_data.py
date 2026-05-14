"""Unit tests for insurance-specific data generation."""
import pytest
import pandas as pd
import numpy as np
from mcp_server_datagen.synthetic import SyntheticDataGenerator


@pytest.fixture
def data_generator(customers_schema, policies_schema, claims_schema):
    """Create a data generator instance for testing."""
    generator = SyntheticDataGenerator()
    generator.default_schemas = {
        "customers": customers_schema,
        "policies": policies_schema,
        "claims": claims_schema
    }
    return generator


@pytest.fixture
def customers_schema():
    """Create the customers table schema."""
    return {
        "customer_id": {"type": "int", "min": 10000, "max": 99999},
        "first_name": {"type": "string", "generator": "faker.first_name"},
        "last_name": {"type": "string", "generator": "faker.last_name"},
        "email": {"type": "string", "generator": "faker.email"},
        "phone": {"type": "string", "generator": "faker.phone_number"},
        "address": {"type": "string", "generator": "faker.address"},
        "date_of_birth": {"type": "datetime", "generator": "faker.date_of_birth"},
        "credit_score": {"type": "int", "min": 300, "max": 850}
    }


@pytest.fixture
def policies_schema():
    """Create the policies table schema."""
    return {
        "policy_id": {"type": "int", "min": 100000, "max": 999999},
        "customer_id": {"type": "int", "min": 10000, "max": 99999, "correlated": True},
        "policy_type": {"type": "category", "categories": ["auto", "home", "life", "health"]},
        "start_date": {"type": "datetime"},
        "end_date": {"type": "datetime"},
        "premium": {"type": "float", "min": 500.0, "max": 5000.0},
        "coverage_amount": {"type": "float", "min": 50000.0, "max": 1000000.0},
        "status": {"type": "category", "categories": ["active", "expired", "cancelled", "pending"]}
    }


@pytest.fixture
def claims_schema():
    """Create the claims table schema."""
    return {
        "claim_id": {"type": "int", "min": 1000000, "max": 9999999},
        "policy_id": {"type": "int", "min": 100000, "max": 999999, "correlated": True},
        "date_filed": {"type": "datetime"},
        "incident_date": {"type": "datetime"},
        "claim_type": {"type": "category", "categories": [
            "accident", "theft", "natural_disaster", "medical", "property_damage"
        ]},
        "amount_claimed": {"type": "float", "min": 1000.0, "max": 100000.0},
        "status": {"type": "category", "categories": ["pending", "approved", "denied", "in_review"]},
        "description": {"type": "string", "generator": "mimesis.text.text"}
    }


@pytest.mark.asyncio
async def test_generate_customers_table(data_generator, customers_schema):
    """Test generation of customers table with 10,000 rows."""
    rows = 10000
    data = await data_generator.generate_synthetic_data("customers", customers_schema, rows)

    # Verify row count
    assert all(len(values) == rows for values in data.values())

    # Verify data types and ranges
    assert all(isinstance(x, (int, np.integer)) for x in data["customer_id"])
    assert all(10000 <= x <= 99999 for x in data["customer_id"])
    assert all(300 <= x <= 850 for x in data["credit_score"])

    # Verify Faker-generated fields
    assert all(isinstance(x, str) and "@" in x for x in data["email"])
    assert all(isinstance(x, str) and len(x) > 0 for x in data["first_name"])
    assert all(isinstance(x, str) and len(x) > 0 for x in data["last_name"])


@pytest.mark.asyncio
async def test_generate_policies_table(data_generator, policies_schema):
    """Test generation of policies table with 10,000 rows."""
    rows = 10000
    data = await data_generator.generate_synthetic_data("policies", policies_schema, rows)

    # Verify row count
    assert all(len(values) == rows for values in data.values())

    # Verify data types and ranges
    assert all(isinstance(x, (int, np.integer)) for x in data["policy_id"])
    assert all(100000 <= x <= 999999 for x in data["policy_id"])
    assert all(isinstance(x, (float, np.floating)) for x in data["premium"])
    assert all(500.0 <= x <= 5000.0 for x in data["premium"])
    assert all(50000.0 <= x <= 1000000.0 for x in data["coverage_amount"])

    # Verify categorical fields
    valid_types = ["auto", "home", "life", "health"]
    valid_statuses = ["active", "expired", "cancelled", "pending"]
    assert all(x in valid_types for x in data["policy_type"])
    assert all(x in valid_statuses for x in data["status"])


@pytest.mark.asyncio
async def test_generate_claims_table(data_generator, claims_schema):
    """Test generation of claims table with 10,000 rows."""
    rows = 10000
    data = await data_generator.generate_synthetic_data("claims", claims_schema, rows)

    # Verify row count
    assert all(len(values) == rows for values in data.values())

    # Verify data types and ranges
    assert all(isinstance(x, (int, np.integer)) for x in data["claim_id"])
    assert all(1000000 <= x <= 9999999 for x in data["claim_id"])
    assert all(isinstance(x, (float, np.floating)) for x in data["amount_claimed"])
    assert all(1000.0 <= x <= 100000.0 for x in data["amount_claimed"])

    # Verify categorical fields
    valid_types = ["accident", "theft", "natural_disaster", "medical", "property_damage"]
    valid_statuses = ["pending", "approved", "denied", "in_review"]
    assert all(x in valid_types for x in data["claim_type"])
    assert all(x in valid_statuses for x in data["status"])

    # Verify Mimesis-generated descriptions
    assert all(isinstance(x, str) and len(x) > 0 for x in data["description"])


@pytest.mark.asyncio
async def test_data_relationships(data_generator, customers_schema, policies_schema, claims_schema):
    """Test relationships between tables."""
    # Generate all three tables
    customers = await data_generator.generate_synthetic_data("customers", customers_schema, 1000)
    policies = await data_generator.generate_synthetic_data("policies", policies_schema, 2000)
    claims = await data_generator.generate_synthetic_data("claims", claims_schema, 3000)

    # Verify customer-policy relationship
    customer_ids = set(customers["customer_id"])
    policy_customer_ids = set(policies["customer_id"])
    assert policy_customer_ids.issubset(customer_ids)

    # Verify policy-claim relationship
    policy_ids = set(policies["policy_id"])
    claim_policy_ids = set(claims["policy_id"])
    assert claim_policy_ids.issubset(policy_ids)


@pytest.mark.asyncio
async def test_csv_export(data_generator, customers_schema, tmp_path):
    """Test CSV export functionality."""
    rows = 100
    data = await data_generator.generate_synthetic_data("customers", customers_schema, rows)

    # Convert to DataFrame and save as CSV
    df = pd.DataFrame(data)
    csv_path = tmp_path / "customers.csv"
    df.to_csv(csv_path, index=False)

    # Read back and verify
    df_read = pd.read_csv(csv_path)
    assert len(df_read) == rows
    assert all(col in df_read.columns for col in customers_schema.keys())
