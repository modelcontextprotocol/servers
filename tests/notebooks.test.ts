import { NotebookManagement } from '../src/functions/notebooks';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

jest.mock('@microsoft/microsoft-graph-client');
jest.mock('@azure/identity');

describe('NotebookManagement', () => {
  let notebookManager: NotebookManagement;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    process.env.AZURE_TENANT_ID = 'test-tenant';
    process.env.AZURE_CLIENT_ID = 'test-client';
    process.env.AZURE_CLIENT_SECRET = 'test-secret';

    mockClient = {
      api: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<Client>;

    (Client.init as jest.Mock).mockReturnValue(mockClient);

    const mockCredential = {
      getToken: jest.fn().mockResolvedValue({ token: 'test-token' })
    };

    notebookManager = new NotebookManagement(mockCredential as TokenCredential);
  });

  describe('listNotebooks', () => {
    it('should list all notebooks', async () => {
      const mockNotebooks = {
        value: [
          {
            id: '1',
            displayName: 'Test Notebook',
            createdDateTime: '2024-01-01',
            lastModifiedDateTime: '2024-01-02',
            sectionsUrl: 'https://example.com/sections'
          }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockNotebooks);

      const result = await notebookManager.listNotebooks();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '1',
        name: 'Test Notebook',
        createdTime: '2024-01-01',
        lastModifiedTime: '2024-01-02',
        sectionsUrl: 'https://example.com/sections'
      });
    });

    it('should handle errors gracefully', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('API Error'));

      await expect(notebookManager.listNotebooks())
        .rejects
        .toThrow('Failed to list notebooks: API Error');
    });
  });

  describe('createNotebook', () => {
    it('should create a notebook', async () => {
      const mockNotebook = {
        id: '1',
        displayName: 'New Notebook',
        createdDateTime: '2024-01-01',
        lastModifiedDateTime: '2024-01-01',
        sectionsUrl: 'https://example.com/sections'
      };

      mockClient.post.mockResolvedValueOnce(mockNotebook);

      const result = await notebookManager.createNotebook({
        name: 'New Notebook'
      });

      expect(result).toEqual({
        id: '1',
        name: 'New Notebook',
        createdTime: '2024-01-01',
        lastModifiedTime: '2024-01-01',
        sectionsUrl: 'https://example.com/sections'
      });
    });
  });
});