export const tools = [
    {
        name: "pg-query",
        description: "This tool executes SQL queries in a READ ONLY session connected to a PostgreSQL database. If no active connection exists, it uses MCP server registration argument and environment variables PG_USER and PG_PASSWORD.\n\nYou should:\n\n\tExecute the provided SQL query.\n\n\tReturn the results in Toon format.\n\nArgs:\n\n\tsql: The SQL query to execute.\n\n\nThe `model` argument should specify only the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n\nReturns:\n\n\tJson-formatted query results.\nFor every SQL query you generate, please include a comment at the beginning of the SELECT statement (or other main SQL command) that identifies the LLM model name and version you are using. Format the comment as: /* LLM in use is [model_name_and_version] */ and place it immediately after the main SQL keyword.\nFor example:\n\nSELECT /* LLM in use is claude-sonnet-4 */ column1, column2 FROM table_name;\n\nPlease apply this format consistently to all SQL queries you generate, using your actual model name and version in the comment\n",
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
        name: "pg-stats",
        description: "Get comprehensive statistics for a specific PostgreSQL table. This tool retrieves detailed information including row counts, table size, index information, column statistics, and other metadata that can help optimize queries and understand data distribution.\n\nArgs:\n\n\tname: The name of the table to get statistics for.\n\n\nThe `model` argument should specify only the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n\nReturns:\n\n\tJson-formatted table statistics including row counts, size information, indexes, and column details.\n",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name of the table to get statistics for"
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
            required: ["name"]
        },
    },
    {
        name: "pg-explain",
        description: "Generate and display the execution plan for a given SQL query using PostgreSQL's EXPLAIN command. This tool helps you understand how PostgreSQL will execute your query, including information about table scans, joins, indexes used, and estimated costs.\n\nArgs:\n\n\tsql: The SQL query to explain.\n\n\nThe `model` argument should specify only the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n\nReturns:\n\n\tDetailed execution plan showing how PostgreSQL will process the query, including costs, row estimates, and access methods.\n",
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
        name: "pg-connect",
        description: "Provides an interface to connect to a specified PostgreSQL database. If a database connection is already active, the tool will close the existing connection before establishing a new one.\n\nThis tool accepts three required parameters:\n\n\tconnectionString: The PostgreSQL connection string without embedded credentials (e.g., postgresql://host:port/dbname or host:port/dbname). To enable encryption (SSL), append ?sslmode=require to the connection string.\n\tuser: The PostgreSQL username\n\tpassword: The PostgreSQL password\n\nThe credentials are stored in environment variables PG_USER and PG_PASSWORD for the session.\n\nThe `model` argument should only be used to specify the name and version of the LLM (Large Language Model) you are using, with no additional information.\nThe `mcp_client` argument should specify only the name of the MCP (Model Context Protocol) client you are using, with no additional information.\n",
        inputSchema: {
            type: "object",
            properties: {
                connectionString: {
                    type: "string",
                    description: "The PostgreSQL connection string (e.g. postgresql://host:port/dbname or host:port/dbname)"
                },
                user: {
                    type: "string",
                    description: "The PostgreSQL user (e.g. postgres)"
                },
                password: {
                    type: "string",
                    description: "The PostgreSQL password"
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
            required: ["connectionString", "user", "password"]
        },
    },
    {
        name: "pg-awr",
        description: "Generate a PostgreSQL performance report similar to Oracle AWR. Includes database statistics, top queries (requires pg_stat_statements extension), table/index statistics, connection info, and optimization recommendations.",
        inputSchema: {
            type: "object",
            properties: {
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
        },
    },
];
