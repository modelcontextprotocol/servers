# MCP Data Generation Server

A Model Context Protocol (MCP) server for generating synthetic data with support for multiple data generation libraries including faker, mimesis, and numpy.

## Installation

```bash
# Using uv (recommended)
uvx mcp-server-datagen

# Using pip
pip install mcp-server-datagen
```

## Tools

### generate_custom_tables

Generate synthetic data based on custom schemas and parameters.

**Input Parameters:**
- `tables`: List of table names to generate
- `rows`: Number of rows to generate (default: 1000)
- `schemas`: Dictionary of table schemas defining columns and their properties

**Example:**
```json
{
  "tables": ["customers", "policies"],
  "rows": 1000,
  "schemas": {
    "customers": {
      "customer_id": {
        "type": "integer",
        "generator": "numpy",
        "min": 1000,
        "max": 9999,
        "prefix": "CUST-"
      },
      "name": {
        "type": "string",
        "generator": "faker",
        "method": "name"
      },
      "risk_score": {
        "type": "float",
        "generator": "numpy",
        "min": 0.0,
        "max": 1.0
      },
      "age": {
        "type": "integer",
        "generator": "numpy",
        "min": 18,
        "max": 90
      },
      "email": {
        "type": "string",
        "generator": "faker",
        "method": "email"
      },
      "is_active": {
        "type": "boolean",
        "generator": "numpy"
      }
    },
    "policies": {
      "policy_id": {
        "type": "integer",
        "generator": "numpy",
        "min": 2000,
        "max": 9999,
        "prefix": "POL-"
      },
      "customer_id": {
        "type": "integer",
        "correlated": true
      },
      "premium": {
        "type": "float",
        "generator": "numpy",
        "min": 500.0,
        "max": 5000.0
      },
      "coverage_type": {
        "type": "category",
        "generator": "numpy",
        "categories": ["basic", "standard", "premium"]
      },
      "start_date": {
        "type": "date",
        "generator": "faker",
        "method": "date_this_year"
      }
    }
  }
}
```

### generate_insurance_data

Generate synthetic insurance data using predefined schemas for customers, policies, and claims.

**Input Parameters:**
- `rows`: Number of rows to generate for each table (default: 1000)

**Example:**
```json
{
  "rows": 1000
}
```

This will generate three related tables:
1. `customers`: Customer information including demographics and contact details
2. `policies`: Insurance policy details with references to customers
3. `claims`: Claim records with references to policies

**Example Output:**
```json
{
  "tables": {
    "customers": {
      "customer_id": ["CUST-1001", "CUST-1002"],
      "name": ["John Doe", "Jane Smith"],
      "age": [45, 32],
      "email": ["john.doe@example.com", "jane.smith@example.com"],
      "risk_score": [0.75, 0.45],
      "is_active": [true, false]
    },
    "policies": {
      "policy_id": ["POL-2001", "POL-2002"],
      "customer_id": ["CUST-1001", "CUST-1002"],
      "premium": [1250.50, 980.75],
      "coverage_type": ["comprehensive", "basic"],
      "start_date": ["2024-01-15", "2024-02-01"]
    },
    "claims": {
      "claim_id": ["CLM-3001"],
      "policy_id": ["POL-2001"],
      "amount": [5000.00],
      "status": ["pending"],
      "date_filed": ["2024-03-10"]
    }
  }
}
```

## Generator Types

### numpy
- Supports numeric types (integer, float) and boolean values
- Requires min/max parameters for numeric ranges
- Used for generating random numerical data and categorical values
- Automatically handles type conversion and JSON serialization

**Examples:**
```json
{
  "age": {
    "type": "integer",
    "generator": "numpy",
    "min": 18,
    "max": 90
  },
  "risk_score": {
    "type": "float",
    "generator": "numpy",
    "min": 0.0,
    "max": 1.0
  },
  "is_active": {
    "type": "boolean",
    "generator": "numpy"
  },
  "status": {
    "type": "category",
    "generator": "numpy",
    "categories": ["active", "pending", "cancelled"]
  }
}
```

### faker
- Generates realistic personal and business data
- Requires specific method parameter for data type
- Supports various data types including names, emails, dates, and addresses
- Methods are mapped directly to Faker library functions

**Examples:**
```json
{
  "name": {
    "type": "string",
    "generator": "faker",
    "method": "name"
  },
  "email": {
    "type": "string",
    "generator": "faker",
    "method": "email"
  },
  "address": {
    "type": "string",
    "generator": "faker",
    "method": "address"
  },
  "date_joined": {
    "type": "date",
    "generator": "faker",
    "method": "date_this_year"
  }
}
```

### mimesis
- Alternative to faker for generating personal data
- Supports hierarchical method paths (e.g., "person.full_name")
- Provides consistent data across different locales

**Examples:**
```json
{
  "full_name": {
    "type": "string",
    "generator": "mimesis",
    "method": "person.full_name"
  },
  "occupation": {
    "type": "string",
    "generator": "mimesis",
    "method": "person.occupation"
  },
  "email": {
    "type": "string",
    "generator": "mimesis",
    "method": "person.email"
  }
}
```

## Supported Data Types

