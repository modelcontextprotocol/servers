import { AzureDevOpsMCPServer } from '../index';

async function main() {
  // Initialize the server
  const server = new AzureDevOpsMCPServer();

  try {
    // List all projects
    const projects = await server.projects.listProjects();
    console.log('Projects:', projects);

    // Create a work item
    const workItem = await server.workItems.createWorkItem({
      project: 'Your Project Name',
      type: 'Task',
      title: 'Example Task',
      description: 'This is an example task created through the MCP server'
    });
    console.log('Created Work Item:', workItem);

    // List repositories
    const repos = await server.repositories.listRepositories({
      project: 'Your Project Name'
    });
    console.log('Repositories:', repos);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the example if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}