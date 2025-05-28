import asyncio
import json
import logging
import os
from datetime import datetime
from urllib.parse import parse_qs, urlparse
from dotenv import load_dotenv
from langchain_core.load import dumps
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain_openai import AzureChatOpenAI
from langgraph.prebuilt import create_react_agent
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from constants import SQL_AGENT_PROMPT

# Load environment variables
load_dotenv()


# Define LOG_DIR
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

# Your utility functions here (as already defined)
def generate_log_file_name(function_name):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(LOG_DIR, f"{function_name}_{timestamp}.log")


def setup_logger(log_file):
    logger = logging.getLogger(log_file)
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        handler = logging.FileHandler(log_file)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


class SensitiveDataFilter(logging.Filter):
    SENSITIVE_PATTERNS = [
        "api-key", "authorization", "bearer", "token",
        "password", "secret", "key=", "auth=", "code=", "azmcpcs="
    ]

    def filter(self, record):
        if hasattr(record, "msg") and isinstance(record.msg, str):
            msg_lower = record.msg.lower()
            for pattern in self.SENSITIVE_PATTERNS:
                if pattern in msg_lower:
                    record.msg = f"[REDACTED] HTTP request containing sensitive data - {record.name}"
                    break
        return True


def setup_secure_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.StreamHandler()],
    )

    # Security filters
    sensitive_filter = SensitiveDataFilter()

    # Add filter to all loggers
    for name in logging.root.manager.loggerDict:
        target_logger = logging.getLogger(name)
        target_logger.addFilter(sensitive_filter)

    # Silence verbose libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("mcp").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)
    logging.getLogger("azure").setLevel(logging.WARNING)

    return logging.getLogger(__name__)
# Initialize secure logging
# logger = setup_secure_logging()


def sanitize_url(url: str) -> str:
    """Remove sensitive parts of a URL for safe logging."""
    parsed = urlparse(url)
    # Remove auth info (username:password@)
    netloc = (
        parsed.netloc.split("@")[-1] if "@" in parsed.netloc else parsed.netloc
    )
    # Remove token or other secret query params
    query = "&".join([f"{k}=..." for k in parse_qs(parsed.query).keys()])
    return parsed._replace(netloc=netloc, query=query).geturl()


async def main():
    log_file = generate_log_file_name(__name__)
    logger = setup_logger(log_file)
    try:
        azure_func_uri = os.environ.get(
            "AZURE_FUNC_URI", "http://localhost:3000/mcp"
        )
        sanitized_url = sanitize_url(azure_func_uri)
        logger.info(f"Connecting to MCP server at {sanitized_url}")

        async with streamablehttp_client(azure_func_uri) as (read, write, _):
            async with ClientSession(read, write) as session:
                try:
                    await session.initialize()
                    logger.info("MCP session initialized successfully")

                    logger.info("Loading tools from MCP server...")
                    tools = await load_mcp_tools(session)
                    logger.info(f"Loaded {len(tools)} tools")

                    deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT")
                    api_version = os.getenv("AZURE_OPENAI_API_VERSION")

                    if not deployment_name or not api_version:
                        logger.error(
                            "Missing required Azure OpenAI environment variables."
                        )
                        return

                    logger.info(
                        f"Using Azure deployment: {deployment_name}, API version: {api_version}"
                    )

                    # Option: Add additional logging configuration for Azure OpenAI client
                    llm = AzureChatOpenAI(
                        azure_deployment=deployment_name,
                        api_version=api_version,
                        timeout=None,
                        max_retries=2,
                        # Disable detailed HTTP logging if available
                        model_kwargs={
                            "stream": False
                        },  # Reduces some logging verbosity
                    )
                    prompt = """
                    Check user query and create SQL code based on it.
                    List the table schemas, keys and find the most suitable SQL code.
                    Then execute the sql code.
                    """
                    logger.info("Creating ReAct agent...")
                    agent = create_react_agent(
                        llm, tools, prompt=SQL_AGENT_PROMPT
                    )

                    logger.info("Invoking agent...")
                    response = await agent.ainvoke(
                        {
                            "messages": [
                                {
                                    "role": "user",
                                    "content": "自社1のCISとDRAMの売上を表で教えてください。",
                                }
                            ]
                        }
                    )

                    logger.info("Agent response received successfully")
                    logger.debug(f"Raw agent response: {response}")

                    result = dumps(response, pretty=True)
                    data = json.loads(result)

                    output_dir = "json_results"
                    os.makedirs(output_dir, exist_ok=True)
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"result_{timestamp}.json"
                    output_path = os.path.join(output_dir, filename)

                    # Write the data to a JSON file
                    with open(output_path, "w") as json_file:
                        json.dump(data, json_file, indent=4)

                    logger.info(f"Response saved to {output_path}")

                except Exception as e:
                    logger.exception("Error during agent execution: %s", str(e))
    except Exception as e:
        logger.exception("Critical error in main function: %s", str(e))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Script interrupted by user.")
    except Exception as e:
        logger.critical("Unhandled exception in asyncio loop: %s", str(e))
