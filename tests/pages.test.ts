import { PageManagement } from '../src/functions/pages';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

jest.mock('@microsoft/microsoft-graph-client');
jest.mock('@azure/identity');

describe('PageManagement', () => {
  let pageManager: PageManagement;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    mockClient = {
      api: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      header: jest.fn().mockReturnThis(),
      search: jest.fn().mockReturnThis()
    } as unknown as jest.Mocked<Client>;

    (Client.init as jest.Mock).mockReturnValue(mockClient);

    const mockCredential = {
      getToken: jest.fn().mockResolvedValue({ token: 'test-token' })
    };

    pageManager = new PageManagement(mockCredential as TokenCredential);
  });

  describe('createPage', () => {
    it('should create a page', async () => {
      const mockPage = {
        id: '1',
        title: 'Test Page',
        createdDateTime: '2024-01-01',
        lastModifiedDateTime: '2024-01-01',
        contentUrl: 'https://example.com/content'
      };

      mockClient.post.mockResolvedValueOnce(mockPage);

      const result = await pageManager.createPage({
        title: 'Test Page',
        content: '<p>Test content</p>',
        sectionId: 'section-1'
      });

      expect(result).toEqual({
        id: '1',
        title: 'Test Page',
        createdTime: '2024-01-01',
        lastModifiedTime: '2024-01-01',
        contentUrl: 'https://example.com/content'
      });
      expect(mockClient.header).toHaveBeenCalledWith('Content-Type', 'application/xhtml+xml');
    });
  });

  describe('searchPages', () => {
    it('should search pages', async () => {
      const mockPages = {
        value: [
          {
            id: '1',
            title: 'Test Page',
            createdDateTime: '2024-01-01',
            lastModifiedDateTime: '2024-01-01',
            contentUrl: 'https://example.com/content'
          }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockPages);

      const result = await pageManager.searchPages({
        query: 'test'
      });

      expect(result).toHaveLength(1);
      expect(mockClient.search).toHaveBeenCalledWith('test');
    });
  });
});