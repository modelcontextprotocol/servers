# Notion MCP Server

MCP Server for the Notion API, enabling Claude to interact with Notion workspaces.

## Tools

1. `notion_append_block_children`

   - Append child blocks to a parent block.
   - Required inputs:
     - `block_id` (string): The ID of the parent block.
     - `children` (array): Array of block objects to append.
   - Returns: Information about the appended blocks.

2. `notion_retrieve_block`

   - Retrieve information about a specific block.
   - Required inputs:
     - `block_id` (string): The ID of the block to retrieve.
   - Returns: Detailed information about the block.

3. `notion_retrieve_block_children`

   - Retrieve the children of a specific block.
   - Required inputs:
     - `block_id` (string): The ID of the parent block.
   - Optional inputs:
     - `start_cursor` (string): Cursor for the next page of results.
     - `page_size` (number, default: 100, max: 100): Number of blocks to retrieve.
   - Returns: List of child blocks.

4. `notion_delete_block`

   - Delete a specific block.
   - Required inputs:
     - `block_id` (string): The ID of the block to delete.
   - Returns: Confirmation of the deletion.

5. `notion_retrieve_page`

   - Retrieve information about a specific page.
   - Required inputs:
     - `page_id` (string): The ID of the page to retrieve.
   - Returns: Detailed information about the page.

6. `notion_update_page_properties`

   - Update properties of a page.
   - Required inputs:
     - `page_id` (string): The ID of the page to update.
     - `properties` (object): Properties to update.
   - Returns: Information about the updated page.

7. `notion_create_database`

   - Create a new database.
   - Required inputs:
     - `parent` (object): Parent object of the database.
     - `title` (array): Title of the database as a rich text array.
     - `properties` (object): Property schema of the database.
   - Returns: Information about the created database.

8. `notion_query_database`

   - Query a database.
   - Required inputs:
     - `database_id` (string): The ID of the database to query.
   - Optional inputs:
     - `filter` (object): Filter conditions.
     - `sorts` (array): Sorting conditions.
     - `start_cursor` (string): Cursor for the next page of results.
     - `page_size` (number, default: 100, max: 100): Number of results to retrieve.
   - Returns: List of results from the query.

9. `notion_retrieve_database`

   - Retrieve information about a specific database.
   - Required inputs:
     - `database_id` (string): The ID of the database to retrieve.
   - Returns: Detailed information about the database.

10. `notion_update_database`
    - Update information about a database.
    - Required inputs:
      - `database_id` (string): The ID of the database to update.
    - Optional inputs:
      - `title` (array): New title for the database.
      - `description` (array): New description for the database.
      - `properties` (object): Updated property schema.
    - Returns: Information about the updated database.

## Setup

1. **Create a Notion Integration**:

   - Visit the [Notion Your Integrations page](https://www.notion.so/profile/integrations).
   - Click "New Integration".
   - Name your integration and select appropriate permissions (e.g., "Read content", "Update content").

2. **Retrieve the Secret Key**:

   - Copy the "Internal Integration Token" from your integration.
   - This token will be used for authentication.

3. **Add the Integration to Your Workspace**:

   - Open the page or database you want the integration to access in Notion.
   - Click the navigation button in the top right corner.
   - Click "Connect to" button and select your integration.

4. **Configure Claude Desktop**:
   Add the following to your `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "notion": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-notion"],
         "env": {
           "NOTION_API_TOKEN": "your-integration-token"
         }
       }
     }
   }
   ```

## Troubleshooting

If you encounter permission errors:

1. Ensure the integration has the required permissions.
2. Verify that the integration is invited to the relevant pages or databases.
3. Confirm the token and configuration are correctly set in `claude_desktop_config.json`.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
