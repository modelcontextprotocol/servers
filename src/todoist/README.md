# Todoist MCP Server

An MCP server implementation that integrates with Todoist API, providing comprehensive task management capabilities through natural language interactions.

## Features

- **Task Management**: Create, read, update, and delete tasks with natural language
- **Smart Task Search**: Find and modify tasks using partial name matches
- **Flexible Filtering**: Filter tasks by due date, priority, and project
- **Natural Language Dates**: Use human-readable date formats like "tomorrow", "next Monday"
- **Priority Levels**: Support for Todoist's 4-level priority system

## Tools

- **todoist_create_task**
  - Create new tasks with optional details
  - Inputs:
    - `content` (string): The content/title of the task
    - `description` (string, optional): Detailed task description
    - `due_string` (string, optional): Natural language due date
    - `priority` (number, optional): Priority level (1-4)

- **todoist_get_tasks**
  - Retrieve and filter tasks
  - Inputs:
    - `filter` (string, optional): Natural language filter (e.g., "today", "overdue")
    - `priority` (number, optional): Filter by priority (1-4)
    - `project_id` (string, optional): Filter by project
    - `limit` (number, optional): Maximum results to return

- **todoist_update_task**
  - Update existing tasks using natural language search
  - Inputs:
    - `task_name` (string): Task to search for and update
    - `content` (string, optional): New task title
    - `description` (string, optional): New description
    - `due_string` (string, optional): New due date
    - `priority` (number, optional): New priority level

- **todoist_delete_task**
  - Remove tasks using natural language search
  - Inputs:
    - `task_name` (string): Task to search for and delete

## Configuration

### Getting an API Token
1. Log in to your Todoist account
2. Go to Settings → Integrations
3. Find your API token under "Developer"

### Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "todoist": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-todoist"
      ],
      "env": {
        "TODOIST_API_TOKEN": "YOUR_API_TOKEN_HERE"
      }
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.