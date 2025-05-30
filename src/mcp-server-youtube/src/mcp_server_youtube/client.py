import asyncio
import logging
import os

from dotenv import load_dotenv
from langchain_core.messages import ToolMessage
from langchain_core.tools import StructuredTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langchain_together import ChatTogether
from langgraph.prebuilt import create_react_agent

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def main():
    try:
        logger.info("Starting the client agent")

        TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")
        model = ChatTogether(
            model="meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
            api_key=TOGETHER_API_KEY,
        )

        logger.info("Connecting to MCP servers")
        async with MultiServerMCPClient(
            {
                "youtube_search_and_transcript": {
                    "url": "http://localhost:8000/sse",
                    "transport": "sse",
                }
            }
        ) as client:
            # List available tools
            logger.info("Creating React agent with available tools")
            tools: list[StructuredTool] = client.get_tools()

            logger.info(f"Available tools {tools}")
            for tool in tools:
                logger.info(f"Tool : {tool}")

            logger.info(f"Available tools: {[tool.name for tool in tools]}")

            # We bind react agent with available tools
            agent = create_react_agent(model, tools)

            logger.info("Invoking agent with query about physics news")
            content = "What are the news about Elon Musk?"

            # In this example the agent will automatially process received data
            youtube_response = await agent.ainvoke(
                {"messages": [{"role": "user", "content": content}]}
            )

            logger.info("Response received from agent")
            print("Youtube response: ", youtube_response["messages"][-1].content)

            # We choose the first tool from tools to use it for data retrieving
            tool: StructuredTool = tools[0]

            parameters = {
                "query": "What are the news about SpaceX?"  # Example query
            }

            # In this example we will get transcrips of the videos and later we can use it somewhere
            result: ToolMessage = await tool.arun(parameters)
            logger.info(result)

    except Exception as e:
        logger.error(f"An error occurred: {str(e)}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(main())
