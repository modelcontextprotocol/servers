import { WordDocumentManagement } from '../src/functions/word/documents';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

jest.mock('@microsoft/microsoft-graph-client');
jest.mock('@azure/identity');

describe('WordDocumentManagement', () => {
  let documentManager: WordDocumentManagement;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    mockClient = {
      api: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<Client>;

    (Client.init as jest.Mock).mockReturnValue(mockClient);

    const mockCredential = {
      getToken: jest.fn().mockResolvedValue({ token: 'test-token' })
    };

    documentManager = new WordDocumentManagement(mockCredential as TokenCredential);
  });

  describe('listDocuments', () => {
    it('should list documents', async () => {
      const mockDocuments = {
        value: [
          {
            id: '1',
            name: 'test.docx',
            createdDateTime: '2024-01-01',
            lastModifiedDateTime: '2024-01-02',
            webUrl: 'https://example.com'
          }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockDocuments);

      const result = await documentManager.listDocuments();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.docx');
    });

    it('should handle listing errors', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('API Error'));
      await expect(documentManager.listDocuments()).rejects.toThrow('Failed to list documents');
    });
  });

  describe('createDocument', () => {
    it('should create document', async () => {
      const mockDoc = {
        id: '1',
        name: 'test.docx',
        createdDateTime: '2024-01-01',
        lastModifiedDateTime: '2024-01-01',
        webUrl: 'https://example.com'
      };

      mockClient.post.mockResolvedValueOnce(mockDoc);

      const result = await documentManager.createDocument({
        name: 'test.docx'
      });

      expect(result.id).toBe('1');
      expect(result.name).toBe('test.docx');
    });
  });

  describe('getDocument', () => {
    it('should get document with content', async () => {
      const mockDoc = {
        id: '1',
        name: 'test.docx',
        createdDateTime: '2024-01-01',
        lastModifiedDateTime: '2024-01-01',
        webUrl: 'https://example.com'
      };

      mockClient.get
        .mockResolvedValueOnce(mockDoc)
        .mockResolvedValueOnce('document content');

      const result = await documentManager.getDocument({ id: '1' });
      expect(result.content).toBe('document content');
    });
  });

  describe('deleteDocument', () => {
    it('should delete document', async () => {
      await documentManager.deleteDocument({ id: '1' });
      expect(mockClient.delete).toHaveBeenCalled();
    });
  });
});