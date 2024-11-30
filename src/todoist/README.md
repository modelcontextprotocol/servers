# Todoist MCP Server

MCP Server for the Todoist API, enabling Claude to interact with Todoist tasks and projects.

## Tools

1. `todoist_create_task`
    - Create a new task in Todoist
    - Required inputs:
        - `content` (string): The content of the task
        - `project_id` (string, optional): Project to add task to
        - `due_string` (string, optional): Natural language due date (e.g., "tomorrow", "next Monday")
    - Returns: Information about the created task

2. `todoist_complete_task`
    - Mark a task as completed
    - Required inputs:
        - `task_id` (string): ID of the task to complete
    - Returns: Operation status

3. `todoist_list_tasks`
    - Get a list of active tasks
    - Optional inputs:
        - `project_id` (string): Filter tasks by project
        - `section_id` (string): Filter tasks by section
    - Returns: Array of task objects

4. `todoist_get_projects`
    - Get list of all projects
    - No required inputs
    - Returns: Array of project objects

5. `todoist_create_project`
    - Create a new project
    - Required inputs:
        - `name` (string): Name of the project
        - `color` (string, optional): Color of the project
    - Returns: Created project information

## Setup

Requires a Todoist API token set as the environment variable `TODOIST_API_TOKEN`. Get your API token from Todoist Settings -> Integrations -> Developer.

## Configuration

Example configuration for Claude Desktop:

```json
{
  "mcpServers": {
    "todoist": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-todoist"],
      "env": {
        "TODOIST_API_TOKEN": "${TODOIST_API_TOKEN}"
      }
    }
  }
}