"""Synthetic data generation using SDV."""

from typing import Dict, List, Any, Set
import pandas as pd
import numpy as np
from faker import Faker
from mimesis import Generic
from sdv.single_table import GaussianCopulaSynthesizer
from sdv.metadata import SingleTableMetadata
from datetime import datetime, timedelta


class SyntheticDataGenerator:
    """Handles synthetic data generation using SDV."""

    def __init__(self):
        """Initialize the generator."""
        self.synthesizers: Dict[str, GaussianCopulaSynthesizer] = {}
        self.metadata: Dict[str, SingleTableMetadata] = {}
        self.faker = Faker()
        self.mimesis = Generic()
        # Store generated IDs for relationships
        self.generated_ids: Dict[str, Set[int]] = {}
        # Initialize empty sets for each table
        self.generated_ids["customers"] = set()
        self.generated_ids["policies"] = set()
        self.generated_ids["claims"] = set()
        self.default_schemas: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # Counter for ID generation
        self.id_counters: Dict[str, int] = {}

    def create_metadata(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]]
    ) -> SingleTableMetadata:
        """Create metadata for a table based on schema."""
        metadata = SingleTableMetadata()

        for col_name, col_spec in schema.items():
            data_type = col_spec.get("type", "string")
            sdtype = self._map_type_to_sdtype(data_type)
            metadata.add_column(
                column_name=col_name,
                sdtype=sdtype
            )

        return metadata

    def _map_type_to_sdtype(self, data_type: str) -> str:
        """Map data type to SDV type."""
        type_mapping = {
            "string": "categorical",
            "int": "numerical",
            "integer": "numerical",
            "float": "numerical",
            "datetime": "datetime",
            "boolean": "boolean",
            "category": "categorical"
        }
        return type_mapping.get(data_type, "categorical")

    def _map_faker_type(self, data_type: str) -> str:
        """Map data type to Faker method."""
        type_mapping = {
            "string": "text",  # Default for generic strings
            "first_name": "first_name",
            "last_name": "last_name",
            "email": "email",
            "phone_number": "phone_number",
            "address": "street_address",
            "text": "text",
            "date_this_year": "date_this_year",
            "date_this_decade": "date_this_decade",
            "date_of_birth": "date_of_birth"
        }
        return type_mapping.get(data_type, "text")

    def _generate_faker_value(self, data_type: str) -> Any:
        """Generate value using Faker."""
        method_name = self._map_faker_type(data_type)
        if hasattr(self.faker, method_name):
            return getattr(self.faker, method_name)()
        return None

    def _generate_mimesis_value(self, generator: str) -> Any:
        """Generate value using Mimesis."""
        if not generator.startswith("mimesis."):
            return None

        category, method = generator.split(".", 1)[1].split(".")
        if hasattr(self.mimesis, category):
            category_instance = getattr(self.mimesis, category)
            if hasattr(category_instance, method):
                return getattr(category_instance, method)()
        return None

    def _generate_unique_id(
        self,
        table_name: str,
        col_spec: Dict[str, Any]
    ) -> int:
        """Generate a unique ID for a table using a hybrid sequential-random approach."""
        min_val = col_spec.get("min", 1)
        max_val = col_spec.get("max", 1000000)
        range_size = max_val - min_val + 1

        if table_name not in self.id_counters:
            self.id_counters[table_name] = 0
        if table_name not in self.generated_ids:
            self.generated_ids[table_name] = set()

        # Calculate a random offset within a smaller window
        window_size = max(1, range_size // 1000)  # Use 0.1% of range as window
        attempts = 0
        max_attempts = 10  # Limit retries to avoid infinite loops

        while attempts < max_attempts:
            base = min_val + (self.id_counters[table_name] * window_size)
            offset = np.random.randint(0, window_size)
            new_id = base + offset

            # Handle wraparound
            if new_id > max_val:
                self.id_counters[table_name] = 0
                new_id = min_val + np.random.randint(0, window_size)

            # Check if ID is unique
            if new_id not in self.generated_ids[table_name]:
                self.generated_ids[table_name].add(new_id)
                self.id_counters[table_name] += 1
                return new_id

            attempts += 1

        # If we couldn't find a unique ID in the current window, move to next window
        self.id_counters[table_name] += 1
        return self._generate_unique_id(table_name, col_spec)  # Recursive call with new window

    def _generate_correlated_id(self, parent_table: str) -> int:
        """Generate a correlated ID from a parent table."""
        if not self.generated_ids.get(parent_table):
            raise ValueError(f"No IDs available for parent table {parent_table}")
        parent_ids = list(self.generated_ids[parent_table])
        return np.random.choice(parent_ids)

    def _extract_parent_table(self, column_name: str) -> str:
        """Extract parent table name from column name."""
        if not column_name.endswith("_id"):
            raise ValueError(f"Column {column_name} is not a foreign key")
        # Handle both singular and plural forms with special cases
        table_name = column_name[:-3]  # Remove _id
        # Handle irregular plurals
        irregular_plurals = {
            "policy": "policies",
            "company": "companies",
            "category": "categories"
        }
        if table_name in irregular_plurals:
            return irregular_plurals[table_name]
        # Handle regular plurals
        if not table_name.endswith('s'):
            table_name += 's'
        return table_name

    def _clear_generated_ids(self, table_name: str) -> None:
        """Clear generated IDs for a table."""
        if table_name in self.generated_ids:
            del self.generated_ids[table_name]

    async def fit_synthesizer(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]]
    ) -> None:
        """Fit a synthesizer for the given table schema."""
        metadata = self.create_metadata(table_name, schema)
        fitting_size = min(100, 1000)  # Use a small sample size for fitting

        # Generate sample data for fitting
        sample_data = {}
        for col_name, col_spec in schema.items():
            col_type = col_spec["type"]
            is_correlated = col_spec.get("correlated", False)

            if is_correlated and col_name.endswith("_id"):
                # For correlated fields, use IDs from parent table
                parent_table = self._extract_parent_table(col_name)
                if parent_table not in self.generated_ids:
                    raise ValueError(f"Parent table {parent_table} must be generated before {table_name}")
                parent_ids = list(self.generated_ids[parent_table])
                sample_data[col_name] = [
                    np.random.choice(parent_ids) for _ in range(fitting_size)
                ]
            elif col_type == "int":
                min_val = col_spec.get("min", 0)
                max_val = col_spec.get("max", 100)
                if col_name.endswith("_id"):
                    # Generate unique IDs for primary keys
                    unique_ids = set()
                    while len(unique_ids) < fitting_size:
                        unique_ids.add(self._generate_unique_id(min_val, max_val))
                    sample_data[col_name] = list(unique_ids)
                else:
                    sample_data[col_name] = [
                        np.random.randint(min_val, max_val + 1)
                        for _ in range(fitting_size)
                    ]
            elif col_type == "float":
                min_val = col_spec.get("min", 0.0)
                max_val = col_spec.get("max", 1.0)
                sample_data[col_name] = [
                    np.random.uniform(min_val, max_val)
                    for _ in range(fitting_size)
                ]
            elif col_type == "category":
                categories = col_spec.get("categories", [])
                sample_data[col_name] = [
                    np.random.choice(categories)
                    for _ in range(fitting_size)
                ]
            elif col_type == "datetime":
                if "generator" in col_spec:
                    generator_str = col_spec["generator"]
                    if generator_str.startswith("faker."):
                        sample_data[col_name] = [
                            self._generate_faker_value(generator_str.split(".", 1)[1])
                            for _ in range(fitting_size)
                        ]
                    elif generator_str.startswith("mimesis."):
                        sample_data[col_name] = [
                            self._generate_mimesis_value(generator_str)
                            for _ in range(fitting_size)
                        ]
                else:
                    # Default to current year's range
                    current_year = datetime.now().year
                    start = datetime(current_year, 1, 1)
                    end = datetime(current_year, 12, 31)
                    sample_data[col_name] = [
                        start + timedelta(
                            seconds=np.random.randint(0, int((end - start).total_seconds()))
                        )
                        for _ in range(fitting_size)
                    ]
            elif col_type == "string":
                if "generator" in col_spec:
                    generator_str = col_spec["generator"]
                    if generator_str == "faker":
                        sample_data[col_name] = [
                            self._generate_faker_value(col_spec.get("type", "string"))
                            for _ in range(fitting_size)
                        ]
                    elif generator_str.startswith("faker."):
                        sample_data[col_name] = [
                            self._generate_faker_value(generator_str.split(".", 1)[1])
                            for _ in range(fitting_size)
                        ]
                    elif generator_str.startswith("mimesis."):
                        sample_data[col_name] = [
                            self._generate_mimesis_value(generator_str)
                            for _ in range(fitting_size)
                        ]
                else:
                    # Default to random string
                    sample_data[col_name] = [
                        ''.join(np.random.choice(list('abcdefghijklmnopqrstuvwxyz'), size=10))
                        for _ in range(fitting_size)
                    ]

        # Create DataFrame and fit synthesizer
        df = pd.DataFrame(sample_data)
        synthesizer = GaussianCopulaSynthesizer(metadata)
        synthesizer.fit(df)
        self.synthesizers[table_name] = synthesizer

    async def generate_synthetic_data(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]],
        rows: int = 1000
    ) -> Dict[str, List[Any]]:
        """Generate synthetic data for a table."""
        # Initialize result dictionary with empty lists for all columns
        result: Dict[str, List[Any]] = {col_name: [] for col_name in schema.keys()}

        # Generate parent tables first if needed
        parent_tables = set()
        for col_name, col_spec in schema.items():
            if col_spec.get("correlated", False):
                parent_table = self._extract_parent_table(col_name)
                parent_tables.add((parent_table, col_name))

        # Generate parent table data if not already generated
        for parent_table, col_name in parent_tables:
            if parent_table not in self.generated_ids or not self.generated_ids[parent_table]:
                if hasattr(self, 'default_schemas') and parent_table in self.default_schemas:
                    parent_schema = self.default_schemas[parent_table]
                    await self.generate_synthetic_data(parent_table, parent_schema, rows)
                else:
                    raise ValueError(f"Parent table {parent_table} schema not found")

        # Generate data for each column
        for _ in range(rows):
            for col_name, col_spec in schema.items():
                col_type = col_spec["type"]
                value = None

                if col_name.endswith("_id") and not col_spec.get("correlated", False):
                    # Generate unique ID
                    value = self._generate_unique_id(table_name, col_spec)
                elif col_spec.get("correlated", False):
                    # Generate correlated ID from parent table
                    parent_table = self._extract_parent_table(col_name)
                    value = self._generate_correlated_id(parent_table)
                # Handle faker types and string types with faker generator
                elif col_spec.get("generator") == "faker":
                    if col_type in {"first_name", "last_name", "email", "phone_number", "address", "text", "date_this_year", "date_this_decade", "date_of_birth"}:
                        value = self._generate_faker_value(col_type)
                    else:
                        value = self._generate_faker_value("text")
                elif col_type == "string":
                    if "generator" in col_spec:
                        if col_spec["generator"].startswith("faker."):
                            value = self._generate_faker_value(col_spec["generator"].split(".", 1)[1])
                        elif col_spec["generator"].startswith("mimesis."):
                            value = self._generate_mimesis_value(col_spec["generator"])
                    elif "categories" in col_spec:
                        value = np.random.choice(col_spec["categories"])
                    else:
                        value = self._generate_faker_value("text")
                elif col_type in ("int", "integer"):
                    min_val = col_spec.get("min", 0)
                    max_val = col_spec.get("max", 100)
                    value = int(np.random.randint(min_val, max_val + 1))
                elif col_type == "float":
                    value = np.random.uniform(col_spec.get("min", 0.0), col_spec.get("max", 1.0))
                elif col_type == "datetime":
                    if "generator" in col_spec:
                        value = self._generate_faker_value(col_spec["generator"])
                    else:
                        value = self._generate_faker_value("date_time_this_decade")
                elif col_type == "category":
                    value = np.random.choice(col_spec["categories"])

                result[col_name].append(value)

        # Store generated IDs for correlated columns
        for col_name, values in result.items():
            if col_name.endswith("_id") and not schema[col_name].get("correlated", False):
                if table_name not in self.generated_ids:
                    self.generated_ids[table_name] = set()
                self.generated_ids[table_name].update(values)

        return result
