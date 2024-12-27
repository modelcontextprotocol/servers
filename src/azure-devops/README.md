# Azure DevOps MCP Server

A Model Context Protocol (MCP) server implementation for Azure DevOps, enabling AI language models to interact with Azure DevOps services through a standardized interface.

## Features

### Work Item Management
- Create, read, and update work items
- Track bugs, tasks, and user stories
- Manage work item states

### Project Management
- List and view projects
- Create new projects
- Delete existing projects

### Repository Management
- List repositories in projects
- Create and delete repositories
- Manage repository branches

## Installation

```bash
npm install @modelcontextprotocol/server-azure-devops
```

## Configuration

Set the following environment variables:
- `AZURE_DEVOPS_ORG_URL`: Your Azure DevOps organization URL (e.g., https://dev.azure.com/yourorg)
- `AZURE_PERSONAL_ACCESS_TOKEN`: Your Azure DevOps Personal Access Token

## Using with MCP Client

Add this to your MCP client configuration (e.g. Claude Desktop):

```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-azure-devops"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/yourorg",
        "AZURE_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
```

## API Documentation

### Work Items

#### Get Work Item
```typescript
getWorkItem({ id: number }): Promise<WorkItem>
```
Retrieves a work item by its ID.

#### Create Work Item
```typescript
createWorkItem({ 
  project: string, 
  type: string, 
  title: string, 
  description?: string 
}): Promise<WorkItem>
```
Creates a new work item in the specified project.

#### Update Work Item
```typescript
updateWorkItem({ 
  id: number,
  title?: string,
  state?: string,
  description?: string 
}): Promise<WorkItem>
```
Updates an existing work item.

### Projects

#### List Projects
```typescript
listProjects(): Promise<Project[]>
```
Lists all accessible projects.

#### Get Project
```typescript
getProject({ name: string }): Promise<Project>
```
Gets details of a specific project.

### Repositories

#### List Repositories
```typescript
listRepositories({ project: string }): Promise<Repository[]>
```
Lists all repositories in a project.

#### Create Repository
```typescript
createRepository({ 
  project: string, 
  name: string 
}): Promise<Repository>
```
Creates a new repository in the specified project.

## Examples

### Managing Work Items
```typescript
// Get a work item
const workItem = await azure.getWorkItem({ id: 123 });

// Create a new task
const newTask = await azure.createWorkItem({
  project: 'MyProject',
  type: 'Task',
  title: 'Implement feature X',
  description: 'Implementation details...'
});

// Update work item state
const updatedItem = await azure.updateWorkItem({
  id: 123,
  state: 'Active'
});
```

### Managing Projects
```typescript
// List all projects
const projects = await azure.listProjects();

// Get specific project
const project = await azure.getProject({ name: 'MyProject' });
```

### Managing Repositories
```typescript
// List repositories
const repos = await azure.listRepositories({ project: 'MyProject' });

// Create new repository
const newRepo = await azure.createRepository({
  project: 'MyProject',
  name: 'new-service'
});
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Lint
npm run lint
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for information about contributing to this repository.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.