### string
- Used for text data
- Supports faker and mimesis generators
- Requires method specification
- Optional prefix support for IDs

### integer
- Whole number values
- Requires min/max range for numpy generator
- Can be used with prefix for ID generation
- Supports correlation between tables

### float
- Decimal number values
- Requires min/max range for numpy generator
- Automatically handles precision

### boolean
- True/False values
- Uses numpy generator
- No additional parameters required

### category
- Enumerated values from a predefined list
- Requires categories parameter
- Uses numpy generator for random selection

### date
- Date values
- Uses faker generator
- Requires specific method (e.g., "date_this_year")

## Special Features

### ID Generation
- Unique ID generation with customizable ranges
- Optional prefix support for readable identifiers
- Automatic correlation between related tables
- Built-in duplicate prevention

**Examples:**
```json
{
  "customer_id": {
    "type": "integer",
    "generator": "numpy",
    "min": 1000,
    "max": 9999,
    "prefix": "CUST-"
  },
  "policy_id": {
    "type": "integer",
    "generator": "numpy",
    "min": 2000,
    "max": 9999,
    "prefix": "POL-"
  }
}
```

### Table Relationships
- Automatic generation order: customers → policies → claims
- Maintains referential integrity across tables
- Correlated IDs ensure valid relationships
- Supports complex relationship chains

**Example with Relationships:**
```json
{
  "tables": ["customers", "policies", "claims"],
  "rows": 1000,
  "schemas": {
    "customers": {
      "customer_id": {
        "type": "integer",
        "generator": "numpy",
        "min": 1000,
        "max": 9999,
        "prefix": "CUST-"
      }
    },
    "policies": {
      "policy_id": {
        "type": "integer",
        "generator": "numpy",
        "min": 2000,
        "max": 9999,
        "prefix": "POL-"
      },
      "customer_id": {
        "type": "integer",
        "correlated": true
      }
    },
    "claims": {
      "claim_id": {
        "type": "integer",
        "generator": "numpy",
        "min": 3000,
        "max": 9999,
        "prefix": "CLM-"
      },
      "policy_id": {
        "type": "integer",
        "correlated": true
      }
    }
  }
}
```

### Data Generation Order
1. Parent tables are generated first (e.g., customers)
2. Child tables with correlations follow (e.g., policies referencing customers)
3. Grandchild tables are generated last (e.g., claims referencing policies)

This order ensures that:
- All referenced IDs exist when needed
- Relationships are valid and consistent
- Data integrity is maintained across the dataset

### Correlation Rules
- Use `"correlated": true` to reference parent table IDs
- Parent table must be generated before child table
- Column names must follow pattern: `{table_name}_id`
- Automatically handles ID type matching and prefixes

## Development

### Setup

1. Clone the repository
2. Install dependencies:
```bash
uv sync --frozen --all-extras --dev
```

3. Run tests:
```bash
uv run pytest tests/
```

### Type Checking

```bash
uv run pyright
```

### Linting

```bash
uv run ruff check .
uv run ruff format .

## Troubleshooting

### Common Issues

#### Null Values in Generated Data
- **Check Generator Type Compatibility**: Ensure the generator type matches the data type (e.g., use 'faker' for personal data, 'numpy' for numeric)
- **Verify Faker Method Support**: When using faker, confirm the method is supported (see faker types in documentation)
- **Validate Numeric Ranges**: For numeric types, ensure min/max values are valid and min is less than max
- **Boolean Type Generation**: Use 'numpy' generator for boolean types to avoid null values
- **Date Format Specification**: For date fields, use specific faker methods like 'date_this_year' instead of generic 'date'

#### ID Generation Problems
- **Prefix Format**:
  - Ensure prefix is a string (e.g., "POL-", "CUST-")
  - Avoid special characters that might cause parsing issues
  - Keep prefixes consistent within related tables
- **ID Range Configuration**:
  - Set appropriate min/max ranges to avoid collisions
  - Ensure range is large enough for requested row count
  - Example: For 1000 rows, use range of at least 2000 (min: 1000, max: 3000)
- **Correlated ID Issues**:
  - Verify parent table exists and is generated first
  - Check parent table has sufficient unique IDs
  - Ensure parent table schema includes proper ID field
  - Example: For policy.customer_id, customers table must exist with customer_id field

#### Table Relationship Errors
- **Generation Order**: Tables must be generated in correct order (parent tables first)
- **Schema Consistency**: ID field names must match between parent and child tables
- **Unique Constraints**: Ensure ID ranges don't overlap between tables
- **Correlation Settings**: Set `"correlated": true` for foreign key fields

#### Type Conversion Errors
- **JSON Serialization**: Some numpy types may need explicit conversion
- **Date Format Issues**: Use ISO format for dates (YYYY-MM-DD)
- **String Conversion**: Ensure prefix concatenation results in valid strings
- **Numeric Precision**: Float values may need rounding for specific use cases

### Best Practices
1. Start with small row counts to validate schema configuration
2. Use descriptive prefixes for better data readability
3. Implement proper error handling for generated data
4. Validate schema before generating large datasets
5. Monitor memory usage with large row counts
6. Use appropriate generator types for each data category
```
