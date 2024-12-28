import { MCPServer } from '@modelcontextprotocol/typescript-sdk';
import { ClientSecretCredential } from '@azure/identity';
import { WordDocumentManagement } from './functions/word/documents';
import { ExcelWorkbookManagement } from './functions/excel/workbooks';
import { ExcelWorksheetManagement } from './functions/excel/worksheets';
import { PowerPointPresentationManagement } from './functions/powerpoint/presentations';
import { PowerPointSlideManagement } from './functions/powerpoint/slides';
import { SharePointSiteManagement } from './functions/sharepoint/sites';
import { SharePointListManagement } from './functions/sharepoint/lists';

export class Office365MCPServer extends MCPServer {
  private credential: ClientSecretCredential;

  constructor() {
    super();

    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Azure credentials must be provided via environment variables');
    }

    this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

    // Register all function groups
    this.registerFunctions(new WordDocumentManagement(this.credential));
    this.registerFunctions(new ExcelWorkbookManagement(this.credential));
    this.registerFunctions(new ExcelWorksheetManagement(this.credential));
    this.registerFunctions(new PowerPointPresentationManagement(this.credential));
    this.registerFunctions(new PowerPointSlideManagement(this.credential));
    this.registerFunctions(new SharePointSiteManagement(this.credential));
    this.registerFunctions(new SharePointListManagement(this.credential));
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new Office365MCPServer();
  server.start();
}