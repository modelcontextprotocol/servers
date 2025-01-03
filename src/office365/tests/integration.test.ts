import { Office365MCPServer } from '../src';

describe('Office365 MCP Server Integration', () => {
  let server: Office365MCPServer;

  beforeAll(() => {
    process.env.AZURE_TENANT_ID = process.env.TEST_AZURE_TENANT_ID;
    process.env.AZURE_CLIENT_ID = process.env.TEST_AZURE_CLIENT_ID;
    process.env.AZURE_CLIENT_SECRET = process.env.TEST_AZURE_CLIENT_SECRET;
  });

  beforeEach(() => {
    server = new Office365MCPServer();
  });

  describe('Word Integration', () => {
    it('should handle document operations', async () => {
      const doc = await server.word.createDocument({
        name: `Test Document ${Date.now()}`
      });

      await server.word.updateDocument({
        id: doc.id,
        content: '<h1>Test Content</h1>'
      });

      const docContent = await server.word.getDocument({ id: doc.id });
      expect(docContent.content).toContain('Test Content');

      await server.word.deleteDocument({ id: doc.id });
    });
  });

  describe('Excel Integration', () => {
    it('should handle workbook operations', async () => {
      const workbook = await server.excel.createWorkbook({
        name: `Test Workbook ${Date.now()}`
      });

      await server.excel.updateWorksheetData({
        workbookId: workbook.id,
        worksheetName: 'Sheet1',
        range: 'A1:B2',
        values: [['Test', 'Data'], [1, 2]]
      });

      const data = await server.excel.getWorksheetData({
        workbookId: workbook.id,
        worksheetName: 'Sheet1',
        range: 'A1:B2'
      });

      expect(data[0][0]).toBe('Test');
      await server.excel.deleteWorkbook({ id: workbook.id });
    });
  });

  describe('PowerPoint Integration', () => {
    it('should handle presentation operations', async () => {
      const presentation = await server.powerpoint.createPresentation({
        name: `Test Presentation ${Date.now()}`
      });

      await server.powerpoint.addSlide({ presentationId: presentation.id });
      const slides = await server.powerpoint.listSlides({ presentationId: presentation.id });
      expect(slides.length).toBeGreaterThan(0);

      await server.powerpoint.deletePresentation({ id: presentation.id });
    });
  });

  describe('SharePoint Integration', () => {
    it('should handle site and list operations', async () => {
      const sites = await server.sharepoint.listSites();
      expect(Array.isArray(sites)).toBe(true);

      if (sites.length > 0) {
        const lists = await server.sharepoint.getLists({ siteId: sites[0].id });
        expect(Array.isArray(lists)).toBe(true);
      }
    });
  });
});