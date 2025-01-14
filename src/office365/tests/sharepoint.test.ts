import { SharePointSiteManagement } from '../src/functions/sharepoint/sites';
import { SharePointListManagement } from '../src/functions/sharepoint/lists';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

jest.mock('@microsoft/microsoft-graph-client');
jest.mock('@azure/identity');

describe('SharePoint Management', () => {
  let siteManager: SharePointSiteManagement;
  let listManager: SharePointListManagement;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    mockClient = {
      api: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<Client>;

    (Client.init as jest.Mock).mockReturnValue(mockClient);

    const mockCredential = {
      getToken: jest.fn().mockResolvedValue({ token: 'test-token' })
    };

    siteManager = new SharePointSiteManagement(mockCredential as TokenCredential);
    listManager = new SharePointListManagement(mockCredential as TokenCredential);
  });

  describe('SiteManagement', () => {
    it('should list sites', async () => {
      const mockSites = {
        value: [
          {
            id: '1',
            displayName: 'Test Site',
            webUrl: 'https://example.sharepoint.com/sites/test',
            description: 'Test description'
          }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockSites);

      const result = await siteManager.listSites();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Site');
    });

    it('should create site', async () => {
      const mockSite = {
        id: '1',
        displayName: 'New Site',
        webUrl: 'https://example.sharepoint.com/sites/new',
        description: 'New site description'
      };

      mockClient.post.mockResolvedValueOnce(mockSite);

      const result = await siteManager.createSite({
        name: 'New Site',
        description: 'New site description',
        isPublic: true
      });

      expect(result.id).toBe('1');
      expect(mockClient.post).toHaveBeenCalledWith({
        displayName: 'New Site',
        description: 'New site description',
        isPublic: true
      });
    });

    it('should search sites', async () => {
      const mockResults = {
        value: [
          {
            id: '1',
            displayName: 'Test Site',
            webUrl: 'https://example.sharepoint.com/sites/test',
            description: 'Test description'
          }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockResults);

      const result = await siteManager.searchSites({ query: 'test' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Site');
    });
  });

  describe('ListManagement', () => {
    it('should get lists', async () => {
      const mockLists = {
        value: [
          { id: '1', displayName: 'Test List' },
          { id: '2', displayName: 'Another List' }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockLists);

      const result = await listManager.getLists({ siteId: '1' });
      expect(result).toHaveLength(2);
    });

    it('should create list with columns', async () => {
      const mockList = {
        id: '1',
        displayName: 'New List'
      };

      mockClient.post.mockResolvedValueOnce(mockList);

      const columns = [
        { name: 'Title', type: 'text' },
        { name: 'Description', type: 'note' }
      ];

      const result = await listManager.createList({
        siteId: '1',
        name: 'New List',
        columns
      });

      expect(result).toEqual(mockList);
      expect(mockClient.post).toHaveBeenCalledWith({
        displayName: 'New List',
        columns
      });
    });

    it('should get list items', async () => {
      const mockItems = {
        value: [
          { id: '1', fields: { Title: 'Item 1' } },
          { id: '2', fields: { Title: 'Item 2' } }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockItems);

      const result = await listManager.getItems({
        siteId: '1',
        listId: '1'
      });

      expect(result).toHaveLength(2);
    });

    it('should update list item', async () => {
      const fields = { Title: 'Updated Title' };

      await listManager.updateItem({
        siteId: '1',
        listId: '1',
        itemId: '1',
        fields
      });

      expect(mockClient.patch).toHaveBeenCalledWith(fields);
    });
  });
});