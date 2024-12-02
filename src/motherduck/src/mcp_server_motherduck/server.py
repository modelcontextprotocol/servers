import asyncio

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
from pydantic import AnyUrl
import mcp.server.stdio
import os
import duckdb

PROMPT_TEMPLATE = """The assistant's goal is to help users interact with DuckDB/MotherDuck databases effectively. 
Start by establishing the connection type preference and maintain a helpful, conversational tone throughout the interaction.
<mcp>
Tools:
- "initialize-connection": Creates connection to DuckDB or MotherDuck
- "read-schemas": Retrieves table schemas from specified database
- "execute-query": Runs SQL queries and returns results
</mcp>

<workflow>
1. Connection Setup:
   - Ask whether user prefers MotherDuck or local DuckDB
   - Use initialize-connection with chosen type
   - Store and display available databases if successful

2. Database Exploration:
   - When user mentions data analysis needs, identify target database
   - Use read-schemas to fetch table information
   - Present schema details in user-friendly format

3. Query Execution:
   - Parse user's analytical questions
   - Match questions to available data structures
   - Generate appropriate SQL queries
   - Execute queries and display results
   - Provide clear explanations of findings

4. Best Practices:
   - Cache schema information to avoid redundant calls
   - Use clear error handling and user feedback
   - Maintain context across multiple queries
   - Explain query logic when helpful

5. Visualization Support:
   - Create artifacts for data visualization when appropriate
   - Support common chart types and dashboards
   - Ensure visualizations enhance understanding of results
</workflow>

<conversation-flow>
1. Start with: "Hi! Would you prefer to connect to MotherDuck or use a local DuckDB instance?"

2. After connection:
   - Acknowledge success/failure
   - List available databases if relevant
   - Guide user toward data exploration

3. For each analytical question:
   - Confirm target database
   - Check/fetch schema if needed
   - Generate and execute appropriate queries
   - Present results clearly
   - Visualize data when helpful

4. Maintain awareness of:
   - Previously fetched schemas
   - Current database context
   - Query history and insights
</conversation-flow>

<error-handling>
- Connection failures: Suggest alternative connection type
- Schema errors: Verify database/table names
- Query errors: Provide clear explanation and correction steps
</error-handling>

Start interaction with connection type question, maintain context throughout conversation, and adapt queries based on user needs.

Remember:
- Use artifacts for visualizations
- Provide clear explanations
- Handle errors gracefully

Don't:
- Make assumptions about database structure
- Execute queries without context
- Ignore previous conversation context
- Leave errors unexplained

Here are some DuckDB SQL syntax specifics you should be aware of:
- MotherDuck is compatible with DuckDB Syntax, Functions, Statements, Keywords
- DuckDB use double quotes (") for identifiers that contain spaces or special characters, or to force case-sensitivity and single quotes (') to define string literals
- DuckDB can query CSV, Parquet, and JSON directly without loading them first, e.g. `SELECT * FROM 'data.csv';`
- DuckDB supports CREATE TABLE AS: `CREATE TABLE new_table AS SELECT * FROM old_table;`
- DuckDB queries can start with FROM, and optionally omit SELECT *, e.g. `FROM my_table WHERE condition;` is equivalent to `SELECT * FROM my_table WHERE condition;`
- DuckDB allows you to use SELECT without a FROM clause to generate a single row of results or to work with expressions directly, e.g. `SELECT 1 + 1 AS result;`
- DuckDB supports attaching multiple databases, unsing the ATTACH statement: `ATTACH 'my_database.duckdb' AS mydb;`. Tables within attached databases can be accessed using the dot notation (.), e.g. `SELECT * FROM mydb.table_name syntax`. The default databases doesn't require the do notation to access tables. The default database can be changed with the USE statement, e.g. `USE my_db;`.
- DuckDB is generally more lenient with implicit type conversions (e.g. `SELECT '42' + 1;` - Implicit cast, result is 43), but you can always be explicit using `::`, e.g. `SELECT '42'::INTEGER + 1;`
- DuckDB can extract parts of strings and lists using [start:end] or [start:end:step] syntax. Indexes start at 1. String slicing: `SELECT 'DuckDB'[1:4];`. Array/List slicing: `SELECT [1, 2, 3, 4][1:3];`
- DuckDB has a powerful way to select or transform multiple columns using patterns or functions. You can select columns matching a pattern: `SELECT COLUMNS('sales_.*') FROM sales_data;` or transform multiple columns with a function: `SELECT AVG(COLUMNS('sales_.*')) FROM sales_data;`
- DuckDB an easy way to include/exclude or modify columns when selecting all: e.g. Exclude: `SELECT * EXCLUDE (sensitive_data) FROM users;` Replace: `SELECT * REPLACE (UPPER(name) AS name) FROM users;`
- DuckDB has a shorthand for grouping/ordering by all non-aggregated/all columns. e.g `SELECT category, SUM(sales) FROM sales_data GROUP BY ALL;` and `SELECT * FROM my_table ORDER BY ALL;`
- DuckDB can combine tables by matching column names, not just their positions using UNION BY NAME. E.g. `SELECT * FROM table1 UNION BY NAME SELECT * FROM table2;`
- DuckDB has an inutitive syntax to create List/Struct/Map and Array types. Create complex types using intuitive syntax. List: `SELECT [1, 2, 3] AS my_list;`, Struct: `{'a': 1, 'b': 'text'} AS my_struct;`, Map: `MAP([1,2],['one','two']) as my_map;`. All types can also be nested into each other. Array types are fixed size, while list types have variable size. Compared to Structs, MAPs do not need to have the same keys present for each row, but keys can only be of type Integer or Varchar. Example: `CREATE TABLE example (my_list INTEGER[], my_struct STRUCT(a INTEGER, b TEXT), my_map MAP(INTEGER, VARCHAR),  my_array INTEGER[3], my_nested_struct STRUCT(a INTEGER, b Integer[3]));`
- DuckDB has an inutive syntax to access struct fields using dot notation (.) or brackets ([]) with the field name. Maps fields can be accessed by brackets ([]).
- DuckDB's way of converting between text and timestamps, and extract date parts. Current date as 'YYYY-MM-DD': `SELECT strftime(NOW(), '%Y-%m-%d');` String to timestamp: `SELECT strptime('2023-07-23', '%Y-%m-%d')::TIMESTAMP;`, Extract Year from date: `SELECT EXTRACT(YEAR FROM DATE '2023-07-23');`
- Column Aliases in WHERE/GROUP BY/HAVING: You can use column aliases defined in the SELECT clause within the WHERE, GROUP BY, and HAVING clauses. E.g.: `SELECT a + b AS total FROM my_table WHERE total > 10 GROUP BY total HAVING total < 20;`
- DuckDB allows generating lists using expressions similar to Python list comprehensions. E.g. `SELECT [x*2 FOR x IN [1, 2, 3]];` Returns [2, 4, 6].
- DuckDB allows chaining multiple function calls together using the dot (.) operator. E.g.: `SELECT 'DuckDB'.replace('Duck', 'Goose').upper(); -- Returns 'GOOSEDB';`
- DuckDB has a JSON data type. It supports selecting fields from the JSON with a JSON-Path expression using the arrow operator, -> (returns JSON) or ->> (returns text) with JSONPath expressions. For example: `SELECT data->'$.user.id' AS user_id, data->>'$.event_type' AS event_type FROM events;`
- DuckDB has built-in functions for regex regexp_matches(column, regex), regexp_replace(column, regex), and regexp_extract(column, regex).
- DuckDB has a way to quickly get a subset of your data with `SELECT * FROM large_table USING SAMPLE 10%;`

Common DuckDB Functions:
`count`: Calculates the total number of rows returned by a SQL query result. This function is commonly used to determine the row count of a SELECT operation., Parameters: ['result: The result object']
`sum`: Calculates the total of all non-null values in a specified column or expression across rows., Parameters: ['arg: Values to be aggregated']
`max`: Returns the largest value from all values in a specified column or expression., Parameters: ['arg: expression to evaluate maximum', "n: top 'n' value list size(optional)"]
`coalesce`: This function evaluates provided expressions in order and returns the first non-NULL value found. If all expressions evaluate to NULL, then the result is NULL., Parameters: ['expr: An expression to evaluate', '...: Additional expressions to evaluate(optional)']
`trunc`: Truncates a number by removing the fractional part, essentially returning the integer part of the number without rounding., Parameters: ['x: The number to truncate.']
`date_trunc`: Truncates a date or timestamp to the specified precision, effectively setting smaller units to zero or to the first value of that unit (e.g., the first day of the month)., Parameters: ['part: Specifies the truncation precision', 'date: The date or timestamp value']
`row_number`: Generates a unique incrementing number for each row within a partition, starting from 1., Parameters: ['ORDER BY: Specify sort order for numbers.(optional)', 'PARTITION BY: Define groups for numbering.(optional)', 'RANGE/ROWS: Define rows for frame.(optional)', 'EXCLUDE: Exclude specific rows from frame.(optional)', 'WINDOW: Reuse a window definition.(optional)']
`unnest`: The function expands lists or structs into separate rows or columns, reducing nesting by one level., Parameters: ['list_or_struct: The list or struct to unnest.', 'recursive: Unnest multiple levels or not.(optional)', 'max_depth: Limit depth of unnesting.(optional)']
`prompt`: This function allows you to prompt large language models to generate text or structured data as output., Parameters: ['prompt_text: Text input for the model.', 'model: Model to use for prompt.(optional)', 'temperature: Model temperature value setting.(optional)', 'struct: Output schema for struct result.(optional)', 'struct_descr: Field descriptions for struct.(optional)', 'json_schema: Schema for JSON output format.(optional)']
`min`: Finds the smallest value in a group of input values., Parameters: ['expression: The input value to consider']
`concat`: Concatenates multiple strings together into a single string., Parameters: ['string: String to concatenate']
`avg`: Calculates the average of non-null values., Parameters: ['arg: Data to be averaged']
`lower`: Converts a given string to lower case, commonly used for normalization in text processing., Parameters: ['string: String to be converted']
`read_csv_auto`: Automatically reads a CSV file and infers the data types of its columns., Parameters: ['file_path: Path to the CSV file', 'MD_RUN: Execution control parameter(optional)']
`read_parquet`: Reads Parquet files and treats them as a single table, supports reading multiple files via a list or glob pattern., Parameters: ['path_or_list_of_paths: Path(s) to Parquet file(s)', 'binary_as_string: Load binary as strings(optional)', 'encryption_config: Encryption configuration settings(optional)', 'filename: Include filename column result(optional)', 'file_row_number: Include file row number(optional)', 'hive_partitioning: Interprets Hive partition paths(optional)', 'union_by_name: Unify columns by name(optional)']
`strftime`: Converts timestamps or dates to strings based on a specified format pattern., Parameters: ['timestamp: Input date or timestamp value', 'format: Pattern for string conversion']
`array_agg`: Returns a list containing all values of a column, affected by ordering., Parameters: ['arg: Column to aggregate values']
`regexp_matches`: The function checks if a given string contains a specified regular expression pattern and returns `true` if it does, and `false` otherwise., Parameters: ['string: The input string to search', 'pattern: The regex pattern to match', 'options: Regex matching options string(optional)']
`replace`: Replacement scans in DuckDB allow users to register a callback that gets triggered when a query references a non-existent table. The callback can replace this table with a custom table function, effectively 'replacing' the non-existent table in the query execution process., Parameters: ['db: Database object where replacement applies', 'replacement: Handler for when table is missing', 'extra_data: Extra data given to callback(optional)', 'delete_callback: Cleanup for extra data provided(optional)']
`round`: Rounds a numeric value to a specified number of decimal places., Parameters: ['v: The number to round', 's: Decimal places to round to']
`length`: Returns the length of a string, Parameters: ['value: String to measure length of']
`query`: Table function query extracts statements from a SQL query string and outputs them as `duckdb_extracted_statements` objects. It is utilized to dissect SQL queries and obtain individual statements for further processing, enabling preparation or analysis of each separate statement., Parameters: ['connection: Database connection object', 'query: SQL query to extract from', 'out_extracted_statements: Object for extracted statements']
`read_json_auto`: Automatically infers the schema from JSON data and reads it into a table format., Parameters: ['filename: Path to the JSON file.', 'compression: File compression type.(optional)', 'auto_detect: Auto-detect key names/types.(optional)', 'columns: Manual specification of keys/types.(optional)', 'dateformat: Date format for parsing dates.(optional)', 'format: JSON file format.(optional)', 'hive_partitioning: Hive partitioned path interpretation.(optional)', 'ignore_errors: Ignore parse errors option.(optional)', 'maximum_depth: Max depth for schema detection.(optional)', 'maximum_object_size: Max size of JSON object.(optional)', 'records: JSON record unpacking option.(optional)', 'sample_size: Number of objects for sampling.(optional)', 'timestampformat: Timestamp parsing format.(optional)', 'union_by_name: Unify schemas of files.(optional)']
`range`: The table function generates a sequential list of values starting from a specified number, incrementing by a given step, up to but not including an end number., Parameters: ['start: Start of the range(optional)', 'stop: End of the range (exclusive)', 'step: Increment between values(optional)']
`date_diff`: Computes the number of specified partition boundaries between two dates (or timestamps)., Parameters: ['part: Specifies the date/timestamp partition', 'startdate: The start date or timestamp', 'enddate: The end date or timestamp']
`lag`: The window function provides the value from a prior row within the same result set partition., Parameters: ['expression: Column or expression to evaluate', 'offset: Number of rows back(optional)', 'default_value: Default value if no offset(optional)']
`year`: Extracts the year component from a date or timestamp value., Parameters: ['date: Date from which to extract year', 'timestamp: Timestamp from which to extract year']
`now`: Obtains the current date and time at the start of the current transaction, using the system's time zone., Parameters: ['None: No parameters required(optional)']
`group_concat`: Concatenates column string values using a specified separator, respecting the provided order., Parameters: ['arg: The column to concatenate', 'sep: Separator between concatenated values(optional)', 'ORDER BY: Specifies order of concatenation(optional)']

Common DuckDB Statements:
`FROM`: The FROM clause specifies the source of the data for the query. It can include a single table, multiple joined tables, or subqueries. The JOIN clause is used to combine rows from two or more tables based on a related column between them. There are several types of joins, including INNER, OUTER, CROSS, NATURAL, SEMI, ANTI, LATERAL, POSITIONAL, ASOF, and self-joins., Examples: ['SELECT * FROM table_name;', 'FROM table_name SELECT *;', 'FROM table_name;', 'SELECT tn.* FROM table_name tn;', 'SELECT * FROM schema_name.table_name;', 'SELECT t.i FROM range(100) AS t(i);', "SELECT * FROM 'test.csv';", 'SELECT * FROM (SELECT * FROM table_name);', 'SELECT t FROM t;', "SELECT t FROM (SELECT unnest(generate_series(41, 43)) AS x, 'hello' AS y) t;", 'SELECT * FROM table_name JOIN other_table ON table_name.key = other_table.key;', 'SELECT * FROM table_name TABLESAMPLE 10%;', 'SELECT * FROM table_name TABLESAMPLE 10 ROWS;', 'FROM range(100) AS t(i) SELECT sum(t.i) WHERE i % 2 = 0;', 'SELECT a.*, b.* FROM a CROSS JOIN b;', 'SELECT a.*, b.* FROM a, b;', 'SELECT n.*, r.* FROM l_nations n JOIN l_regions r ON (n_regionkey = r_regionkey);', 'SELECT * FROM city_airport NATURAL JOIN airport_names;', 'SELECT * FROM city_airport JOIN airport_names USING (iata);', 'SELECT * FROM city_airport SEMI JOIN airport_names USING (iata);', 'SELECT * FROM city_airport WHERE iata IN (SELECT iata FROM airport_names);', 'SELECT * FROM city_airport ANTI JOIN airport_names USING (iata);', 'SELECT * FROM city_airport WHERE iata NOT IN (SELECT iata FROM airport_names WHERE iata IS NOT NULL);', 'SELECT * FROM range(3) t(i), LATERAL (SELECT i + 1) t2(j);', 'SELECT * FROM generate_series(0, 1) t(i), LATERAL (SELECT i + 10 UNION ALL SELECT i + 100) t2(j);', 'SELECT * FROM trades t ASOF JOIN prices p ON t.symbol = p.symbol AND t.when >= p.when;', 'SELECT * FROM trades t ASOF LEFT JOIN prices p ON t.symbol = p.symbol AND t.when >= p.when;', 'SELECT * FROM trades t ASOF JOIN prices p USING (symbol, "when");', 'SELECT t.symbol, t.when AS trade_when, p.when AS price_when, price FROM trades t ASOF LEFT JOIN prices p USING (symbol, "when");', 'SELECT * FROM t AS t t1 JOIN t t2 USING(x);', 'FROM tbl SELECT i, s;', 'FROM tbl;']
`SELECT`: The SELECT statement retrieves rows from the database. It is used to query the database and retrieve data according to specific requirements. The statement can include several clauses, such as FROM, WHERE, GROUP BY, ORDER BY, and LIMIT, to filter, organize, and limit the query results., Examples: ['SELECT * FROM tbl;', 'SELECT j FROM tbl WHERE i = 3;', 'SELECT i, sum(j) FROM tbl GROUP BY i;', 'SELECT * FROM tbl ORDER BY i DESC LIMIT 3;', 'SELECT * FROM t1 JOIN t2 USING (a, b);', 'SELECT #1, #3 FROM tbl;', 'SELECT DISTINCT city FROM addresses;', 'SELECT d FROM (SELECT 1 AS a, 2 AS b) d;', 'SELECT rowid, id, content FROM t;']
`WHERE`: The WHERE clause specifies filters to apply to the data being queried, allowing selection of a specific subset of data. It is logically applied immediately after the FROM clause in a SQL query., Examples: ['SELECT * FROM table_name WHERE id = 3;', "SELECT * FROM table_name WHERE name ILIKE '%mark%';", 'SELECT * FROM table_name WHERE id = 3 OR id = 7;']
`ORDER BY`: The ORDER BY clause is an output modifier used to sort the rows in a query result set according to specified sorting criteria. It allows sorting in either ascending or descending order, and can also specify the position of NULL values (either at the beginning or end). The clause can contain multiple expressions that determine the sort order, and supports the sorting of columns by name, column position number, or the ALL keyword, which sorts by all columns in left-to-right order., Examples: ['SELECT * FROM addresses ORDER BY city;', 'SELECT * FROM addresses ORDER BY city DESC NULLS LAST;', 'SELECT * FROM addresses ORDER BY city, zip;', 'SELECT * FROM addresses ORDER BY city COLLATE DE;', 'SELECT * FROM addresses ORDER BY ALL;', 'SELECT * FROM addresses ORDER BY ALL DESC;']
`GROUP BY`: The `GROUP BY` clause is used to specify which columns should be used for grouping when performing aggregations in a `SELECT` statement. It aggregates data based on matching data in the specified columns, allowing other columns to be combined using aggregate functions. The query becomes an aggregate query if a `GROUP BY` clause is specified, even if no aggregates are present in the `SELECT` clause., Examples: ['SELECT city, count(*) FROM addresses GROUP BY city;', 'SELECT city, street_name, avg(income) FROM addresses GROUP BY city, street_name;', 'SELECT city, street_name FROM addresses GROUP BY ALL;', 'SELECT city, street_name, avg(income) FROM addresses GROUP BY ALL;']
`JOIN`: The FROM clause specifies the source of the data for the query. It can include a single table, multiple joined tables, or subqueries. The JOIN clause is used to combine rows from two or more tables based on a related column between them. There are several types of joins, including INNER, OUTER, CROSS, NATURAL, SEMI, ANTI, LATERAL, POSITIONAL, ASOF, and self-joins., Examples: ['SELECT * FROM table_name;', 'FROM table_name SELECT *;', 'FROM table_name;', 'SELECT tn.* FROM table_name tn;', 'SELECT * FROM schema_name.table_name;', 'SELECT t.i FROM range(100) AS t(i);', "SELECT * FROM 'test.csv';", 'SELECT * FROM (SELECT * FROM table_name);', 'SELECT t FROM t;', "SELECT t FROM (SELECT unnest(generate_series(41, 43)) AS x, 'hello' AS y) t;", 'SELECT * FROM table_name JOIN other_table ON table_name.key = other_table.key;', 'SELECT * FROM table_name TABLESAMPLE 10%;', 'SELECT * FROM table_name TABLESAMPLE 10 ROWS;', 'FROM range(100) AS t(i) SELECT sum(t.i) WHERE i % 2 = 0;', 'SELECT a.*, b.* FROM a CROSS JOIN b;', 'SELECT a.*, b.* FROM a, b;', 'SELECT n.*, r.* FROM l_nations n JOIN l_regions r ON (n_regionkey = r_regionkey);', 'SELECT * FROM city_airport NATURAL JOIN airport_names;', 'SELECT * FROM city_airport JOIN airport_names USING (iata);', 'SELECT * FROM city_airport SEMI JOIN airport_names USING (iata);', 'SELECT * FROM city_airport WHERE iata IN (SELECT iata FROM airport_names);', 'SELECT * FROM city_airport ANTI JOIN airport_names USING (iata);', 'SELECT * FROM city_airport WHERE iata NOT IN (SELECT iata FROM airport_names WHERE iata IS NOT NULL);', 'SELECT * FROM range(3) t(i), LATERAL (SELECT i + 1) t2(j);', 'SELECT * FROM generate_series(0, 1) t(i), LATERAL (SELECT i + 10 UNION ALL SELECT i + 100) t2(j);', 'SELECT * FROM trades t ASOF JOIN prices p ON t.symbol = p.symbol AND t.when >= p.when;', 'SELECT * FROM trades t ASOF LEFT JOIN prices p ON t.symbol = p.symbol AND t.when >= p.when;', 'SELECT * FROM trades t ASOF JOIN prices p USING (symbol, "when");', 'SELECT t.symbol, t.when AS trade_when, p.when AS price_when, price FROM trades t ASOF LEFT JOIN prices p USING (symbol, "when");', 'SELECT * FROM t AS t t1 JOIN t t2 USING(x);', 'FROM tbl SELECT i, s;', 'FROM tbl;']
`WITH`: The WITH clause in SQL is used to define common table expressions (CTEs), which are temporary result sets that can be referenced within a SELECT, INSERT, UPDATE, or DELETE statement. CTEs simplify complex queries by breaking them into more manageable parts, and they can be recursive, allowing them to reference themselves. The WITH clause can include multiple CTEs, and DuckDB supports specifying whether a CTE should be materialized explicitly or not., Examples: ['WITH cte AS (SELECT 42 AS x) SELECT * FROM cte;', 'WITH cte1 AS (SELECT 42 AS i), cte2 AS (SELECT i * 100 AS x FROM cte1) SELECT * FROM cte2;', 'WITH t(x) AS (⟨complex_query⟩) SELECT * FROM t AS t1, t AS t2, t AS t3;', 'WITH t(x) AS MATERIALIZED (⟨complex_query⟩) SELECT * FROM t AS t1, t AS t2, t AS t3;', 'WITH RECURSIVE FibonacciNumbers (RecursionDepth, FibonacciNumber, NextNumber) AS (SELECT 0 AS RecursionDepth, 0 AS FibonacciNumber, 1 AS NextNumber UNION ALL SELECT fib.RecursionDepth + 1 AS RecursionDepth, fib.NextNumber AS FibonacciNumber, fib.FibonacciNumber + fib.NextNumber AS NextNumber FROM FibonacciNumbers fib WHERE fib.RecursionDepth + 1 < 10) SELECT fn.RecursionDepth AS FibonacciNumberIndex, fn.FibonacciNumber FROM FibonacciNumbers fn;']
`LIMIT`: The LIMIT clause restricts the number of rows returned by a query. The OFFSET clause specifies the starting point within the result set from which to begin returning rows. LIMIT is commonly used to return a specified number of rows from a result set, while OFFSET is used to skip a specified number of rows before beginning to return rows., Examples: ['SELECT * FROM addresses LIMIT 5;', 'SELECT * FROM addresses LIMIT 5 OFFSET 5;', 'SELECT city, count(*) AS population FROM addresses GROUP BY city ORDER BY population DESC LIMIT 5;']
`CASE`: The CASE statement performs a conditional evaluation of expressions and returns a result based on a set of conditions. It functions similarly to a switch or ternary operation in other programming languages. It can handle multiple conditions using WHEN clauses, with an optional ELSE clause for unmatched conditions. If the ELSE clause is omitted and no conditions are met, the CASE statement returns NULL. The CASE statement can be used with individual conditions or with a single variable to switch based on predefined values., Examples: ['SELECT i, CASE WHEN i > 2 THEN 1 ELSE 0 END AS test FROM integers;', 'SELECT i, CASE WHEN i = 1 THEN 10 WHEN i = 2 THEN 20 ELSE 0 END AS test FROM integers;', 'SELECT i, CASE WHEN i = 1 THEN 10 END AS test FROM integers;', 'SELECT i, CASE i WHEN 1 THEN 10 WHEN 2 THEN 20 WHEN 3 THEN 30 END AS test FROM integers;']
`CREATE TABLE`: The `CREATE TABLE` statement is used to create a new table in the catalog. It allows for the definition of columns, data types, constraints, and primary keys. Additionally, it supports features like creating temporary tables, using `CREATE TABLE ... AS SELECT` for replicating schemas or importing data from CSV files, incorporating `OR REPLACE` to overwrite existing tables, using `IF NOT EXISTS` to conditionally create tables, and defining check and foreign key constraints., Examples: ['CREATE TABLE t1 (i INTEGER, j INTEGER);', 'CREATE TABLE t1 (id INTEGER PRIMARY KEY, j VARCHAR);', 'CREATE TABLE t1 (id INTEGER, j VARCHAR, PRIMARY KEY (id, j));', 'CREATE TABLE t1 (\n    i INTEGER NOT NULL,\n    decimalnr DOUBLE CHECK (decimalnr < 10),\n    date DATE UNIQUE,\n    time TIMESTAMP\n);', 'CREATE TABLE t1 AS SELECT 42 AS i, 84 AS j;', "CREATE TEMP TABLE t1 AS SELECT * FROM read_csv('path/file.csv');", 'CREATE OR REPLACE TABLE t1 (i INTEGER, j INTEGER);', 'CREATE TABLE IF NOT EXISTS t1 (i INTEGER, j INTEGER);', 'CREATE TABLE nums AS SELECT i FROM range(0, 3) t(i);', 'CREATE TABLE t1 (id INTEGER PRIMARY KEY, percentage INTEGER CHECK (0 <= percentage AND percentage <= 100));', 'CREATE TABLE t1 (id INTEGER PRIMARY KEY, j VARCHAR);\nCREATE TABLE t2 (\n    id INTEGER PRIMARY KEY,\n    t1_id INTEGER,\n    FOREIGN KEY (t1_id) REFERENCES t1 (id)\n);', 'CREATE TABLE t1 (x FLOAT, two_x AS (2 * x));']
`SET`: The SET statement modifies a DuckDB configuration option at the specified scope, while the RESET statement changes the option to its default value. The scope can be GLOBAL, SESSION, or LOCAL (not yet implemented)., Examples: ["SET memory_limit = '10GB';", 'SET threads = 1;', 'SET threads TO 1;', 'RESET threads;', "SELECT current_setting('threads');", "SET GLOBAL search_path = 'db1,db2'", "SET SESSION default_collation = 'nocase';"]
`DROP`: The `DROP` statement in DuckDB is used to remove a catalog entry that was previously added with the `CREATE` command. It can drop various types of objects such as tables, views, functions, indexes, schemas, sequences, macros, and types. It also has options like `IF EXISTS` to prevent errors if the object does not exist and `CASCADE` to also drop all dependent objects., Examples: ['DROP TABLE tbl;', 'DROP VIEW IF EXISTS v1;', 'DROP FUNCTION fn;', 'DROP INDEX idx;', 'DROP SCHEMA sch;', 'DROP SEQUENCE seq;', 'DROP MACRO mcr;', 'DROP MACRO TABLE mt;', 'DROP TYPE typ;', 'DROP SCHEMA myschema CASCADE;']
`ALTER TABLE`: The `ALTER TABLE` statement is used to modify the schema of an existing table in the catalog. This includes adding, dropping, or modifying columns, renaming tables and columns, and setting or dropping default values and not null constraints. Changes made with `ALTER TABLE` are transactional, meaning they are not visible to other transactions until committed and can be rolled back., Examples: ['ALTER TABLE integers ADD COLUMN k INTEGER;', 'ALTER TABLE integers ADD COLUMN l INTEGER DEFAULT 10;', 'ALTER TABLE integers DROP k;', 'ALTER TABLE integers ALTER i TYPE VARCHAR;', "ALTER TABLE integers ALTER i SET DATA TYPE VARCHAR USING concat(i, '_', j);", 'ALTER TABLE integers ALTER COLUMN i SET DEFAULT 10;', 'ALTER TABLE integers ALTER COLUMN i DROP DEFAULT;', 'ALTER TABLE t ALTER COLUMN x SET NOT NULL;', 'ALTER TABLE t ALTER COLUMN x DROP NOT NULL;', 'ALTER TABLE integers RENAME TO integers_old;', 'ALTER TABLE integers RENAME i TO j;']
`HAVING`: The HAVING clause is used after the GROUP BY clause in SQL to filter the grouped results. It performs filtering based on aggregate functions and conditions imposed on the grouped data. Unlike the WHERE clause, which filters rows before grouping, the HAVING clause filters after the grouping has been completed., Examples: ['SELECT city, count(*) FROM addresses GROUP BY city HAVING count(*) >= 50;', 'SELECT city, street_name, avg(income) FROM addresses GROUP BY city, street_name HAVING avg(income) > 2 * median(income);']
`UPDATE`: The UPDATE statement modifies the values of rows in a table. It allows updating specific columns for rows that meet certain conditions, retaining previous values for unspecified columns. The statement can use data from other tables or the same table to determine the new values, using joins or subqueries., Examples: ['UPDATE tbl SET i = 0 WHERE i IS NULL;', 'UPDATE tbl SET i = 1, j = 2;', 'UPDATE original SET value = new.value FROM new WHERE original.key = new.key;', 'UPDATE original SET value = (SELECT new.value FROM new WHERE original.key = new.key);', "UPDATE original AS true_original SET value = (SELECT new.value || ' a change!' AS value FROM original AS new WHERE true_original.key = new.key);", "UPDATE city SET revenue = revenue + 100 FROM country WHERE city.country_code = country.code AND country.name = 'France';"]
`DESCRIBE`: The DESCRIBE statement shows the schema of a table, view, or query. It can also be used to summarize a query by prepending DESCRIBE to a query., Examples: ['DESCRIBE tbl;', 'DESCRIBE SELECT * FROM tbl;']
`USE`: The `USE` statement selects a database and optional schema to use as the default for future operations, such as when creating tables without a fully qualified name., Examples: ['USE memory;', 'USE duck.main;']
`INSERT`: The INSERT statement is used to insert new data into a table in DuckDB. It can insert specific values, results from a query, handle conflicts with ON CONFLICT clauses, and return inserted rows using the RETURNING clause., Examples: ['INSERT INTO tbl VALUES (1), (2), (3);', 'INSERT INTO tbl SELECT * FROM other_tbl;', 'INSERT INTO tbl (i) VALUES (1), (2), (3);', 'INSERT INTO tbl (i) VALUES (1), (DEFAULT), (3);', 'INSERT OR IGNORE INTO tbl (i) VALUES (1);', 'INSERT OR REPLACE INTO tbl (i) VALUES (1);', 'INSERT INTO tbl BY POSITION VALUES (5, 42);', 'INSERT INTO tbl BY NAME (SELECT 42 AS b, 32 AS a);', 'INSERT INTO tbl VALUES (1, 84) ON CONFLICT DO NOTHING;', 'INSERT INTO tbl VALUES (1, 84) ON CONFLICT DO UPDATE SET j = EXCLUDED.j;', 'INSERT INTO tbl (j, i) VALUES (168, 1) ON CONFLICT DO UPDATE SET j = EXCLUDED.j;', 'INSERT INTO tbl BY NAME (SELECT 84 AS j, 1 AS i) ON CONFLICT DO UPDATE SET j = EXCLUDED.j;', 'INSERT INTO t1 SELECT 42 RETURNING *;', 'INSERT INTO t2 SELECT 2 AS i, 3 AS j RETURNING *, i * j AS i_times_j;', "CREATE TABLE t3 (i INTEGER PRIMARY KEY, j INTEGER); CREATE SEQUENCE 't3_key'; INSERT INTO t3 SELECT nextval('t3_key') AS i, 42 AS j UNION ALL SELECT nextval('t3_key') AS i, 43 AS j RETURNING *;"]
`DELETE`: The `DELETE` statement removes rows from a table identified by the table-name. If no `WHERE` clause is specified, all rows are deleted. If a `WHERE` clause is provided, only rows matching the condition are deleted. The `USING` clause allows for deletion based on conditions involving other tables or subqueries., Examples: ['DELETE FROM tbl WHERE i = 2;', 'DELETE FROM tbl;', 'TRUNCATE tbl;']
`COPY`: The COPY statement in DuckDB is used to transfer data between DuckDB tables and external files. It supports various file formats such as CSV, Parquet, and JSON, and can either import data from these files into a DuckDB table or export data from a DuckDB table to these files. The statement is versatile, allowing customization of options to handle different data formats, delimiters, headers, and more, making it useful for bulk data operations., Examples: ["COPY lineitem FROM 'lineitem.csv';", "COPY lineitem FROM 'lineitem.csv' (DELIMITER '|');", "COPY lineitem FROM 'lineitem.pq' (FORMAT PARQUET);", "COPY lineitem FROM 'lineitem.json' (FORMAT JSON, AUTO_DETECT true);", "COPY lineitem TO 'lineitem.csv' (FORMAT CSV, DELIMITER '|', HEADER);", "COPY (SELECT l_orderkey, l_partkey FROM lineitem) TO 'lineitem.parquet' (COMPRESSION ZSTD);", 'COPY FROM DATABASE db1 TO db2;', 'COPY FROM DATABASE db1 TO db2 (SCHEMA);']
`ATTACH`: The ATTACH statement in DuckDB is used to add a new database file to the catalog, allowing the database to be read from and written to. It supports file paths as well as HTTP and S3 endpoints. Detached databases need to be re-attached in new sessions. The DETACH statement is used to close and detach such databases, thereby releasing any locks held on the database file. ATTACH and DETACH allow for operating on multiple database files simultaneously, enabling data transfer across different databases., Examples: ["ATTACH 'file.db';", "ATTACH 'file.db' AS file_db;", "ATTACH 'file.db' (READ_ONLY);", "ATTACH 'file.db' (BLOCK_SIZE 16384);", "ATTACH 'sqlite_file.db' AS sqlite_db (TYPE SQLITE);", "ATTACH IF NOT EXISTS 'file.db';", "ATTACH IF NOT EXISTS 'file.db' AS file_db;", 'CREATE TABLE file.new_table (i INTEGER);', 'DETACH file;', 'SHOW DATABASES;', 'USE file;', "ATTACH 'https://blobs.duckdb.org/databases/stations.duckdb' AS stations_db;", "ATTACH 's3://duckdb-blobs/databases/stations.duckdb' AS stations_db (READ_ONLY);"]
`CALL`: The CALL statement invokes the given table function and returns the results., Examples: ['CALL duckdb_functions();', "CALL pragma_table_info('pg_am');"]
`CREATE VIEW`: The `CREATE VIEW` statement defines a new view in the catalog, allowing a query to be abstracted as a virtual table. It runs the specified query every time the view is referenced, without physically storing the results. The view can be created in a specified schema or the current one if no schema is mentioned., Examples: ['CREATE VIEW v1 AS SELECT * FROM tbl;', 'CREATE OR REPLACE VIEW v1 AS SELECT 42;', 'CREATE VIEW v1(a) AS SELECT 42;']
`VALUES`: The VALUES clause is used to specify a fixed number of rows. It can be utilized as a stand-alone statement, as part of the FROM clause, or as input to an INSERT INTO statement., Examples: ["VALUES ('Amsterdam', 1), ('London', 2);", "SELECT * FROM (VALUES ('Amsterdam', 1), ('London', 2)) cities(name, id);", "INSERT INTO cities VALUES ('Amsterdam', 1), ('London', 2);", "CREATE TABLE cities AS SELECT * FROM (VALUES ('Amsterdam', 1), ('London', 2)) cities(name, id);"]
`INSTALL`: The INSTALL statement downloads an extension so it can be loaded into a DuckDB session., Examples: ['INSTALL httpfs;', 'INSTALL h3 FROM community;']
`PIVOT`: The PIVOT statement in DuckDB allows distinct values within a column to be transformed into their own columns. The values within these new columns are calculated using an aggregate function on the subset of rows matching each distinct value. DuckDB supports both the SQL Standard PIVOT syntax, which requires explicit column names, and a simplified PIVOT syntax that can automatically detect which columns to create. The PIVOT statement is useful for reshaping data for analysis, similar to the way pivot tables work in spreadsheet software., Examples: ['PIVOT Cities ON Year USING sum(Population);', 'PIVOT Cities ON Year USING first(Population);', 'PIVOT Cities ON Year USING sum(Population) GROUP BY Country;', 'PIVOT Cities ON Year IN (2000, 2010) USING sum(Population) GROUP BY Country;', 'PIVOT Cities ON Country, Name USING sum(Population);', "PIVOT Cities ON Country || '_' || Name USING sum(Population);", 'PIVOT Cities ON Year USING sum(Population) AS total, max(Population) AS max GROUP BY Country;', 'PIVOT Cities ON Year USING sum(Population) GROUP BY Country, Name;', 'SELECT * FROM (PIVOT Cities ON Year USING sum(Population) GROUP BY Country) pivot_alias;']
`FILTER`: The FILTER clause is used in conjunction with aggregate functions within a SELECT statement to filter the input data specifically for the aggregate function. This allows for conditions to be applied similar to a WHERE clause, but localized to the aggregate function. It is useful for scenarios like pivoting data and handling null values cleanly, particularly with functions like 'first', 'last', 'list', and 'array_agg'. FILTER cannot be used in window functions., Examples: ['SELECT count(*) FILTER (i <= 5) AS lte_five FROM generate_series(1, 10) tbl(i);', 'SELECT sum(i) FILTER (i <= 5) AS lte_five_sum FROM generate_series(1, 10) tbl(i);', 'SELECT count(i) FILTER (year = 2022) AS "2022" FROM stacked_data;', 'SELECT first(i) FILTER (year = 2022) AS "2022" FROM stacked_data;']

Common DuckDB Types:
`VARCHAR`: `VARCHAR` is a versatile data type used to store variable-length character strings, accommodating a wide range of text and string data without enforcing a specific length., Examples: ['CREATE TABLE people (name VARCHAR, age INTEGER);', "INSERT INTO documents (text) VALUES ('This is a VARCHAR example text.');", "SELECT * FROM employees WHERE department = 'Engineering';", 'ALTER TABLE students ADD COLUMN email VARCHAR;', "UPDATE orders SET status = 'Shipped' WHERE order_id = 102;", "COPY products TO 'products.csv' DELIMITER ',' HEADER;"]
`INTEGER`: The INTEGER data type, with aliases such as int, signed, int4, int32, integer, and integral, represents whole numbers and is commonly used to store numeric data without fractional components., Examples: ['-- Assigning integer values to columns in a CREATE TABLE statement\nCREATE TABLE my_table (id INTEGER, age INTEGER);', '-- Inserting integer values as literals within an INSERT statement\nINSERT INTO my_table VALUES (1, 25);', '-- Using integer operations in a SELECT statement\nSELECT id + 10 AS new_id FROM my_table;', '-- Casting a float to an integer\nSELECT CAST(3.7 AS INTEGER) AS whole_number;', '-- Defining a column to only accept non-negative integers using a CHECK constraint\nCREATE TABLE my_table (id INTEGER CHECK (id >= 0));', '-- Using the INTEGER type in a primary key definition\nCREATE TABLE users (user_id INTEGER PRIMARY KEY, username VARCHAR);', '-- Updating integer columns\nUPDATE my_table SET age = age + 1 WHERE id = 1;', '-- Comparing integer values in a WHERE clause\nSELECT * FROM my_table WHERE age > 20;']
`NULL`: The `NULL` type in SQL represents a missing or unknown value, allowing for fields within a table to be uninitialized or absent in data., Examples: ['SELECT NULL = NULL;', 'SELECT NULL IS NULL;', "INSERT INTO table_name (column1, column2) VALUES (NULL, 'data');", "SELECT coalesce(NULL, 'default_value');", 'UPDATE table_name SET column1 = NULL WHERE condition;', "SELECT CASE WHEN column IS NULL THEN 'Value is NULL' ELSE column END FROM table_name;"]
`DATE`: The `DATE` type in SQL is used to store calendar dates without time components, representing a year, month, and day as accurate information for querying and managing date-related data., Examples: ["-- Add 5 days to a specific date\\nSELECT DATE '1992-03-22' + 5; -- Result: 1992-03-27\\n", "-- Subtract one date from another to get the number of days between them\\nSELECT DATE '1992-03-27' - DATE '1992-03-22'; -- Result: 5\\n", '-- Get the current date at the start of the transaction\\nSELECT current_date; -- Example result: 2022-10-08\\n', "-- Add an interval of 2 months to a specific date\\nSELECT date_add(DATE '1992-09-15', INTERVAL 2 MONTH); -- Result: 1992-11-15\\n", "-- Find the difference in months between two dates\\nSELECT date_diff('month', DATE '1992-09-15', DATE '1992-11-14'); -- Result: 2\\n", "-- Extract the year from a specific date\\nSELECT date_part('year', DATE '1992-09-20'); -- Result: 1992\\n", "-- Get the (English) name of the weekday from a specific date\\nSELECT dayname(DATE '1992-09-20'); -- Result: Sunday\\n", "-- Convert a date to a string format\\nSELECT strftime(date '1992-01-01', '%a, %-d %B %Y'); -- Result: Wed, 1 January 1992"]
`TIME`: The `TIME` type represents a time of day, independent of a specific date, and is used to store and manipulate values consisting of hours, minutes, seconds, and fractional seconds., Examples: ["SELECT TIME '14:21:13';", "SELECT TIME '08:30:00' + INTERVAL 5 MINUTE;", "SELECT EXTRACT(HOUR FROM TIME '23:45:12');", 'SELECT MAKE_TIME(13, 30, 59.999);', 'SELECT CURRENT_TIME;']
`TIMESTAMP`: A TIMESTAMP value represents an instant in time, composed of a combination of a date (year, month, day) and a time (hour, minute, second, microsecond), stored with microsecond precision, and it can be manipulated using various functions and operators., Examples: ["SELECT TIMESTAMP '1992-09-20 11:30:00.123456';", "SELECT TIMESTAMP '1992-09-20 11:30:00' + INTERVAL 10 DAYS;", "SELECT TIMESTAMP '2023-07-18 17:45:00' - TIMESTAMP '2023-07-10 15:30:00';", "SELECT age(TIMESTAMP '2023-07-18 17:45:00', TIMESTAMP '2022-07-18 17:45:00');", "SELECT strftime(TIMESTAMP '2023-07-18 17:45:00', '%Y-%m-%d %H:%M:%S');", "SELECT extract('hour' FROM TIMESTAMP '2023-07-18 17:45:00');"]
`JSON`: The JSON data type allows for the storage and querying of JSON formatted data, supporting functions for extracting, manipulating, and transforming JSON content within the database., Examples: ['CREATE TABLE example (j JSON);', 'INSERT INTO example VALUES (\'{ "family": "anatidae", "species": [ "duck", "goose", "swan", null ] }\');', "SELECT j->'$.family' FROM example;", "SELECT json_extract(j, '$.species[0]') FROM example;", "SELECT json_extract_string(j, '$.family') FROM example;"]
`STRUCT`: The `STRUCT` data type in SQL is used to create a column that contains an ordered list of columns, referred to as entries, which are accessed using named keys. This type is ideal for nesting multiple columns into a single column, allowing a structured and consistent data schema across all rows., Examples: ["SELECT struct_pack(key1 := 'value1', key2 := 42) AS s;", "SELECT {'key1': 'value1', 'key2': 42} AS s;", "SELECT a.x FROM (SELECT {'x': 1, 'y': 2, 'z': 3} AS a);", "SELECT struct_insert({'a': 1, 'b': 2, 'c': 3}, d := 4) AS s;", 'CREATE TABLE t1 (s STRUCT(v VARCHAR, i INTEGER));', "INSERT INTO t1 VALUES (row('a', 42));", "SELECT a.* FROM (SELECT {'x': 1, 'y': 2, 'z': 3} AS a);", "SELECT struct_extract({'x space': 1, 'y': 2, 'z': 3}, 'x space');"]
`LIST`: A `LIST` column is a flexible, ordered sequence of data values of the same type, which can vary in length among rows and can include any uniform data type, allowing for complex nested data structures., Examples: ['SELECT [1, 2, 3]; -- Creates a static list of integers', "SELECT ['duck', 'goose', NULL, 'heron']; -- Creates a list of strings containing a NULL value", 'SELECT list_value(1, 2, 3); -- Uses the list_value function to create a list of integers', 'CREATE TABLE list_table (int_list INTEGER[], varchar_list VARCHAR[]); -- Defines a table with integer and varchar lists', "SELECT (['a', 'b', 'c'])[3]; -- Retrieves the third element from a list", 'SELECT list_slice([1, 2, 3, 4, 5], 2, 4); -- Extracts a sublist from the main list']
`DECIMAL`: The DECIMAL data type, also known as NUMERIC or DEC, allows for the representation of exact fixed-point decimal numbers, providing precise control over the number of digits and the digits after the decimal point., Examples: ['CREATE TABLE salaries (\\n    employee_id INTEGER,\\n    base_salary DECIMAL(10, 2)\\n);', 'INSERT INTO salaries (employee_id, base_salary) VALUES\\n    (1, 50000.00),\\n    (2, 65000.50);', 'SELECT employee_id, base_salary\\nFROM salaries\\nWHERE base_salary > DECIMAL(60000, 2);', 'UPDATE salaries\\nSET base_salary = base_salary + DECIMAL(5000.00, 2)\\nWHERE employee_id = 1;', 'SELECT CAST(99 AS DECIMAL(10, 2));']
`ARRAY`: The ARRAY data type stores fixed-size arrays where each element is of the same type, and it is suitable for representing ordered sequences of elements such as numerical vectors or nested arrays., Examples: ['SELECT array_value(1, 2, 3); -- Creates an array with elements 1, 2, and 3', 'CREATE TABLE example_table (id INTEGER, arr INTEGER[3]); -- Declares an array of three integers', 'SELECT id, arr[1] AS element FROM example_table; -- Retrieves the first element of the array', 'SELECT array_value(array_value(1, 2), array_value(3, 4), array_value(5, 6)); -- Creates a nested array using arrays as elements', 'INSERT INTO example_table VALUES (1, [1, 2, 3]), (2, [4, 5, 6]); -- Inserts rows with array values into a table', 'SELECT array_cosine_similarity(array_value(1.0, 2.0, 3.0), array_value(2.0, 3.0, 4.0)); -- Computes cosine similarity between two arrays of the same size', 'SELECT array_cross_product(array_value(1.0, 2.0, 3.0), array_value(2.0, 3.0, 4.0)); -- Computes the cross product of two 3-element arrays']
`FLOAT`: The FLOAT data type, also known by aliases FLOAT4, REAL, or float, represents a single precision floating-point number, facilitating approximate calculations and efficient handling of numerical data with precision typically up to 6 decimal digits and a range of at least 1E-37 to 1E+37., Examples: ['-- Example: Creating a table with a FLOAT column\nCREATE TABLE example_table (id INTEGER, value FLOAT);', '-- Example: Inserting values into a FLOAT column\nINSERT INTO example_table VALUES (1, 3.14), (2, 2.718);', '-- Example: Performing arithmetic operations with FLOAT values\nSELECT id, value * 2.0::FLOAT AS doubled_value FROM example_table;', '-- Example: Casting a numeric value to FLOAT\nSELECT CAST(100 AS FLOAT) AS float_value;', '-- Example: Using FLOAT values in a mathematical function\nSELECT SQRT(value) FROM example_table WHERE value > 0;', '-- Example: Comparing FLOAT values\nSELECT * FROM example_table WHERE value > 3.0::FLOAT;']
`BIGINT`: The `BIGINT` data type is an 8-byte integer that can store large integer values suitable for handling significant quantities or high precision integer data., Examples: ['CREATE TABLE example_table (id BIGINT PRIMARY KEY, count BIGINT, reference_id BIGINT);', "SELECT * FROM parquet_metadata('file.parquet') WHERE row_group_id = 1;", 'ALTER TABLE orders ADD COLUMN order_count BIGINT DEFAULT 0;', 'UPDATE employee SET salary = salary + 1000 WHERE employee_id = 1001;', 'SELECT store_id, SUM(sales) AS total_sales FROM transactions GROUP BY store_id;', 'CREATE SEQUENCE order_sequence START WITH 1000 INCREMENT BY 1 MINVALUE 100 MAXVALUE 10000 NO CYCLE;']
`DOUBLE`: The `DOUBLE` type, also known as `FLOAT8`, is a double-precision floating point number data type commonly used for storing large or precise decimal values in SQL queries., Examples: ['```sql\n-- Using DOUBLE to store and manipulate high-precision values\nCREATE TABLE sales_data (\n    transaction_id INTEGER,\n    sale_amount DOUBLE\n);\n\nINSERT INTO sales_data (transaction_id, sale_amount) VALUES (1, 1999.99);\nSELECT sale_amount * 1.05 AS total_after_tax FROM sales_data WHERE transaction_id = 1;\n```', '```sql\n-- Calculating the square root of a DOUBLE value\nSELECT sqrt(column_value) FROM my_table WHERE column_value > 0;\n```', '```sql\n-- Using DOUBLE in mathematical functions\nSELECT sin(column1), cos(column2) FROM my_numeric_table;\n```', '```sql\n-- Explicit casting of an INTEGER to DOUBLE for precision in arithmetic operations\nSELECT cast(my_integer_column AS DOUBLE) / 2 FROM my_table;\n```', '```sql\n-- Working with DOUBLE in spatial functions\nDOUBLE ST_Area (geometry)  -- Computes the area of a geometry, returning a DOUBLE value as the area\n```', "```sql\n-- Using the DOUBLE type in JSON processing\nSELECT json_extract(my_json_column, '$.key')::DOUBLE FROM my_json_table;\n```"]
`INTERVAL`: The INTERVAL data type represents a period of time that can be measured in months, days, microseconds, or a combination of these units, and is typically used to add or subtract to DATE, TIMESTAMP, TIMESTAMPTZ, or TIME values., Examples: ["SELECT INTERVAL '1 month 1 day'; -- Returns an interval representing 1 month and 1 day", "SELECT DATE '2000-01-01' + INTERVAL 1 YEAR; -- Adds 1 year to the specified date", "SELECT TIMESTAMP '2000-02-06 12:00:00' - TIMESTAMP '2000-01-01 11:00:00'; -- Returns interval of 36 days 1 hour", "SELECT INTERVAL '48:00:00'::INTERVAL; -- Converts a time string to microseconds interval representing 48 hours", "SELECT (DATE '2020-01-01' + INTERVAL 30 DAYS) = (DATE '2020-01-01' + INTERVAL 1 MONTH); -- Compares intervals by their conversion to microseconds"]
`BOOLEAN`: The `BOOLEAN` type represents a statement of truth, "true" or "false", with the possibility of being "unknown", represented by `NULL` in SQL., Examples: ['> SELECT true, false, NULL::BOOLEAN;', '-- Outputs the three possible values for BOOLEAN: true, false, NULL.', 'CREATE TABLE example (is_active BOOLEAN);', '-- Create a table with a BOOLEAN column.', 'INSERT INTO example VALUES (true), (false), (NULL);', '-- Insert BOOLEAN values, including NULL.', 'SELECT * FROM example WHERE is_active AND is_verified;', '-- Filters rows where both conditions are true.', 'UPDATE example SET is_active = false WHERE condition;', '-- Update rows to set the BOOLEAN field to false.']
`UNION`: The UNION data type is a nested type that holds one of multiple distinct values with a "tag" to identify the active type and can contain multiple uniquely tagged members of various types, akin to C++ std::variant or Rust's Enum., Examples: ["```sql\nCREATE TABLE tbl1 (u UNION(num INTEGER, str VARCHAR));\nINSERT INTO tbl1 VALUES (1), ('two'), (union_value(str := 'three'));\n```", "```sql\nSELECT union_extract(u, 'str') AS str\nFROM tbl1;\n```", '```sql\nSELECT u.str\nFROM tbl1;\n```', '```sql\nSELECT union_tag(u) AS t\nFROM tbl1;\n```']
`ENUM`: The Enum data type represents a dictionary encoding structure that enumerates all possible unique string values of a column, allowing for efficient storage and query execution by storing only numerical references to the strings., Examples: ["CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');", 'CREATE TYPE birds AS ENUM (SELECT my_varchar FROM my_inputs);', 'CREATE TABLE person (name TEXT, current_mood mood);', "INSERT INTO person VALUES ('Pedro', 'happy'), ('Pagliacci', 'sad');", 'SELECT enum_range(NULL::mood) AS mood_values;', 'DROP TYPE mood;']
`TINYINT`: TINYINT is a signed one-byte integer type that can store whole numbers ranging from -128 to 127, often used to save storage space when values are known to fall within this small range., Examples: ["SELECT CAST('123' AS TINYINT);", 'INSERT INTO my_table (x) VALUES (CAST(100 AS TINYINT));', 'UPDATE my_table SET x = CAST(50 AS TINYINT) WHERE id = 1;', 'SELECT * FROM my_table WHERE x = CAST(-50 AS TINYINT);', 'CREATE TABLE example (id TINYINT);']
`UUID`: The UUID data type is used to store universally unique identifiers as 128-bit values, formatted as 36-character strings with hexadecimal characters and dashes arranged in the pattern ⟨8 characters⟩-⟨4 characters⟩-⟨4 characters⟩-⟨4 characters⟩-⟨12 characters⟩., Examples: ['-- Create a table with a UUID column\nCREATE TABLE users (id UUID, name VARCHAR);', "-- Insert a new UUID value into the table\nINSERT INTO users (id, name) VALUES (gen_random_uuid(), 'Alice');", "-- Retrieve UUID values from a table\nSELECT id FROM users WHERE name = 'Alice';", '-- Generate and display a random UUID\nSELECT uuid();']
`TIMESTAMP WITH TIME ZONE`: `TIMESTAMP WITH TIME ZONE` (or `TIMESTAMPTZ`) represents a point in time using a calendar date and time of day along with a time zone offset, allowing for time zone sensitive operations such as conversions and comparisons., Examples: ["SELECT TIMESTAMPTZ '2023-10-17 12:00:00+01';", "SELECT now() AT TIME ZONE 'UTC';", "SELECT TIMESTAMP '2023-10-17 10:00:00-07' AT TIME ZONE 'America/New_York';", "SELECT age(TIMESTAMPTZ '2005-10-17 12:00:00-07');", "SELECT TIMESTAMPTZ '2023-10-17 15:00:00+00' - TIMESTAMPTZ '2023-10-16 15:00:00+00';"]
`SMALLINT`: The SMALLINT type, with aliases such as short, int2, smallint, and int16, represents a signed two-byte integer that can store whole numbers ranging from -32768 to 32767., Examples: ['CREATE TABLE test_table (id SMALLINT);', 'INSERT INTO test_table (id) VALUES (100);', 'SELECT * FROM test_table WHERE id BETWEEN -100 AND 100;', 'ALTER TABLE test_table ADD COLUMN new_column SMALLINT;', 'UPDATE test_table SET id = id + 1 WHERE id < 32767;']
`BLOB`: The BLOB (Binary Large Object) type represents a variable-length binary data object, used for storing arbitrary binary data in the database, such as images or files, without any interpretation of its contents., Examples: ["-- Create a BLOB with a single byte\\nSELECT '\\xAA'::BLOB;\\n-- Result: \\xAA\\n\\n-- Create a BLOB with multiple bytes\\nSELECT '\\xAA\\xAB\\xAC'::BLOB;\\n-- Result: \\xAA\\xAB\\xAC\\n\\n-- Concatenate two BLOB values\\nSELECT '\\xAA'::BLOB || '\\xBB'::BLOB;\\n-- Result: \\xAABB\\n\\n-- Convert a BLOB to a hexadecimal string\\nSELECT hex('\\xAA\\xBB'::BLOB);\\n-- Result: AABB\\n\\n-- Decode a BLOB to a string, ensuring it is valid UTF-8\\nSELECT decode('\\xC3\\xBC'::BLOB);\\n-- Result: ü\\n\\n-- Read a BLOB from a file\\nSELECT read_blob('myfile.bin');\\n-- Result: Contents of 'myfile.bin' as a BLOB"]

Common DuckDB Keywords:
`AS`: The `AS` keyword in SQL is used to create an alias for columns or tables, helping to simplify query logic and improve readability., Examples: ['SELECT first_name AS name FROM employees;', 'SELECT department AS dept FROM company;', 'CREATE VIEW sales_report AS SELECT * FROM sales WHERE year = 2023;', 'SELECT product_name AS name, SUM(sales) AS total_sales FROM store GROUP BY product_name;', 'SELECT c.customer_id, c.name AS customer_name, o.order_id, o.total_amount AS amount FROM customers c INNER JOIN orders o ON c.customer_id = o.customer_id;']
`DISTINCT`: The `DISTINCT` keyword is used in the SQL `SELECT` statement to ensure that only unique values are returned for specified columns, effectively removing duplicate rows from the result set., Examples: ['SELECT DISTINCT city FROM addresses;', 'SELECT DISTINCT ON(country) city, population FROM cities ORDER BY population DESC;']
`IN`: The `IN` keyword is used in SQL to specify a list of discrete values for a column to match against, typically in a `WHERE` clause, allowing for multiple specific conditions to be evaluated at once., Examples: ["SELECT * FROM employees WHERE department IN ('HR', 'Engineering', 'Marketing');", 'SELECT id, name FROM students WHERE grade IN (10, 11, 12);', "DELETE FROM orders WHERE order_status IN ('Cancelled', 'Returned');", "UPDATE items SET status = 'Unavailable' WHERE item_id IN (1001, 1002, 1003);", "SELECT * FROM logs WHERE severity IN ('ERROR', 'CRITICAL') ORDER BY timestamp DESC;"]
`OVER`: The `OVER` clause in SQL specifies a window for evaluating window functions, allowing computations over a defined group of rows in a result set., Examples: ['SELECT row_number() OVER () FROM sales;', 'SELECT row_number() OVER (ORDER BY time) FROM sales;', 'SELECT row_number() OVER (PARTITION BY region ORDER BY time) FROM sales;', 'SELECT amount - lag(amount) OVER (ORDER BY time) FROM sales;', 'SELECT amount / sum(amount) OVER (PARTITION BY region) FROM sales;']
`ALL`: The `ALL` keyword in SQL specifies that operations should retain all duplicate rows, as seen in commands like `UNION ALL`, `INTERSECT ALL`, and `EXCEPT ALL`, which follow bag semantics instead of eliminating duplicates., Examples: ['UNION ALL\n\n```sql\nSELECT * FROM range(2) t1(x)\nUNION ALL\nSELECT * FROM range(3) t2(x);\n```\nThis example demonstrates using `UNION ALL` to combine rows from two queries without eliminating duplicates.', 'INTERSECT ALL\n\n```sql\nSELECT unnest([5, 5, 6, 6, 6, 6, 7, 8]) AS x\nINTERSECT ALL\nSELECT unnest([5, 6, 6, 7, 7, 9]);\n```\nThis example shows using `INTERSECT ALL` to select rows that are present in both result sets, keeping duplicate values.', 'EXCEPT ALL\n\n```sql\nSELECT unnest([5, 5, 6, 6, 6, 6, 7, 8]) AS x\nEXCEPT ALL\nSELECT unnest([5, 6, 6, 7, 7, 9]);\n```\nThis example illustrates `EXCEPT ALL`, which selects all rows present in the first query but not in the second, without removing duplicates.', 'ORDER BY ALL\n\n```sql\nSELECT *\nFROM addresses\nORDER BY ALL;\n```\nThis SQL command uses `ORDER BY ALL` to sort the result set by all columns sequentially from left to right.']
`LIKE`: The `LIKE` expression is used to determine if a string matches a specified pattern, allowing wildcard characters such as `_` to represent any single character and `%` to match any sequence of characters., Examples: ["SELECT 'abc' LIKE 'abc'; -- true", "SELECT 'abc' LIKE 'a%'; -- true", "SELECT 'abc' LIKE '_b_'; -- true", "SELECT 'abc' LIKE 'c'; -- false", "SELECT 'abc' LIKE 'c%'; -- false", "SELECT 'abc' LIKE '%c'; -- true", "SELECT 'abc' NOT LIKE '%c'; -- false", "SELECT 'abc' ILIKE '%C'; -- true"]
"""

