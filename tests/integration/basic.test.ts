import { OneNoteMCPServer } from '../../src';

describe('OneNote MCP Server Integration', () => {
  let server: OneNoteMCPServer;

  beforeAll(() => {
    process.env.AZURE_TENANT_ID = process.env.TEST_AZURE_TENANT_ID;
    process.env.AZURE_CLIENT_ID = process.env.TEST_AZURE_CLIENT_ID;
    process.env.AZURE_CLIENT_SECRET = process.env.TEST_AZURE_CLIENT_SECRET;
  });

  beforeEach(() => {
    server = new OneNoteMCPServer();
  });

  describe('End-to-End Workflow', () => {
    it('should perform a complete notebook workflow', async () => {
      // Create a notebook
      const notebook = await server.notebooks.createNotebook({
        name: `Test Notebook ${Date.now()}`,
        sectionName: 'Test Section'
      });

      // Create a page
      const page = await server.pages.createPage({
        title: 'Test Page',
        content: '<h1>Test Content</h1>',
        sectionId: notebook.sectionsUrl.split('/').pop()!
      });

      // Update page
      await server.pages.updatePage({
        id: page.id,
        content: '<h1>Updated Content</h1>'
      });

      // Search pages
      const searchResults = await server.pages.searchPages({
        query: 'Updated Content',
        notebookId: notebook.id
      });

      expect(searchResults.length).toBeGreaterThan(0);

      // Cleanup
      await server.pages.deletePage({ id: page.id });
      await server.notebooks.deleteNotebook({ id: notebook.id });
    });
  });
});