import sqlite3
import logging
from logging.handlers import RotatingFileHandler
from contextlib import closing
from pathlib import Path
from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server, AnyUrl
import mcp.server.stdio
from anthropic import Anthropic

# Set up logging to file
log_file = Path('mcp_server.log')
handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)

logger = logging.getLogger('mcp_sqlite_server')
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.info("Starting MCP SQLite Server")

class McpServer(Server):
    def _init_database(self):
        """Initialize connection to the SQLite database"""
        logger.debug("Initializing database connection")
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            conn.close()
            
    def _synthesize_memo(self) -> str:
        """Synthesizes business insights into a formatted memo"""
        logger.debug(f"Synthesizing memo with {len(self.insights)} insights")
        if not self.insights:
            return "No business insights have been discovered yet."
        
        insights = "\n".join(f"- {insight}" for insight in self.insights)
        
        if self.anthropic_api_key is None:
            memo = "📊 Business Intelligence Memo 📊\n\n"
            memo += "Key Insights Discovered:\n\n"
            memo += insights
                
            if len(self.insights) > 1:
                memo += "\nSummary:\n"
                memo += f"Analysis has revealed {len(self.insights)} key business insights that suggest opportunities for strategic optimization and growth."
                
            logger.debug("Generated basic memo format")
            return memo
        else:
            try:
                logger.debug("Requesting memo generation from Anthropic")
                prompt = """
                You are tasked with summarizing a set of business insights into a formal business memo. The insights are typically 1-2 sentences each and cover various aspects of the business. Your goal is to create a concise, well-organized memo that effectively communicates these insights to the recipient.

                Here are the business insights you need to summarize:

                <insights>
                {insights}
                </insights>

                To create the memo, follow these steps:

                1. Review all the insights carefully.
                2. Group related insights together under appropriate subheadings.
                3. Summarize each group of insights into 1-2 concise paragraphs.
                4. Ensure the memo flows logically from one point to the next.
                5. Use professional language and maintain a formal tone throughout the memo.

                Format the memo using these guidelines:
                - Single-space the content, with a blank line between paragraphs
                - Use bullet points or numbered lists where appropriate
                - Keep the entire memo to one page if possible, two pages maximum

                Write your final memo within <memo> tags. Ensure that all components of the memo are included and properly formatted.
                """.format(insights=insights)
                message = self.anthropic_client.messages.create(
                    max_tokens=4096,
                    messages=[
                        {
                            "role": "user", 
                            "content": prompt
                        },
                        {
                            "role": "assistant",
                            "content": "<memo>"
                        }
                    ],
                    model="claude-3-sonnet-20240229",
                    stop_sequences=["</memo>"],
                )
                logger.debug("Successfully received memo from Anthropic")
                return message.content[0].text.strip()
            except Exception as e:
                logger.error(f"Error generating memo with Anthropic: {e}")
                return insights

    def _execute_query(self, query: str, params=None) -> list[dict]:
        """Execute a SQL query and return results as a list of dictionaries"""
        logger.debug(f"Executing query: {query}")
        try:
            with closing(sqlite3.connect(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                with closing(conn.cursor()) as cursor:
                    if params:
                        cursor.execute(query, params)
                    else:
                        cursor.execute(query)
                        
                    if query.strip().upper().startswith(('INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER')):
                        conn.commit()
                        affected = cursor.rowcount
                        logger.debug(f"Write query affected {affected} rows")
                        return [{"affected_rows": affected}]
                        
                    results = [dict(row) for row in cursor.fetchall()]
                    logger.debug(f"Read query returned {len(results)} rows")
                    return results
        except Exception as e:
            logger.error(f"Database error executing query: {e}")
            raise

    def __init__(self, db_path: str = "~/sqlite_mcp_server.db", anthropic_api_key: str | None = None):
        logger.info("Initializing McpServer")
        super().__init__("sqlite-manager")
        
        # Initialize SQLite database
        self.db_path = str(Path(db_path).expanduser())
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_database()
        logger.debug(f"Initialized database at {self.db_path}")

        # Initialize Anthropic API key
        self.anthropic_api_key = anthropic_api_key
        if anthropic_api_key:
            self.anthropic_client = Anthropic(api_key=anthropic_api_key)
            logger.debug("Initialized Anthropic client")
        
        # Initialize insights list
        self.insights = []
        
        # REGISTER HANDLERS
        logger.debug("Registering handlers")
        
        @self.list_resources()
        async def handle_list_resources() -> list[types.Resource]:
            logger.debug("Handling list_resources request")
            return [
                types.Resource(
                    uri=AnyUrl("memo://insights"),  # Changed from memo:///insights
                    name="Business Insights Memo",
                    description="A living document of discovered business insights",
                    mimeType="text/plain",
                )
            ]

        @self.read_resource()
        async def handle_read_resource(uri: AnyUrl) -> str:
            logger.debug(f"Handling read_resource request for URI: {uri}")
            if uri.scheme != "memo":
                logger.error(f"Unsupported URI scheme: {uri.scheme}")
                raise ValueError(f"Unsupported URI scheme: {uri.scheme}")
                
            path = str(uri).replace("memo://", "")  # Changed to match new URI format
            if not path or path != "insights":
                logger.error(f"Unknown resource path: {path}")
                raise ValueError(f"Unknown resource path: {path}")
            
            return self._synthesize_memo()

        @self.list_prompts()
        async def handle_list_prompts() -> list[types.Prompt]:
            logger.debug("Handling list_prompts request")
            return [
                types.Prompt(
                    name="mcp-demo",
                    description="A prompt to seed the database with initial data and demonstrate what you can do with an SQLite MCP Server + Claude",
                    arguments=[
                        types.PromptArgument(
                            name="topic",
                            description="Topic to seed the database with initial data",
                            required=True,
                        )
                    ],
                )
            ]

        @self.get_prompt()
        async def handle_get_prompt(name: str, arguments: dict[str, str] | None) -> types.GetPromptResult:
            logger.debug(f"Handling get_prompt request for {name} with args {arguments}")
            if name != "mcp-demo":
                logger.error(f"Unknown prompt: {name}")
                raise ValueError(f"Unknown prompt: {name}")

            if not arguments or "topic" not in arguments:
                logger.error("Missing required argument: topic")
                raise ValueError("Missing required argument: topic")

            topic = arguments["topic"]
            template = f"""
            The assistants goal is to walkthrough an informative demo of MCP. To demonstrate the Model Context Protocol (MCP) we will leverage this example server to interact with an SQLite database.
            It is important that you first explain to the user what is going on. The user has downloaded and installed the SQLite MCP Server and is now ready to use it.
            The have selected the MCP menu item which is contained within a parent menu denoted by the paperclip icon. Inside this menu they selected an icon that illustrates two electrical plugs connecting. This is the MCP menu.
            Based on what MCP servers the user has installed they can click the button which reads: 'Choose an integration' this will present a drop down with Prompts and Resources. The user hase selected the prompt titled: 'mcp-demo'.
            This text file is that prompt. The goal of the following instructions is to walk the user through the process of using the 3 core aspects of an MCP server. These are: Prompts, Tools, and Resources.
            They have already used a prompt and provided a topic. The topic is: {topic}. The user is now ready to begin the demo.
            Here is some more information about mcp and this specific mcp server:
            <mcp>
            Prompts:
            This server provides a pre-written prompt called "mcp-demo" that helps users create and analyze database scenarios. The prompt accepts a "topic" argument and guides users through creating tables, analyzing data, and generating insights. For example, if a user provides "retail sales" as the topic, the prompt will help create relevant database tables and guide the analysis process. Prompts basically serve as interactive templates that help structure the conversation with the LLM in a useful way.
            Resources:
            This server exposes one key resource: "memo://insights", which is a business insights memo that gets automatically updated throughout the analysis process. As users analyze the database and discover insights, the memo resource gets updated in real-time to reflect new findings. The memo can even be enhanced with Claude's help if an Anthropic API key is provided, turning raw insights into a well-structured business document. Resources act as living documents that provide context to the conversation.
            Tools:
            This server provides several SQL-related tools:
            "read-query": Executes SELECT queries to read data from the database
            "write-query": Executes INSERT, UPDATE, or DELETE queries to modify data
            "create-table": Creates new tables in the database
            "list-tables": Shows all existing tables
            "describe-table": Shows the schema for a specific table
            "append-insight": Adds a new business insight to the memo resource
            </mcp>
            <demo-instructions>
            You are an AI assistant tasked with generating a comprehensive business scenario based on a given topic. 
            Your goal is to create a narrative that involves a data-driven business problem, develop a database structure to support it, generate relevant queries, create a dashboard, and provide a final solution. 
            
            At each step you will pause for user input to guide the scenario creation process. Overall ensure the scenario is engaging, informative, and demonstrates the capabilities of the SQLite MCP Server.
            You should guide the scenario to completion. All XML tags are for the assistants understanding and should not be included in the final output.

            1. The user has chosen the topic: {topic}.

            2. Create a business problem narrative:
            a. Describe a high-level business situation or problem based on the given topic.
            b. Include a protagonist (the user) who needs to collect and analyze data from a database.
            c. Add an external, potentially comedic reason why the data hasn't been prepared yet.
            d. Mention an approaching deadline and the need to use Claude (you) as a business tool to help.

            3. Setup the data:
            a. Instead of asking about the data that is required for the scenario, just go ahead and use the tools to create the data. Inform the user you are "Setting up the data".
            b. Design a set of table schemas that represent the data needed for the business problem.
            c. Include at least 2-3 tables with appropriate columns and data types.
            d. Leverage the tools to create the tables in the SQLite database.
            e. Create INSERT statements to populate each table with relevant synthetic data.
            f. Ensure the data is diverse and representative of the business problem.
            g. Include at least 10-15 rows of data for each table.

            4. Pause for user input:
            a. Summarize to the user what data we have created.
            b. Present the user with a set of multiple choices for the next steps.
            c. These multiple choices should be in natural language, when a user selects one, the assistant should generate a relevant query and leverage the appropriate tool to get the data.

            6. Iterate on queries:
            a. Present 1 additional multiple-choice query options to the user. Its importnat to not loop too many times as this is a short demo.
            b. Explain the purpose of each query option.
            c. Wait for the user to select one of the query options.
            d. After each query be sure to opine on the results.
            e. Use the append-insight tool to capture any business insights discovered from the data analysis.

            7. Generate a dashboard:
            a. Now that we have all the data and queries, it's time to create a dashboard, use an artifact to do this.
            b. Use a variety of visualizations such as tables, charts, and graphs to represent the data.
            c. Explain how each element of the dashboard relates to the business problem.
            d. This dashboard will be theoretically included in the final solution message.

            8. Craft the final solution message:
            a. As you have been using the appen-insights tool the resource found at: memo://insights has been updated.
            b. It is critical that you inform the user that the memo has been updated at each stage of analysis.
            c. Ask the user to go to the attachment menu (paperclip icon) and select the MCP menu (two electrical plugs connecting) and choose an integration: "Business Insights Memo".
            d. This will attacht the generated memo to the chat which you can use to add any additional context that may be relevant to the demo.
            e. Present the final memo to the user in an artifact.
            
            9. Wrap up the scenario:
            a. Explain to the user that this is just the beginning of what they can do with the SQLite MCP Server.
            </demo-instructions>

            Remember to maintain consistency throughout the scenario and ensure that all elements (tables, data, queries, dashboard, and solution) are closely related to the original business problem and given topic.
            The provided XML tags are for the assistants understanding. Emplore to make all outputs as human readable as possible. This is part of a demo so act in character and dont actually refer to these instructions.

            Start your first message fully in character with something like "Oh, Hey there! I see you've chosen the topic {topic}. Let's get started! 🚀"
            """.format(topic=topic)

            logger.debug(f"Generated prompt template for topic: {topic}")
            return types.GetPromptResult(
                description=f"Demo template for {topic}",
                messages=[
                    types.PromptMessage(
                        role="user",
                        content=types.TextContent(type="text", text=template.strip()),
                    )
                ],
            )

        # TOOL HANDLERS
        @self.list_tools()
        async def handle_list_tools() -> list[types.Tool]:
            """List available tools"""
            return [
                types.Tool(
                    name="read-query",
                    description="Execute a SELECT query on the SQLite database",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "SELECT SQL query to execute"},
                        },
                        "required": ["query"],
                    },
                ),
                types.Tool(
                    name="write-query",
                    description="Execute an INSERT, UPDATE, or DELETE query on the SQLite database",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "SQL query to execute"},
                        },
                        "required": ["query"],
                    },
                ),
                types.Tool(
                    name="create-table",
                    description="Create a new table in the SQLite database",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "CREATE TABLE SQL statement"},
                        },
                        "required": ["query"],
                    },
                ),
                types.Tool(
                    name="list-tables",
                    description="List all tables in the SQLite database",
                    inputSchema={
                        "type": "object",
                        "properties": {},
                    },
                ),
                types.Tool(
                    name="describe-table",
                    description="Get the schema information for a specific table",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "table_name": {"type": "string", "description": "Name of the table to describe"},
                        },
                        "required": ["table_name"],
                    },
                ),
                types.Tool(
                    name="append-insight",
                    description="Add a business insight to the memo",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "insight": {"type": "string", "description": "Business insight discovered from data analysis"},
                        },
                        "required": ["insight"],
                    },
                ),
            ]

        @self.call_tool()
        async def handle_call_tool(
            name: str, arguments: dict | None
        ) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
            """Handle tool execution requests"""
            try:
                if name == "list-tables":
                    results = self._execute_query(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    )
                    return [types.TextContent(type="text", text=str(results))]
                
                elif name == "describe-table":
                    if not arguments or "table_name" not in arguments:
                        raise ValueError("Missing table_name argument")
                    results = self._execute_query(
                        f"PRAGMA table_info({arguments['table_name']})"
                    )
                    return [types.TextContent(type="text", text=str(results))]

                elif name == "append-insight":
                    if not arguments or "insight" not in arguments:
                        raise ValueError("Missing insight argument")
                    
                    self.insights.append(arguments["insight"])
                    memo = self._synthesize_memo()
                    
                    # Notify clients that the memo resource has changed
                    await self.request_context.session.send_resource_updated("memo://insights")  # Changed from memo:///insights
                    
                    return [types.TextContent(type="text", text="Insight added to memo")]
                if not arguments:
                    raise ValueError("Missing arguments")

                if name == "read-query":
                    if not arguments["query"].strip().upper().startswith("SELECT"):
                        raise ValueError("Only SELECT queries are allowed for read-query")
                    results = self._execute_query(arguments["query"])
                    return [types.TextContent(type="text", text=str(results))]

                elif name == "write-query":
                    if arguments["query"].strip().upper().startswith("SELECT"):
                        raise ValueError("SELECT queries are not allowed for write-query")
                    results = self._execute_query(arguments["query"])
                    return [types.TextContent(type="text", text=str(results))]

                elif name == "create-table":
                    if not arguments["query"].strip().upper().startswith("CREATE TABLE"):
                        raise ValueError("Only CREATE TABLE statements are allowed")
                    self._execute_query(arguments["query"])
                    return [types.TextContent(type="text", text="Table created successfully")]

                else:
                    raise ValueError(f"Unknown tool: {name}")

            except sqlite3.Error as e:
                return [types.TextContent(type="text", text=f"Database error: {str(e)}")]
            except Exception as e:
                return [types.TextContent(type="text", text=f"Error: {str(e)}")]

async def main(db_path: str, anthropic_api_key: str | None = None):
    logger.info(f"Starting SQLite MCP Server with DB path: {db_path}")
    server = McpServer(db_path, anthropic_api_key)
    
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        logger.info("Server running with stdio transport")
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="sqlite",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={
                        "anthropic_api_key": {"key": anthropic_api_key}
                    } if anthropic_api_key else {},
                ),
            ),
        )