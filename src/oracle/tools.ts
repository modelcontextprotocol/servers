export const tools = [
  {
    name: "orcl-query",
    description: "This tool executes SQL queries in a READY ONLY session connected to an Oracle database. If no active connection exists, it uses MCP server registration argument and environment variables ORACLE_USER and ORACLE_PASSWORD.\n\nYou should:\n\n\tExecute the provided SQL query.\n\n\tReturn the results in Json format.\n\nArgs:\n\n\tsql: The SQL query to execute.\n\n\nThe `model` argument should specify only the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n\nReturns:\n\n\tJson-formatted query results.\nFor every SQL query you generate, please include a comment at the beginning of the SELECT statement (or other main SQL command) that identifies the LLM model name and version you are using. Format the comment as: /* LLM in use is [model_name_and_version] */ and place it immediately after the main SQL keyword.\nFor example:\n\nSELECT /* LLM in use is claude-sonnet-4 */ column1, column2 FROM table_name;\n\nPlease apply this format consistently to all SQL queries you generate, using your actual model name and version in the comment\n",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "The SQL query to execute"
        },
        mcp_client: {
          "type": "string",
          "description": "Specify the name and version of the MCP client implementation being used (e.g. Copilot, Claude, Cline...)",
          "default": "UNKNOWN-MCP-CLIENT"
        },
        model: {
          "type": "string",
          "description": "The name (and version) of the language model being used by the MCP client to process requests (e.g. gpt-4.1, claude-sonnet-4, llama4...)",
          "default": "UNKNOWN-LLM"
        }
      },
      required: ["sql", "mcp_client", "model"]
    },
  },
  {
    name: "orcl-explain",
    description: "Generate and display the execution plan for a given SQL query using Oracle's EXPLAIN PLAN command. This tool helps you understand how Oracle will execute your query, including information about table access methods, join operations, indexes used, estimated costs, and cardinality estimates.\n\nArgs:\n\n\tsql: The SQL query to explain.\n\n\nThe `model` argument should specify only the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n\nReturns:\n\n\tDetailed execution plan showing how Oracle will process the query, including operation types, object names, costs, bytes, and cardinality estimates.\n",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "The SQL query to explain"
        },
        mcp_client: {
          "type": "string",
          "description": "Specify the name and version of the MCP client implementation being used (e.g. Copilot, Claude, Cline...)",
          "default": "UNKNOWN-MCP-CLIENT"
        },
        model: {
          "type": "string",
          "description": "The name (and version) of the language model being used by the MCP client to process requests (e.g. gpt-4.1, claude-sonnet-4, llama4...)",
          "default": "UNKNOWN-LLM"
        }
      },
      required: ["sql", "mcp_client", "model"]
    },
  },
  {
    name: "orcl-stats",
    description: "Get comprehensive statistics for a specific Oracle database object (table, index, or view). This tool retrieves detailed information including row counts, block statistics, segment size, index information, column statistics, partition details, and other metadata that can help optimize queries and understand data distribution.\n\nArgs:\n\n\tname: The name of the database object to get statistics for.\n\n\nThe `model` argument should specify only the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n\nReturns:\n\n\tJson-formatted object statistics including row counts, block usage, size information, indexes, partitions, and column details with histograms and data distribution metrics.\n",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "SQL Object to get stats"
        },
        mcp_client: {
          "type": "string",
          "description": "Specify the name and version of the MCP client implementation being used (e.g. Copilot, Claude, Cline...)",
          "default": "UNKNOWN-MCP-CLIENT"
        },
        model: {
          "type": "string",
          "description": "The name (and version) of the language model being used by the MCP client to process requests (e.g. gpt-4.1, claude-sonnet-4, llama4...)",
          "default": "UNKNOWN-LLM"
        }
      },
      required: ["name", "mcp_client", "model"]
    },
  },
  {
    name: "orcl-connect",
    description: "Provides an interface to connect to a specified database. If a database connection is already active, prompt the user for confirmation before switching to the new connection.\n\n\nThe `model` argument should only be used to specify the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n",
    inputSchema: {
      type: "object",
      properties: {
        connectionString: {
          "type": "string",
          "description": "The Oracle connect string (e.g. host.docker.internal:1521/freepdb1",
          "default": "none, this parameter is required"
        },
        user: {
          "type": "string",
          "description": "The Oracle user (e.g. scott",
          "default": "none, this parameter is required"
        },
        password: {
          "type": "string",
          "description": "The Oracle password (e.g. tiger",
          "default": "none, this parameter is required"
        },
      },
      required: ["connectionString", "user", "password"],
    },
  },
  {
    name: "orcl-awr",
    description: "Generate an Automatic Workload Repository (AWR) report or AWR SQL report for Oracle database performance analysis. AWR reports provide comprehensive performance metrics including database statistics, wait events, top SQL statements, system resources, and performance recommendations.\n\nIf no sql_id is provided, generates a full AWR database report with:\n- Database instance information and configuration\n- Load profile and instance efficiency metrics\n- Top wait events and time model statistics\n- SQL statistics ordered by various metrics (elapsed time, CPU time, executions, etc.)\n- Segment statistics and I/O statistics\n- Memory and SGA statistics\n- System and session statistics\n\nIf a sql_id is provided, generates an AWR SQL report focused on that specific SQL statement with:\n- SQL text and execution statistics\n- Execution plans and plan history\n- Bind variable information\n- Wait events specific to the SQL\n- Performance metrics over time\n\nArgs:\n\n\tsql_id (optional): The SQL ID for generating an AWR SQL report. If omitted, generates a full AWR database report.\n\nReturns:\n\n\tComprehensive performance report in text or HTML format with actionable insights for database tuning and optimization.\n",
    inputSchema: {
      type: "object",
      properties: {
        sql_id: { type: "string" },
      },
    },
  },
];
