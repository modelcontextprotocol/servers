import { MCPServer } from '@modelcontextprotocol/typescript-sdk';
import { ClientSecretCredential } from '@azure/identity';
import { NotebookManagement } from './functions/notebooks';
import { SectionManagement } from './functions/sections';
import { PageManagement } from './functions/pages';

export class OneNoteMCPServer extends MCPServer {
  private credential: ClientSecretCredential;

  constructor() {
    super();

    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Azure credentials must be provided via environment variables');
    }

    this.credential = new ClientSecretCredential(
      tenantId,
      clientId,
      clientSecret
    );

    this.registerFunctions(new NotebookManagement(this.credential));
    this.registerFunctions(new SectionManagement(this.credential));
    this.registerFunctions(new PageManagement(this.credential));
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new OneNoteMCPServer();
  server.start();
}