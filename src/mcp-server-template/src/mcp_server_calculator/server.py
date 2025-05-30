## This file structure should stay the same for all MCP servers
## It is responsible for defining the MCP server and its tools
## But the exact content (lifespan server, tool definitions, etc)
## Should be edited to fit your needs

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from enum import StrEnum
from typing import Literal

from mcp.server import Server
from mcp.types import TextContent, Tool
# --- Calculator Module Imports ---
from mcp_server_calculator.calculator import (CalculatorClient,
                                              CalculatorError,
                                              get_calculator_client)
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)

# --- Tool Input/Output Schemas --- #

## Feel free to add more schemas here!
## Each tool will likely have its own schema


class CalculatorRequest(BaseModel):
    """Input schema for the calculate tool."""

    operation: Literal["add", "subtract", "multiply", "divide"] = Field(
        ..., description="The mathematical operation to perform."
    )
    operand1: float = Field(..., description="The first number for the operation.")
    operand2: float = Field(..., description="The second number for the operation.")


# --- Tool Name Enums --- #

## Feel free to add more tool names here!
## Each tool should have its own name


class ToolNames(StrEnum):
    CALCULATE = "calculate"


# --- Lifespan Management for MCP Server --- #
# Lifespan is usually used for initializing and cleaning up resources
# when using some external API's or Databases
#
# It also can be used for stroing shared dependencies, like in this case
# (A single CalculatorClient instance is being shared)


@asynccontextmanager
async def server_lifespan(server: Server) -> AsyncIterator[dict]:
    """Manage server startup/shutdown. Initializes required services."""
    logger.info("Lifespan: Initializing services...")
    context = {}

    try:
        # Initialize Calculator Client
        calculator_client: CalculatorClient = get_calculator_client()

        # Add the calculator client to the context so we could call it in the tools
        context["calculator_client"] = calculator_client

        logger.info("Lifespan: Services initialized successfully.")
        yield context

    except CalculatorError as init_err:
        logger.error(
            f"FATAL: Lifespan initialization failed: {init_err}", 
            exc_info=True
        )
        raise init_err

    except Exception as startup_err:
        logger.error(
            f"FATAL: Unexpected error during lifespan initialization: {startup_err}",
            exc_info=True,
        )
        raise startup_err

    finally:
        logger.info("Lifespan: Shutdown cleanup (if any).")


# --- MCP Server Initialization --- #

server = Server("calculator-server", lifespan=server_lifespan)


# --- Tool Definitions --- #
# Feel free to add more tools here!


@server.list_tools()
async def list_tools() -> list[Tool]:
    logger.debug("Listing available tools.")

    # Calculator Tool
    return [
        Tool(
            name=ToolNames.CALCULATE.value,
            description="Performs basic arithmetic operations (add, subtract, multiply, divide).",
            inputSchema=CalculatorRequest.model_json_schema(),
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handles incoming tool calls."""
    logger.info(f"Received call_tool request for '{name}'")

    # Get shared dependency from context (was initialized in lifespan)
    calculator_client: CalculatorClient = server.request_context.lifespan_context.get(
        "calculator_client"
    )

    # --- Tool Business Logic --- #
    match name:
        ## Feel free to add more cases here!
        ## Each listed tool should have its own case

        case ToolNames.CALCULATE.value:
            try:
                # 1. Validate Input
                request = CalculatorRequest(**arguments)

                # 2. Execute Core Logic
                result = calculator_client.calculate(
                    operation=request.operation,
                    operand1=request.operand1,
                    operand2=request.operand2,
                )

                # 3. Format Response
                logger.info(
                    f"Successfully processed '{name}' request. Result: {result}"
                )
                return [TextContent(type="text", text=f"Calculation result: {result}")]

            except ValidationError as ve:
                error_msg = f"Invalid arguments for tool '{name}': {ve}"
                logger.warning(error_msg)
                return [TextContent(type="text", text=error_msg)]

            except CalculatorError as calc_base_err:
                error_msg = f"A calculator error occurred: {calc_base_err}"
                logger.error(error_msg, exc_info=True)
                return [TextContent(type="text", text=error_msg)]

            except Exception as e:
                error_msg = f"An unexpected error occurred processing tool '{name}'."
                logger.error(
                    f"Unexpected error processing tool '{name}': {e}", exc_info=True
                )
                return [TextContent(type="text", text=error_msg)]

        case _:
            logger.warning(f"Received call for unknown tool: {name}")
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
