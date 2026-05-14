"""Data generation utilities using Faker, Mimesis, NumPy, and SDV."""

from typing import Any, Dict, List, cast
from faker import Faker
from mimesis import Generic
import numpy as np
from numpy.typing import NDArray
from .synthetic import SyntheticDataGenerator


class DataGenerator:
    """Handles data generation using multiple libraries."""

    def __init__(self):
        self.faker = Faker()
        self.generic = Generic()
        self.synthetic = SyntheticDataGenerator()

    async def generate_table(
        self,
        name: str,
        schema: Dict[str, Dict[str, Any]],
        rows: int = 1000
    ) -> Dict[str, List[Any]]:
        """Generate a table of data based on the provided schema.

        Args:
            name: Name of the table
            schema: Column definitions and parameters
            rows: Number of rows to generate

        Returns:
            Dictionary containing the generated data
        """
        data: Dict[str, List[Any]] = {}

        # Use SDV for generating correlated data
        if any(col_spec.get("correlated", False) for col_spec in schema.values()):
            return await self.synthetic.generate_synthetic_data(name, schema, rows)

        # Generate individual columns using specified generators
        for col_name, col_spec in schema.items():
            generator = col_spec.get("generator", "faker")
            data_type = col_spec.get("type", "string")

            if generator == "faker":
                data[col_name] = [
                    getattr(self.faker, data_type)()
                    for _ in range(rows)
                ]
            elif generator == "mimesis":
                data[col_name] = [
                    getattr(self.generic, data_type)()
                    for _ in range(rows)
                ]
            elif generator == "numpy":
                if data_type == "int":
                    int_values: NDArray[np.int64] = np.random.randint(
                        low=col_spec.get("min", 0),
                        high=col_spec.get("max", 100),
                        size=rows,
                        dtype=np.int64
                    )
                    data[col_name] = cast(List[Any], int_values.tolist())
                elif data_type == "float":
                    min_val = float(col_spec.get("min", 0.0))
                    max_val = float(col_spec.get("max", 1.0))
                    float_values = np.random.uniform(
                        low=min_val,
                        high=max_val,
                        size=rows
                    ).astype(np.float64)
                    data[col_name] = cast(List[Any], float_values.tolist())

        return data