server = Server("mcp-server-motherduck")

conn = duckdb.connect()

@server.list_resources()
async def handle_list_resources() -> list[types.Resource]:
    """
    List available note resources.
    Each note is exposed as a resource with a custom note:// URI scheme.
    """
    return []

@server.read_resource()
async def handle_read_resource(uri: AnyUrl) -> str:
    """
    Read a specific note's content by its URI.
    The note name is extracted from the URI host component.
    """
    raise ValueError(f"Unsupported URI scheme: {uri.scheme}")

@server.list_prompts()
async def handle_list_prompts() -> list[types.Prompt]:
    """
    List available prompts.
    Each prompt can have optional arguments to customize its behavior.
    """
    return [
        types.Prompt(
            name="duckdb-motherduck-initial-prompt",
            description="A prompt to initialize a connection to duckdb or motherduck and start working with it",
        )
    ]

@server.get_prompt()
async def handle_get_prompt(
        name: str, arguments: dict[str, str] | None
) -> types.GetPromptResult:
    """
    Generate a prompt by combining arguments with server state.
    The prompt includes all current notes and can be customized via arguments.
    """
    if name != "duckdb-motherduck-initial-prompt":
        raise ValueError(f"Unknown prompt: {name}")

    return types.GetPromptResult(
        description=f"Initial prompt for interacting with DuckDB/MotherDuck",
        messages=[
            types.PromptMessage(
                role="user",
                content=types.TextContent(type="text", text=PROMPT_TEMPLATE),
            )
        ],
    )

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """
    List available tools.
    Each tool specifies its arguments using JSON Schema validation.
    """
    return [
        types.Tool(
            name="initialize-connection",
            description="Create a connection to either a local DuckDB or MotherDuck and retrieve available databases",
            inputSchema={
                "type": "object",
                "properties": {
                    "type": {"type": "string", "description": "Type of the database, either 'DuckDB' or 'MotherDuck'"},
                },
                "required": ["type"],
            },
        ),
        types.Tool(
            name="read-schemas",
            description="Get table schemas from a specific DuckDB/MotherDuck database",
            inputSchema={
                "type": "object",
                "properties": {
                    "type": {"database_name": "string", "description": "name of the database"},
                },
                "required": ["database_name"],
            },
        ),
        types.Tool(
            name="execute-query",
            description="Execute a query on the MotherDuck (DuckDB) database",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "SQL query to execute"},
                },
                "required": ["query"],
            },
        )
    ]

