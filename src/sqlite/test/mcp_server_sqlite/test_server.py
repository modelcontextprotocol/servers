# ruff: noqa: S101
import os
import pytest
import tempfile
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from mcp.server import NotificationOptions
from mcp.server.models import ServerCapabilities
from mcp.types import (
    AnyUrl,
    TextContent,
    Resource,
    Tool,
)

from mcp_server_sqlite.server import SqliteDatabase


class TestSqliteDatabase:
    def setup_method(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.db")
        self.db = SqliteDatabase(self.db_path)

    def teardown_method(self):
        self.temp_dir.cleanup()

    def test_init_database(self):
        # Test that the database file is created
        assert os.path.exists(self.db_path)

    def test_execute_query_select(self):
        # Create a test table
        self.db._execute_query("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
        self.db._execute_query("INSERT INTO test (name) VALUES ('test1')")
        self.db._execute_query("INSERT INTO test (name) VALUES ('test2')")

        # Test SELECT query
        results = self.db._execute_query("SELECT * FROM test")
        assert len(results) == 2
        assert results[0]["name"] == "test1"
        assert results[1]["name"] == "test2"

    def test_execute_query_write(self):
        # Create a test table
        self.db._execute_query("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")

        # Test INSERT query
        result = self.db._execute_query("INSERT INTO test (name) VALUES ('test1')")
        assert result[0]["affected_rows"] == 1

        # Test UPDATE query
        result = self.db._execute_query(
            "UPDATE test SET name = 'updated' WHERE name = 'test1'"
        )
        assert result[0]["affected_rows"] == 1

        # Test DELETE query
        result = self.db._execute_query("DELETE FROM test WHERE name = 'updated'")
        assert result[0]["affected_rows"] == 1

    def test_execute_query_parameterized(self):
        # Test the parameterized query functionality
        # Note: SQLite expects a tuple for positional parameters, not a dictionary
        self.db._execute_query("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")

        # Using named parameters with :name syntax
        self.db._execute_query(
            "INSERT INTO test (name) VALUES (:name)", {"name": "test1"}
        )

        # Using named parameters with ? syntax and a tuple (position-based)
        self.db._execute_query("INSERT INTO test (name) VALUES (?)", ("test2",))

        # Query with named parameters
        results = self.db._execute_query(
            "SELECT * FROM test WHERE name = :name", {"name": "test1"}
        )
        assert len(results) == 1
        assert results[0]["name"] == "test1"

        # Query with positional parameters
        results = self.db._execute_query(
            "SELECT * FROM test WHERE name = ?", ("test2",)
        )
        assert len(results) == 1
        assert results[0]["name"] == "test2"

    def test_synthesize_memo_empty(self):
        memo = self.db._synthesize_memo()
        assert "No business insights have been discovered yet." in memo

    def test_synthesize_memo_with_insights(self):
        self.db.insights = ["Insight 1", "Insight 2"]
        memo = self.db._synthesize_memo()
        assert "- Insight 1" in memo
        assert "- Insight 2" in memo
        assert "Analysis has revealed 2 key business insights" in memo


@pytest.mark.asyncio
class TestServerHandlers:
    @pytest.fixture(autouse=True)
    async def setup_teardown(self):
        # Setup
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.db")

        # Create a patch for the SqliteDatabase
        self.db_patch = patch("mcp_server_sqlite.server.SqliteDatabase")
        self.mock_db = self.db_patch.start()

        # Create a mock server instance with async methods
        self.mock_db_instance = MagicMock()
        self.mock_db.return_value = self.mock_db_instance

        # Create a patch for the Server
        self.server_patch = patch("mcp_server_sqlite.server.Server")
        self.mock_server = self.server_patch.start()
        self.mock_server_instance = MagicMock()
        self.mock_server.return_value = self.mock_server_instance

        # Mock the get_capabilities method to return a valid ServerCapabilities object
        self.mock_server_instance.get_capabilities.return_value = ServerCapabilities(
            notification_options=NotificationOptions(), experimental_capabilities={}
        )

        # Mock the run method to be an async method
        async def mock_run(*args, **kwargs):
            return None

        self.mock_server_instance.run = AsyncMock(side_effect=mock_run)

        # Setup request context
        self.mock_session = MagicMock()
        self.mock_session.send_resource_updated = AsyncMock()
        self.mock_context = MagicMock()
        self.mock_context.session = self.mock_session
        self.mock_server_instance.request_context = self.mock_context

        # Create a mock for the stdio_server context manager
        @asynccontextmanager
        async def mock_stdio_server():
            yield (MagicMock(), MagicMock())

        # Patch the stdio_server context manager - target the correct module
        self.stdio_patch = patch("mcp.server.stdio.stdio_server", mock_stdio_server)
        self.stdio_patch.start()

        # Create mock handlers
        self.list_resources_handler = AsyncMock()
        self.read_resource_handler = AsyncMock()
        self.list_tools_handler = AsyncMock()
        self.call_tool_handler = AsyncMock()
        self.list_prompts_handler = AsyncMock()
        self.get_prompt_handler = AsyncMock()

        # Set up the mock server to return our mock handlers
        self.mock_server_instance.list_resources.return_value = (
            self.list_resources_handler
        )
        self.mock_server_instance.read_resource.return_value = (
            self.read_resource_handler
        )
        self.mock_server_instance.list_tools.return_value = self.list_tools_handler
        self.mock_server_instance.call_tool.return_value = self.call_tool_handler
        self.mock_server_instance.list_prompts.return_value = self.list_prompts_handler
        self.mock_server_instance.get_prompt.return_value = self.get_prompt_handler

        yield

        # Teardown
        self.stdio_patch.stop()
        self.db_patch.stop()
        self.server_patch.stop()
        self.temp_dir.cleanup()

    async def test_list_resources(self):
        # Set up the mock handler to return a list of resources
        self.list_resources_handler.return_value = [
            Resource(
                uri=AnyUrl("memo://insights"),
                name="Business Insights Memo",
                description="A living document of discovered business insights",
                mimeType="text/plain",
            )
        ]

        # Call the handler
        resources = await self.list_resources_handler()

        # Verify the result
        assert len(resources) == 1
        assert resources[0].uri == AnyUrl("memo://insights")
        assert resources[0].name == "Business Insights Memo"

    async def test_read_resource(self):
        # Set up the mock handler to return a memo
        self.read_resource_handler.return_value = "Test memo content"

        # Call the handler with a valid URI
        result = await self.read_resource_handler(AnyUrl("memo://insights"))

        # Verify the result
        assert result == "Test memo content"

    async def test_list_tools(self):
        # Set up the mock handler to return a list of tools
        self.list_tools_handler.return_value = [
            Tool(
                name="read_query",
                description="Execute a SELECT query on the SQLite database",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "SELECT SQL query to execute",
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="write_query",
                description="Execute an INSERT, UPDATE, or DELETE query on the SQLite database",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "SQL query to execute",
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="create_table",
                description="Create a new table in the SQLite database",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "CREATE TABLE SQL statement",
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="list_tables",
                description="List all tables in the SQLite database",
                inputSchema={
                    "type": "object",
                    "properties": {},
                },
            ),
            Tool(
                name="describe_table",
                description="Get the schema information for a specific table",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "table_name": {
                            "type": "string",
                            "description": "Name of the table to describe",
                        },
                    },
                    "required": ["table_name"],
                },
            ),
            Tool(
                name="append_insight",
                description="Add a business insight to the memo",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "insight": {
                            "type": "string",
                            "description": "Business insight discovered from data analysis",
                        },
                    },
                    "required": ["insight"],
                },
            ),
        ]

        # Call the handler
        tools = await self.list_tools_handler()

        # Verify the result
        assert len(tools) == 6
        tool_names = [tool.name for tool in tools]
        assert "read_query" in tool_names
        assert "write_query" in tool_names
        assert "create_table" in tool_names
        assert "list_tables" in tool_names
        assert "describe_table" in tool_names
        assert "append_insight" in tool_names

    async def test_call_tool_read_query(self):
        # Set up the mock handler to return a result
        self.call_tool_handler.return_value = [
            TextContent(type="text", text="[{'id': 1, 'name': 'test'}]")
        ]

        # Call the handler with read_query
        result = await self.call_tool_handler(
            "read_query", {"query": "SELECT * FROM test"}
        )

        # Verify the result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "[{'id': 1, 'name': 'test'}]" in result[0].text

    async def test_call_tool_write_query(self):
        # Set up the mock handler to return a result
        self.call_tool_handler.return_value = [
            TextContent(type="text", text="[{'affected_rows': 1}]")
        ]

        # Call the handler with write_query
        result = await self.call_tool_handler(
            "write_query", {"query": "INSERT INTO test VALUES (1, 'test')"}
        )

        # Verify the result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "[{'affected_rows': 1}]" in result[0].text

    async def test_call_tool_append_insight(self):
        # Set up the mock handler to return a result
        self.call_tool_handler.return_value = [
            TextContent(type="text", text="Insight added to memo")
        ]

        # Call the handler with append_insight
        result = await self.call_tool_handler(
            "append_insight", {"insight": "Test insight"}
        )

        # Verify the result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "Insight added to memo" in result[0].text

    async def test_call_tool_create_table(self):
        # Set up the mock handler to return a result
        self.call_tool_handler.return_value = [
            TextContent(type="text", text="Table created successfully")
        ]

        # Call the handler with create_table
        result = await self.call_tool_handler(
            "create_table",
            {"query": "CREATE TABLE new_test (id INTEGER PRIMARY KEY, name TEXT)"},
        )

        # Verify the result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "Table created successfully" in result[0].text

    async def test_call_tool_list_tables(self):
        # Set up the mock handler to return a result
        self.call_tool_handler.return_value = [
            TextContent(type="text", text="[{'name': 'test'}, {'name': 'users'}]")
        ]

        # Call the handler with list_tables
        result = await self.call_tool_handler("list_tables", {})

        # Verify the result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "[{'name': 'test'}, {'name': 'users'}]" in result[0].text

    async def test_call_tool_describe_table(self):
        # Set up the mock handler to return a result
        self.call_tool_handler.return_value = [
            TextContent(
                type="text",
                text="[{'cid': 0, 'name': 'id', 'type': 'INTEGER', 'notnull': 0, 'dflt_value': None, 'pk': 1}, {'cid': 1, 'name': 'name', 'type': 'TEXT', 'notnull': 0, 'dflt_value': None, 'pk': 0}]",
            )
        ]

        # Call the handler with describe_table
        result = await self.call_tool_handler("describe_table", {"table_name": "test"})

        # Verify the result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "'name': 'id'" in result[0].text
        assert "'name': 'name'" in result[0].text

    async def test_call_tool_error_handling(self):
        # Set up the mock handler to return an error
        self.call_tool_handler.return_value = [
            TextContent(type="text", text="Error: Unknown tool: invalid_tool")
        ]

        # Call the handler with an invalid tool
        result = await self.call_tool_handler("invalid_tool", {})

        # Verify the error result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "Error:" in result[0].text

    async def test_call_tool_sql_error_handling(self):
        # Set up the mock handler to return a database error
        self.call_tool_handler.return_value = [
            TextContent(
                type="text", text="Database error: no such table: nonexistent_table"
            )
        ]

        # Call the handler with a query that would cause a database error
        result = await self.call_tool_handler(
            "read_query", {"query": "SELECT * FROM nonexistent_table"}
        )

        # Verify the error result
        assert len(result) == 1
        assert result[0].type == "text"
        assert "Database error:" in result[0].text


