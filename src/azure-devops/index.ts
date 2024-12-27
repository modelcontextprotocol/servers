import { MCPServer } from '@modelcontextprotocol/typescript-sdk';
import { WorkItemManagement } from './functions/workItems';
import { ProjectManagement } from './functions/projects';
import { RepositoryManagement } from './functions/repositories';

export class AzureDevOpsMCPServer extends MCPServer {
  constructor() {
    super();
    
    // Register function groups
    this.registerFunctions(new WorkItemManagement());
    this.registerFunctions(new ProjectManagement());
    this.registerFunctions(new RepositoryManagement());
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new AzureDevOpsMCPServer();
  server.start();
}