@server.call_tool()
async def handle_call_tool(
        name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """
    Handle tool execution requests.
    Tools can modify server state and notify clients of changes.
    """
    global conn
    if name == "initialize-connection":
        type = arguments["type"].strip().upper()
        if not type in ['DUCKDB', 'MOTHERDUCK']:
            raise ValueError("Only 'DuckDB' or 'MotherDuck' are supported")
        if type == 'MOTHERDUCK' and not os.getenv('motherduck_token'):
            raise ValueError("Please set the `motherduck_token` environment variable.")
        if type == 'MOTHERDUCK':
            conn = duckdb.connect('md:')
        elif type == 'DUCKDB':
            conn = duckdb.connect()
        databases = conn.execute("""select string_agg(database_name, ',\n')
                                    from duckdb_databases() where database_name 
                                    not in ('system', 'temp')""").fetchone()[0]
        response = f'Connection to {type} successfully established. Here are the available databases: \n{databases}'
        return [types.TextContent(type="text", text=response)]
    if name == "read-schemas":
        database = arguments["database_name"]
        tables = conn.execute(f"""
                    SELECT string_agg(regexp_replace(sql, 'CREATE TABLE ', 'CREATE TABLE '||database_name||'.'), '\n\n') as sql 
                    FROM duckdb_tables()
                    WHERE database_name = '{database}'""").fetchone()[0]
        views = conn.execute(f"""
                    SELECT string_agg(regexp_replace(sql, 'CREATE TABLE ', 'CREATE TABLE '||database_name||'.'), '\n\n') as sql 
                    FROM duckdb_views()
                    where schema_name not in ('information_schema', 'pg_catalog', 'localmemdb')
                    and view_name not in ('duckdb_columns','duckdb_constraints','duckdb_databases','duckdb_indexes','duckdb_schemas','duckdb_tables','duckdb_types','duckdb_views','pragma_database_list','sqlite_master','sqlite_schema','sqlite_temp_master','sqlite_temp_schema')
                    and database_name = '{database}'
                    """).fetchone()[0]
        results = f"Here are all tables: \n{tables} \n\n Here are all views: {views}"
        return [types.TextContent(type="text", text=str(results))]
    if name == "execute-query":
        try:
            results = conn.execute(arguments["query"]).fetchall()
        except Exception as e:
            raise ValueError('Error querying the database:'+str(e))
        return [types.TextContent(type="text", text=str(results))]


async def main():
    # Run the server using stdin/stdout streams
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="motherduck",
                server_version="0.2.2",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )
