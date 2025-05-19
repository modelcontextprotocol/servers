# This file should change to fit your business logic needs
# It contains custom error classes and configuration models

from enum import Enum
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# --- Custom Error Classes --- #


class CalculatorError(Exception):
    # Base class for calculator-related errors.
    # Allows catching specific errors from this module.
    pass


class InvalidOperationError(CalculatorError):
    # Raised when an unsupported operation is requested.
    pass


class DivisionByZeroError(CalculatorError):
    # Raised specifically for division by zero attempts.
    pass


# --- Configuration Model --- #


class SupportedOperations(Enum):
    # Enum defining the standard supported operations.
    # Using an Enum makes the code more readable and type-safe.
    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"


class CalculatorConfig(BaseSettings):
    # Configuration for the Calculator service.
    # Reads from environment variables prefixed with CALCULATOR_.

    # Pydantic Settings configuration.
    model_config = SettingsConfigDict(
        env_prefix="CALCULATOR_",  # Look for env vars like CALCULATOR_ENABLED_OPERATIONS
        env_file=".env",  # Load from .env file if it exists
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore extra fields from the environment
        case_sensitive=False,  # Environment variables are case-insensitive
    )

    # Example configuration: List of enabled operations.
    # Defaults to all supported operations if not set in the environment.
    # Environment variable example: CALCULATOR_ENABLED_OPERATIONS='["add", "subtract"]'
    enabled_operations: list[Literal["add", "subtract", "multiply", "divide"]] = [
        op.value for op in SupportedOperations
    ]

    # Example: A feature flag loaded from environment
    # Environment variable example: CALCULATOR_VERBOSE_ERRORS=true
    verbose_errors: bool = False  # Defaults to False if not set
