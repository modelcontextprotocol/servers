# Azure MCP Server

An implementation of a [Model Context Protocol](https://www.anthropic.com/news/model-context-protocol) server for interacting with Azure services. Currently supports Azure Blob Storage and Azure Cosmos DB (NoSQL API). All operations performed through this server are automatically logged and accessible via the `audit://azure-operations` resource endpoint.

## Running Locally with the Claude Desktop App

### Manual Installation

1.  **Clone the Repository:** Clone this repository to your local machine.

2.  **Configure Azure Credentials:** Configure your Azure credentials. This server requires an Azure account with appropriate permissions for Blob Storage and Cosmos DB. We recommend using `DefaultAzureCredential` which attempts to authenticate via various methods in order.

    *   **Environment Variables:** Set the following environment variables:
        *   `AZURE_STORAGE_ACCOUNT_URL`: The URL of your Azure Storage account (e.g., `https://<your_account_name>.blob.core.windows.net`).
        *   `AZURE_COSMOSDB_ENDPOINT`: The endpoint URL for your Azure Cosmos DB account.
        *   `AZURE_COSMOSDB_KEY`: The primary or secondary key for your Azure Cosmos DB account. **Important: Treat this key like a password and keep it secure.**
    *   **Azure CLI:** Alternatively, you can authenticate using the Azure CLI. Ensure you are logged in with an account that has the necessary permissions. This server uses `DefaultAzureCredential` so it will automatically authenticate with the Azure CLI credentials if environment variables are not specified. Use `az login` to log in.

3.  **Configure Claude Desktop:** Add the following configuration to your `claude_desktop_config.json` file:

    *   **macOS:** `~/Library/Application\ Support/Claude/claude_desktop_config.json`
    *   **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

    ```json
    "mcpServers": {
      "mcp-server-azure": {
        "command": "uv",
        "args": [
          "--directory",
          "/path/to/repo/azure-mcp-server",
          "run",
          "azure-mcp-server"
        ]
      }
    }
    ```

    Replace `/path/to/repo/azure-mcp-server` with the actual path to the cloned repository.

4.  **Install and Launch Claude Desktop:** Install and open the [Claude desktop app](https://claude.ai/download).

5.  **Test the Setup:** Ask Claude to perform a read or write operation using the Azure tools (e.g., create a Blob Storage container or add an item to Cosmos DB). If you encounter issues, consult the MCP debugging documentation [here](https://modelcontextprotocol.io/docs/tools/debugging).

## Available Tools

### Azure Blob Storage Operations

*   **blob\_container\_create:** Creates a new Blob Storage container. Requires the `container_name`.
*   **blob\_container\_list:** Lists all Blob Storage containers in the configured account.
*   **blob\_container\_delete:** Deletes a Blob Storage container. Requires the `container_name`.
*   **blob\_upload:** Uploads a blob (file) to a Blob Storage container. Requires the `container_name`, `blob_name`, and the `file_content` (Base64 encoded).
*   **blob\_delete:** Deletes a blob from a Blob Storage container. Requires the `container_name` and `blob_name`.
*   **blob\_list:** Lists the blobs within a Blob Storage container. Requires the `container_name`.
*   **blob\_read:** Reads the content of a blob from Blob Storage. Requires the `container_name` and `blob_name`. Returns the content as text.

### Azure Cosmos DB (NoSQL API) Operations

#### Container Operations

*   **cosmosdb\_container\_create:** Creates a new Cosmos DB container within a database. Requires the `container_name` and `partition_key`. The `database_name` is optional and defaults to `defaultdb`. The `partition_key` should be a JSON object defining the partition key (e.g., `{"paths": ["/myPartitionKey"], "kind": "Hash"}`).
*   **cosmosdb\_container\_describe:** Retrieves details about a Cosmos DB container. Requires the `container_name`. The `database_name` is optional and defaults to `defaultdb`.
*   **cosmosdb\_container\_list:** Lists all Cosmos DB containers within a database. The `database_name` is optional and defaults to `defaultdb`.
*   **cosmosdb\_container\_delete:** Deletes a Cosmos DB container. Requires the `container_name`. The `database_name` is optional and defaults to `defaultdb`.

#### Item Operations

*   **cosmosdb\_item\_create:** Creates a new item within a Cosmos DB container. Requires the `container_name` and the `item` (a JSON object representing the item). The `database_name` is optional and defaults to `defaultdb`. Make sure your `item` includes the partition key field and value.
*   **cosmosdb\_item\_read:** Reads an item from a Cosmos DB container. Requires the `container_name`, `item_id`, and `partition_key`. The `database_name` is optional and defaults to `defaultdb`. The `partition_key` *must* match the partition key value of the item being read.
*   **cosmosdb\_item\_replace:** Replaces an existing item within a Cosmos DB container. Requires the `container_name`, `item_id`, `partition_key`, and the `item` (a JSON object representing the *complete* updated item). The `database_name` is optional and defaults to `defaultdb`. The `partition_key` *must* match the partition key value of the item being replaced.
*   **cosmosdb\_item\_delete:** Deletes an item from a Cosmos DB container. Requires the `container_name`, `item_id`, and `partition_key`. The `database_name` is optional and defaults to `defaultdb`. The `partition_key` *must* match the partition key value of the item being deleted.
*   **cosmosdb\_item\_query:** Queries items in a Cosmos DB container using a SQL query. Requires the `container_name` and `query`. The `database_name` is optional and defaults to `defaultdb`. Optionally accepts a `parameters` array for parameterized queries.

**Important Cosmos DB Notes:**

*   **Partition Keys:** Cosmos DB requires a partition key for efficient data storage and retrieval. When creating containers, you *must* define a partition key. When reading, replacing, or deleting items, you *must* provide the correct partition key value for the item you are accessing. The partition key is a property *within* your data.
*   **Case Sensitivity:** Cosmos DB resource names (databases, containers, item IDs) and partition key values are case-sensitive. Ensure that you use the correct casing in your tool calls.
*   **Default Database:** If the `database_name` is not provided, the server defaults to a database named `SampleDB`. Ensure this database exists, or explicitly provide the name of your desired database in the tool call arguments.

This README provides the information needed to set up and use the Azure MCP Server with the Claude desktop application. Remember to handle your Azure credentials securely and consult the MCP documentation for further information on the protocol