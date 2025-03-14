# MCP Server for GitHub Projects

An MCP (Model Context Protocol) server for interacting with the GitHub Projects V2 API.

## Description

This MCP server allows language models to interact with GitHub Projects V2 through a set of tools that provide create, read, update, and delete (CRUD) operations for projects and their associated resources such as items, fields, and views.

## Features

### Project Operations
- List projects for a user or organization
- Get details of a specific project
- Create a new project
- Update an existing project
- Delete a project

### Item Operations
- List items in a project
- Add an issue or pull request to a project
- Create a draft item
- Remove an item from a project
- Get details of a specific item

### Field Operations
- List fields in a project
- Create a new custom field
- Update a field value for an item
- Delete a custom field

### View Operations
- List views of a project
- Create a new view
- Update an existing view
- Delete a view

## Prerequisites

- Node.js (version 18 or higher)
- GitHub personal access token with `repo` and `project` scopes

## Installation

```bash
npm install @modelcontextprotocol/server-github-projects
```

## Configuration

Set the `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable with your GitHub personal access token:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
```

## Usage

### As a module

```javascript
import { startServer } from '@modelcontextprotocol/server-github-projects';

startServer();
```

### As an executable

```bash
npx mcp-server-github-projects
```

## Example Usage

Here's an example of how to use this server with an MCP-based AI platform:

```
# List projects for a user
mcp__list_projects(owner="octocat", type="user")

# Create a new project
mcp__create_project(owner="my-org", title="My New Project", type="organization", description="A project to manage tasks")

# Add an item to the project
mcp__add_project_item(project_id="PVT_kwHOA...", content_id="I_kwDOA...")

# Create a single select custom field
mcp__create_project_field(project_id="PVT_kwHOA...", name="Status", dataType="SINGLE_SELECT", options=["In progress", "Completed", "Blocked"])

# Update a field value for an item
mcp__update_project_field_value(project_id="PVT_kwHOA...", item_id="PVTI_lADOA...", field_id="PVTF_lADOA...", value={optionId: "PVTFO_lADOA..."})
```

## Limitations

- This server uses the GitHub GraphQL API for Projects V2, which requires a personal access token with appropriate scopes.
- Some advanced view customization operations, such as complex filter configuration, may not be available in this version.

## Additional Resources

- [GitHub Projects V2 Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [MCP (Model Context Protocol) Documentation](https://modelcontextprotocol.ai)

## License

MIT 