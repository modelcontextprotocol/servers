import { MCPServer } from '@modelcontextprotocol/typescript-sdk';
import { ClientSecretCredential } from '@azure/identity';
import { NotebookManagement } from './functions/notebooks';
import { SectionManagement } from './functions/sections';
import { PageManagement } from './functions/pages';
import { ContentManagement } from './functions/content';

/**
 * OneNoteMCPServer implements the Model Context Protocol server for Microsoft OneNote
 * providing functionality to interact with notebooks, sections, and pages through
 * the Microsoft Graph API.
 * 
 * @class OneNoteMCPServer
 * @extends {MCPServer}
 */
export class OneNoteMCPServer extends MCPServer {
  private credential: ClientSecretCredential;

  /**
   * Creates an instance of OneNoteMCPServer.
   * Requires Azure AD credentials to be set in environment variables:
   * - AZURE_TENANT_ID
   * - AZURE_CLIENT_ID
   * - AZURE_CLIENT_SECRET
   * 
   * @throws {Error} If required environment variables are not set
   */
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

    // Register function groups
    this.registerFunctions(new NotebookManagement(this.credential));
    this.registerFunctions(new SectionManagement(this.credential));
    this.registerFunctions(new PageManagement(this.credential));
    this.registerFunctions(new ContentManagement(this.credential));
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new OneNoteMCPServer();
  server.start();
}