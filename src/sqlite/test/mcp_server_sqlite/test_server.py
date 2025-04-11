# ruff: noqa: S101
import os
import tempfile

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
        # Query with named parameters
        results = self.db._execute_query(
            "SELECT * FROM test WHERE name = :name", {"name": "test1"}
        )
        assert len(results) == 1
        assert results[0]["name"] == "test1"

        # Using named parameters with ? syntax and a tuple (position-based)
        self.db._execute_query("INSERT INTO test (name) VALUES (?)", ("test2",))
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
        assert len(tables) == 1, (
            "SQL injection protection failed - malicious command executed"
        )

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
