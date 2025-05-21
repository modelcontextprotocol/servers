# This file should change to fit your business logic needs
# It contains the core logic of the module, implementing abstractions
# defined in the __init__.py file

import logging
from functools import lru_cache
from typing import Literal

from mcp_server_calculator.calculator.config import (CalculatorConfig,
                                                     DivisionByZeroError,
                                                     InvalidOperationError)

# --- Logger Setup --- #

# It's good practice to have a module-level logger.
# The actual configuration (level, handlers) is usually done in the main application entry point.
logger = logging.getLogger(__name__)

# --- Calculator Client Class --- #


class CalculatorClient:
    # Client class to perform calculator operations.
    # It takes a configuration object during initialization.

    def __init__(self, config: CalculatorConfig):
        # Store the configuration.
        self.config = config
        logger.info("CalculatorClient initialized.")
        logger.debug(f"Enabled operations: {self.config.enabled_operations}")

    def _check_operation_enabled(self, operation: str) -> None:
        # Internal helper method to check if an operation is allowed by the config.
        if operation not in self.config.enabled_operations:
            logger.warning(f"Attempted disabled operation: {operation}")
            raise InvalidOperationError(f"Operation '{operation}' is not enabled.")

    def calculate(
        self,
        operation: Literal["add", "subtract", "multiply", "divide"],
        operand1: float,
        operand2: float,
    ) -> float:
        # Performs the calculation based on the operation string.

        # First, check if the requested operation is enabled in the configuration.
        self._check_operation_enabled(operation)

        logger.info(
            f"Performing operation: {operation} with operands {operand1}, {operand2}"
        )

        match operation:
            case "add":
                result = operand1 + operand2
            case "subtract":
                result = operand1 - operand2
            case "multiply":
                result = operand1 * operand2
            case "divide":
                if operand2 == 0:
                    logger.error("Division by zero attempted.")
                    raise DivisionByZeroError("Cannot divide by zero.")
                result = operand1 / operand2
            case _:
                logger.error(f"Encountered unexpected operation: {operation}")
                raise InvalidOperationError(
                    f"Unexpected internal error for operation: {operation}"
                )

        logger.info(f"Calculation result: {result}")
        return result


# --- Dependency Provider --- #


# Use lru_cache(maxsize=1) as a simple singleton pattern.
# This ensures that we only create one instance of the config and the client.
# This is a good practice for performance and memory management.
@lru_cache(maxsize=1)
def get_calculator_client() -> CalculatorClient:
    logger.debug("Creating CalculatorClient instance...")
    config = CalculatorConfig()
    return CalculatorClient(config=config)
