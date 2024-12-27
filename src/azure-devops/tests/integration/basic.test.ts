import { AzureDevOpsMCPServer } from '../../index';

describe('Azure DevOps MCP Server Integration', () => {
  let server: AzureDevOpsMCPServer;

  beforeAll(() => {
    // These would typically be set in the environment or a .env file
    process.env.AZURE_DEVOPS_ORG_URL = process.env.TEST_AZURE_DEVOPS_ORG_URL;
    process.env.AZURE_PERSONAL_ACCESS_TOKEN = process.env.TEST_AZURE_PERSONAL_ACCESS_TOKEN;
  });

  beforeEach(() => {
    server = new AzureDevOpsMCPServer();
  });

  it('should initialize without errors', () => {
    expect(server).toBeInstanceOf(AzureDevOpsMCPServer);
  });

  describe('when credentials are not provided', () => {
    beforeEach(() => {
      delete process.env.AZURE_DEVOPS_ORG_URL;
      delete process.env.AZURE_PERSONAL_ACCESS_TOKEN;
    });

    it('should throw an error', () => {
      expect(() => new AzureDevOpsMCPServer()).toThrow();
    });
  });

  describe('Work Items', () => {
    it('should create and retrieve work items', async () => {
      const workItemTitle = `Test Item ${Date.now()}`;
      
      // Create work item
      const created = await server.workItems.createWorkItem({
        project: process.env.TEST_PROJECT_NAME || 'Test Project',
        type: 'Task',
        title: workItemTitle,
        description: 'Test description'
      });

      expect(created.title).toBe(workItemTitle);

      // Retrieve work item
      const retrieved = await server.workItems.getWorkItem({ id: created.id });
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.title).toBe(workItemTitle);
    });
  });

  describe('Projects', () => {
    it('should list projects', async () => {
      const projects = await server.projects.listProjects();
      expect(Array.isArray(projects)).toBe(true);
    });
  });

  describe('Repositories', () => {
    it('should list repositories in a project', async () => {
      const repos = await server.repositories.listRepositories({
        project: process.env.TEST_PROJECT_NAME || 'Test Project'
      });
      expect(Array.isArray(repos)).toBe(true);
    });
  });
});