import { AzureDevOpsMCPServer } from '../src';

describe('AzureDevOpsMCPServer', () => {
  let server: AzureDevOpsMCPServer;

  beforeEach(() => {
    process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/testorg';
    process.env.AZURE_PERSONAL_ACCESS_TOKEN = 'test-token';
    server = new AzureDevOpsMCPServer();
  });

  it('should initialize without errors', () => {
    expect(server).toBeInstanceOf(AzureDevOpsMCPServer);
  });

  // Add more tests for each function group
});