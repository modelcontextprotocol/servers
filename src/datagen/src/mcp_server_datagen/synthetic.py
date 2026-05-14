"""Synthetic data generation using numpy and faker.

This module provides functionality for generating synthetic data using multiple
generator libraries including numpy, faker, and mimesis. It supports various
data types, ID generation with prefixes, and table relationships.
"""

from datetime import datetime, date
import numpy as np
from faker import Faker
from mimesis import Generic
from typing import Any, Dict, List, Set, Union, Callable

# Default schemas for insurance data generation
DEFAULT_CUSTOMER_SCHEMA = {
    "customer_id": {"type": "integer", "min": 100000, "max": 999999},
    "name": {"type": "string", "generator": "faker", "method": "name"},
    "email": {"type": "string", "generator": "faker", "method": "email"},
    "phone": {"type": "string", "generator": "faker", "method": "phone_number"},
    "address": {"type": "string", "generator": "faker", "method": "address"},
    "date_of_birth": {"type": "date", "generator": "faker"},
    "risk_score": {"type": "float", "min": 0.0, "max": 1.0}
}

DEFAULT_POLICY_SCHEMA = {
    "policy_id": {"type": "integer", "min": 100000, "max": 999999, "prefix": "POL-2024-"},
    "customer_id": {"type": "integer", "correlated": True},
    "type": {"type": "category", "categories": ["Auto", "Home", "Life", "Health"]},
    "premium": {"type": "float", "min": 500.0, "max": 5000.0},
    "coverage_amount": {"type": "integer", "min": 50000, "max": 1000000},
    "start_date": {"type": "date", "generator": "faker"},
    "status": {"type": "category", "categories": ["Active", "Pending", "Expired", "Cancelled"]},
    "deductible": {"type": "float", "min": 250.0, "max": 2000.0}
}

DEFAULT_CLAIMS_SCHEMA = {
    "claim_id": {"type": "integer", "min": 1000000, "max": 9999999},
    "policy_id": {"type": "integer", "correlated": True},
    "date_filed": {"type": "datetime"},
    "amount_claimed": {"type": "float", "min": 1000.0, "max": 100000.0},
    "status": {"type": "category", "categories": ["Open", "Under Review", "Approved", "Denied"]},
    "type": {"type": "category", "categories": ["accident", "theft", "natural_disaster", "medical", "property_damage"]}
}