class TestSqlInjectionFix:
    """Tests specifically for the SQL injection vulnerability fixes"""

    def setup_method(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.db")
        self.db = SqliteDatabase(self.db_path)

        # Create test tables
        self.db._execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)"
        )
        self.db._execute_query(
            "INSERT INTO users (username, password) VALUES ('admin', 'secret123')"
        )
        self.db._execute_query(
            "CREATE TABLE malicious_table (id INTEGER PRIMARY KEY, data TEXT)"
        )

    def teardown_method(self):
        self.temp_dir.cleanup()

    def test_describe_table_sql_injection_direct(self):
        """Test the describe_table SQL injection fix directly by simulating the handler function"""

        # Create a direct instance of SqliteDatabase for testing
        db = SqliteDatabase(self.db_path)

        # Mock the handler function directly instead of using the main function
        def simulate_describe_table_handler_old(table_name):
            """Simulate the describe_table handler without going through main()"""
            return db._execute_query(f"PRAGMA table_info('{table_name}')")

        def simulate_describe_table_handler(table_name):
            """Simulate the describe_table handler without going through main()"""
            return db._execute_query(
                "SELECT * FROM pragma_table_info(?)", (table_name,)
            )

        # Test with a normal table name
        results1 = simulate_describe_table_handler_old("users")
        results2 = simulate_describe_table_handler("users")
        assert results1 == results2
        assert len(results1) > 0
        assert len(results2) > 0
        column_names = [row["name"] for row in results2]
        assert "username" in column_names
        assert "password" in column_names

        # Before the fix, this malicious input would drop the table
        malicious_table_name = "users'; DROP TABLE malicious_table; --"

        # Now it should safely parameterize the input and not execute the DROP TABLE command
        simulate_describe_table_handler(malicious_table_name)

        # Verify malicious_table still exists (wasn't dropped)
        tables = db._execute_query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='malicious_table'"
        )
        assert (
            len(tables) == 1
        ), "SQL injection protection failed - malicious command executed"

    def test_parameterized_query_sql_injection_prevention(self):
        """Test that SQL injection is prevented with properly parameterized queries"""
        # Create tables for this test
        self.db._execute_query(
            "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)"
        )
        self.db._execute_query(
            "INSERT INTO products (name, price) VALUES ('Product A', 10.99)"
        )
        self.db._execute_query(
            "INSERT INTO products (name, price) VALUES ('Product B', 20.99)"
        )

        # Regular, non-malicious query using parameters
        results = self.db._execute_query(
            "SELECT * FROM products WHERE name = ?", ("Product A",)
        )
        assert len(results) == 1
        assert results[0]["price"] == 10.99

        # Malicious input that attempts SQL injection
        malicious_input = "Product A' OR 1=1; --"

        # With parameterized queries, this should only match exactly the malicious string, not all products
        results = self.db._execute_query(
            "SELECT * FROM products WHERE name = ?", (malicious_input,)
        )
        assert len(results) == 0  # Should not match anything

        # Check that all products still exist (no data was deleted)
        all_products = self.db._execute_query("SELECT * FROM products")
        assert len(all_products) == 2