class SyntheticDataGenerator:
    """Handles synthetic data generation with support for multiple generators.

    Features:
    - Multiple generator types (numpy, faker, mimesis)
    - Automatic ID generation and correlation
    - Prefix support for IDs
    - JSON serialization handling

    Generator Types:
    - numpy: For numeric and categorical data
    - faker: For realistic personal/business data
    - mimesis: Alternative to faker

    Special Features:
    - prefix: Add prefixes to generated IDs
    - correlated: Generate IDs that reference other tables
    - type mapping: Automatic conversion between generator types
    - JSON serialization: Handles numpy type conversion
    """

    def __init__(self):
        """Initialize the synthetic data generator.

        Sets up faker and mimesis instances and initializes tracking for
        generated IDs and table relationships.
        """
        self.faker = Faker()
        self.mimesis = Generic()
        # Store generated IDs for relationships
        self._generated_ids: Dict[str, Set[Union[int, str]]] = {}
        self._id_counters: Dict[str, int] = {}
        self.current_table: str = ""  # Track current table being generated
        self.default_schemas: Dict[str, Dict[str, Dict[str, Any]]] = {
            "customers": DEFAULT_CUSTOMER_SCHEMA,
            "policies": DEFAULT_POLICY_SCHEMA,
            "claims": DEFAULT_CLAIMS_SCHEMA
        }

    def _ensure_json_serializable(self, value: Any) -> Any:
        """Convert value to JSON serializable type.

        Args:
            value: Any value that needs to be JSON serializable

        Returns:
            The value converted to a JSON serializable type

        Handles:
            - numpy integer types
            - numpy float types
            - numpy boolean types
            - datetime objects
            - string conversion
        """
        if isinstance(value, (np.integer, np.floating)):
            return value.item()
        elif isinstance(value, np.bool_):
            return bool(value)
        elif isinstance(value, (date, datetime)):
            return value.isoformat()
        elif isinstance(value, str):
            return str(value)
        return value

    def _map_type_to_generator(self, col_name: str, spec: Dict[str, Any]) -> Callable[[], Any]:
        """Map a column specification to a generator function.

        Args:
            col_name: Name of the column being generated
            spec: Column specification dictionary containing type and generator info

        Returns:
            A callable that generates values according to the specification

        Generator Types:
            - numpy: Numeric and categorical data with min/max ranges
            - faker: Realistic personal and business data
            - mimesis: Alternative personal data generation

        Special Features:
            - Prefix support for string and ID fields
            - Correlated ID generation for relationships
            - Category-based generation for enums
            - Type-specific value ranges

        Example:
            >>> spec = {
            ...     "type": "integer",
            ...     "generator": "numpy",
            ...     "min": 1,
            ...     "max": 100,
            ...     "prefix": "ID-"
            ... }
            >>> generator = self._map_type_to_generator("id", spec)
            >>> value = generator()  # Returns "ID-42" (example)
        """
        data_type = spec["type"]
        generator = spec.get("generator", None)

        # Handle explicit generator specification
        if generator:
            if generator.startswith("faker."):
                return lambda: self._map_faker_type(generator)
            elif generator.startswith("mimesis."):
                return lambda: self._generate_mimesis_value(generator)
            elif generator.startswith("numpy."):
                return lambda: self._ensure_json_serializable(getattr(np.random, generator.split(".", 1)[1])())
            elif generator == "faker":
                return lambda: self._map_faker_type(data_type)
            elif generator == "numpy":
                # Use default numpy generators based on type
                if data_type in ["int", "integer"]:
                    min_val = spec.get("min", 0)
                    max_val = spec.get("max", 100)
                    return lambda: int(self._ensure_json_serializable(np.random.randint(min_val, max_val)))
                elif data_type == "float":
                    min_val = spec.get("min", 0.0)
                    max_val = spec.get("max", 1.0)
                    return lambda: float(self._ensure_json_serializable(np.random.uniform(min_val, max_val)))
                elif data_type == "boolean":
                    return lambda: bool(np.random.choice([True, False]))
                else:
                    raise ValueError(f"Unsupported numpy type: {data_type}")
            else:
                raise ValueError(f"Unknown generator type: {generator}")

        # Handle special ID generation cases
        if "correlated" in spec:
            parent_table = self._extract_parent_table(self.current_table)
            return lambda: self._generate_correlated_id(parent_table)
        if col_name.endswith("_id") or col_name == "id":
            return lambda: self._generate_unique_id(self.current_table, spec)

        # Map basic types to generators
        if data_type == "string":
            if "prefix" in spec:
                prefix = spec["prefix"]
                if "categories" in spec:
                    categories = spec["categories"]
                    return lambda: f"{prefix}{np.random.choice(categories)}"
                return lambda: f"{prefix}{self._map_faker_type('text')}"
            if "categories" in spec:
                categories = spec["categories"]
                return lambda: str(np.random.choice(categories))
            return lambda: self._map_faker_type("text")
        elif data_type in ["int", "integer"]:
            min_val = spec.get("min", 0)
            max_val = spec.get("max", 100)
            return lambda: int(self._ensure_json_serializable(np.random.randint(min_val, max_val)))
        elif data_type == "float":
            min_val = spec.get("min", 0.0)
            max_val = spec.get("max", 1.0)
            return lambda: float(self._ensure_json_serializable(np.random.uniform(min_val, max_val)))
        elif data_type == "boolean":
            return lambda: bool(np.random.choice([True, False]))
        elif data_type == "category":
            categories = spec.get("categories", [])
            return lambda: str(np.random.choice(categories))
        elif data_type == "datetime":
            return lambda: self._map_faker_type("date_time_this_year")
        elif data_type == "date":
            return lambda: self._map_faker_type("date")
        else:
            raise ValueError(f"Unsupported data type: {data_type}")

    def _map_faker_type(self, data_type: str) -> Any:
        """Map a data type to a faker method.

        Args:
            data_type: The type of data to generate (e.g., "string", "email")

        Returns:
            A callable faker method for generating the specified data type

        Features:
            - Supports direct faker method calls (e.g., "faker.name")
            - Maps common data types to faker methods
            - Fallback to text generation for unsupported types

        Raises:
            ValueError: If the specified faker type is unsupported
        """
        # Handle faker.method format
        if data_type.startswith("faker."):
            method = data_type.split(".", 1)[1]
        else:
            # Map common types to faker methods
            method_map = {
                "text": "text",
                "string": "text",  # Map string to text
                "first_name": "first_name",
                "last_name": "last_name",
                "email": "email",
                "phone": "phone_number",
                "address": "address",
                "company": "company",
                "date": "date",
                "date_time_this_year": "date_time_this_year",
                "date_this_year": "date_this_year",
            }
            # Try to get mapped method, fallback to text for string types
            if data_type == "string":
                method = "text"
            else:
                method = method_map.get(data_type, data_type)

        try:
            faker_method = getattr(self.faker, method)
            return faker_method()
        except AttributeError:
            if data_type == "string":
                return self.faker.text()
            raise ValueError(f"Unsupported faker type: {data_type}")


    def _generate_mimesis_value(self, generator: str) -> Any:
        """Generate a value using mimesis.

        Args:
            generator: String specifying the mimesis generator method
                      Format: "mimesis.provider.method" or "method"

        Returns:
            Generated value from mimesis

        Raises:
            ValueError: If the specified generator method is invalid

        Example:
            >>> value = self._generate_mimesis_value("mimesis.person.full_name")
            >>> print(value)  # "John Doe"
        """
        if "." in generator:
            methods = generator.split(".")
            obj = self.mimesis
            for method in methods[1:]:  # Skip 'mimesis' prefix
                if not hasattr(obj, method):
                    raise ValueError(f"Invalid mimesis method: {generator}")
                obj = getattr(obj, method)
            if callable(obj):
                return obj()
            return obj
        return getattr(self.mimesis, generator)()

    def _generate_unique_id(self, table_name: str, spec: Dict[str, Any]) -> Union[int, str]:
        """Generate a unique ID for a table.

        Args:
            table_name: Name of the table requiring the ID
            spec: Specification for ID generation including:
                - type: "integer" or "string"
                - min: Minimum value for range
                - max: Maximum value for range
                - prefix: Optional prefix for generated IDs

        Returns:
            A unique ID (integer or string with prefix)

        Features:
            - Ensures uniqueness within table scope
            - Supports integer and string ID formats
            - Optional prefix support (e.g., "CUST-", "POL-")
            - Configurable value ranges
            - Built-in duplicate prevention

        Raises:
            ValueError: If unable to generate unique ID after max attempts
                      or if ID type is unsupported
        """
        id_type = spec.get("type", "integer")
        min_val = spec.get("min", 1)
        max_val = spec.get("max", 1000000)
        prefix = spec.get("prefix", "")

        # Generate a unique ID
        attempts = 0
        max_attempts = 100
        while attempts < max_attempts:
            if id_type in ["integer", "int"]:
                id_val = np.random.randint(min_val, max_val + 1)
                if prefix:
                    id_val = f"{prefix}{id_val}"
            else:
                raise ValueError(f"Unsupported ID type: {id_type}")

            # Check if ID is unique for this table
            if table_name not in self._generated_ids:
                self._generated_ids[table_name] = set()

            if id_val not in self._generated_ids[table_name]:
                self._generated_ids[table_name].add(id_val)
                return id_val

            attempts += 1

        raise ValueError(f"Failed to generate unique ID for table {table_name} after {max_attempts} attempts")

    def _generate_correlated_id(self, parent_table: str) -> Union[int, str]:
        """Generate a correlated ID from a parent table.

        Args:
            parent_table: Name of the table containing the parent IDs

        Returns:
            An ID from the parent table's generated IDs

        Features:
            - Maintains referential integrity between tables
            - Supports both integer and string ID formats
            - Preserves ID format including prefixes
            - Random selection from existing parent IDs
            - Handles special cases (policies, customers, claims)

        Raises:
            ValueError: If no IDs are available in parent table
                      or if parent table doesn't exist

        Example:
            >>> generator._generate_correlated_id("customers")
            'CUST-1234'  # Returns existing customer ID
        """
        if not self._generated_ids.get(parent_table):
            raise ValueError(f"No IDs available for parent table {parent_table}")

        # Get a random ID from the parent table
        parent_ids = list(self._generated_ids[parent_table])
        if not parent_ids:
            raise ValueError(f"No IDs available in parent table {parent_table}")
        return np.random.choice(parent_ids)

    def _extract_parent_table(self, col_name: str) -> str:
        """Extract parent table name from column name.

        Args:
            col_name: Name of the column (usually ending in '_id')

        Returns:
            Name of the parent table (pluralized)

        Features:
            - Special case handling:
                - policy_id -> policies
                - customer_id -> customers
                - claim_id -> claims
            - General case:
                - Removes '_id' suffix
                - Adds 's' for pluralization
            - Smart pluralization rules

        Example:
            >>> generator._extract_parent_table("customer_id")
            'customers'
            >>> generator._extract_parent_table("policy_id")
            'policies'

        Raises:
            ValueError: If column name format is invalid for extraction
        """
        # Handle special cases first
        if col_name == "policy_id":
            return "policies"
        if col_name == "customer_id":
            return "customers"
        if col_name == "claim_id":
            return "claims"
        # General case: remove '_id' suffix
        if col_name.endswith("_id"):
            table_name = col_name[:-3]
            # Handle pluralization
            if not table_name.endswith('s'):
                table_name += 's'
            return table_name
        raise ValueError(f"Invalid column name for parent table extraction: {col_name}")

    def _ensure_parent_table_ids(self, parent_table: str, rows: int) -> None:
        """Ensure parent table has generated IDs.

        Args:
            parent_table: Name of the parent table
            rows: Number of rows needed for relationships

        Features:
            - Automatic schema detection for parent tables
            - Smart ID field name resolution:
                - Handles singular_id format (customer_id)
                - Handles table_id format (customers_id)
                - Special cases for policies, customers, claims
            - Generates required number of unique IDs
            - Maintains ID format consistency

        Raises:
            ValueError: If no schema found for parent table
                      or if no ID field found in schema

        Example:
            >>> generator._ensure_parent_table_ids("customers", 1000)
            # Generates 1000 unique customer IDs for relationships
        """
        if not self._generated_ids.get(parent_table):
            # Get the schema for the parent table
            if parent_table not in self.default_schemas:
                raise ValueError(f"No schema found for parent table {parent_table}")

            parent_schema = self.default_schemas[parent_table]
            # Try both singular_id and table_id formats
            id_field_candidates = [
                f"{parent_table[:-1]}_id",  # Remove 's' and add '_id'
                f"{parent_table}_id",  # Full table name with _id
                "policy_id" if parent_table == "policies" else None,  # Special case for policies
                "customer_id" if parent_table == "customers" else None,  # Special case for customers
                "claim_id" if parent_table == "claims" else None  # Special case for claims
            ]
            id_field = next((field for field in id_field_candidates if field and field in parent_schema), None)
            if not id_field:
                raise ValueError(f"No ID field found in schema for parent table {parent_table}")

            # Generate IDs for parent table
            generator = self._map_type_to_generator(id_field, parent_schema[id_field])
            self._generated_ids[parent_table] = {generator() for _ in range(rows)}  # Use set comprehension

    def _clear_generated_ids(self):
        """Clear all generated IDs.

        Resets the internal tracking of generated IDs across all tables.
        This is useful when:
        - Starting a new generation session
        - Cleaning up after error conditions
        - Resetting state for new table relationships
        - Freeing memory after large generations
        """
        self._generated_ids = {}

    async def generate_synthetic_data(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]],
        rows: int
    ) -> Dict[str, List[Any]]:
        """Generate synthetic data for a table.

        Args:
            table_name: Name of the table to generate data for
            schema: Schema definition for the table's columns
            rows: Number of rows to generate

        Returns:
            Dictionary mapping column names to lists of generated values

        Features:
            - Two-pass generation for handling relationships
            - Automatic ID generation for parent tables
            - Correlated ID generation for child tables
            - JSON serialization of all values
            - Support for all generator types

        Example:
            >>> schema = {
            ...     "id": {"type": "integer", "min": 1, "max": 100},
            ...     "name": {"type": "string", "generator": "faker"},
            ...     "parent_id": {"type": "integer", "correlated": true}
            ... }
            >>> data = await generator.generate_synthetic_data("table", schema, 10)
        """
        data: Dict[str, List[Any]] = {}

        # If this is a parent table, ensure we generate IDs first
        if table_name in self.default_schemas:
            id_field = f"{table_name[:-1]}_id"  # Remove 's' and add '_id'
            if id_field in schema:
                data[id_field] = [
                    self._generate_unique_id(table_name, schema[id_field])
                    for _ in range(rows)
                ]
                self._generated_ids[table_name] = set(data[id_field])

        # First pass: Generate non-correlated fields
        for col_name, col_spec in schema.items():
            if not col_spec.get("correlated") and col_name not in data:
                if col_name.endswith("_id"):
                    # Generate unique IDs with optional prefix
                    data[col_name] = [
                        self._generate_unique_id(table_name, col_spec)
                        for _ in range(rows)
                    ]
                else:
                    # Generate other fields using appropriate generator
                    generator = self._map_type_to_generator(col_name, col_spec)
                    data[col_name] = [
                        self._ensure_json_serializable(generator())
                        for _ in range(rows)
                    ]

        # Second pass: Generate correlated fields
        for col_name, col_spec in schema.items():
            if col_spec.get("correlated"):
                parent_table = self._extract_parent_table(col_name)
                self._ensure_parent_table_ids(parent_table, rows)
                data[col_name] = [
                    self._generate_correlated_id(parent_table)
                    for _ in range(rows)
                ]

        # Ensure all numpy types are converted to native Python types
        for col_name in data:
            data[col_name] = [
                self._ensure_json_serializable(val)
                for val in data[col_name]
            ]

        return data
