import { ExcelWorkbookManagement } from '../src/functions/excel/workbooks';
import { ExcelWorksheetManagement } from '../src/functions/excel/worksheets';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

jest.mock('@microsoft/microsoft-graph-client');
jest.mock('@azure/identity');

describe('Excel Management', () => {
  let workbookManager: ExcelWorkbookManagement;
  let worksheetManager: ExcelWorksheetManagement;
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

    workbookManager = new ExcelWorkbookManagement(mockCredential as TokenCredential);
    worksheetManager = new ExcelWorksheetManagement(mockCredential as TokenCredential);
  });

  describe('WorkbookManagement', () => {
    it('should list workbooks', async () => {
      const mockWorkbooks = {
        value: [
          {
            id: '1',
            name: 'test.xlsx',
            createdDateTime: '2024-01-01',
            lastModifiedDateTime: '2024-01-02',
            webUrl: 'https://example.com'
          }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockWorkbooks);

      const result = await workbookManager.listWorkbooks();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.xlsx');
    });

    it('should create workbook', async () => {
      const mockWorkbook = {
        id: '1',
        name: 'test.xlsx',
        createdDateTime: '2024-01-01',
        lastModifiedDateTime: '2024-01-01',
        webUrl: 'https://example.com'
      };

      mockClient.post.mockResolvedValueOnce(mockWorkbook);

      const result = await workbookManager.createWorkbook({
        name: 'test.xlsx'
      });

      expect(result.id).toBe('1');
    });
  });

  describe('WorksheetManagement', () => {
    it('should get worksheet data', async () => {
      const mockData = {
        values: [
          ['A1', 'B1'],
          ['A2', 'B2']
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockData);

      const result = await worksheetManager.getWorksheetData({
        workbookId: '1',
        worksheetName: 'Sheet1',
        range: 'A1:B2'
      });

      expect(result).toEqual(mockData.values);
    });

    it('should update worksheet data', async () => {
      const values = [['Updated', 'Data']];
      
      await worksheetManager.updateWorksheetData({
        workbookId: '1',
        worksheetName: 'Sheet1',
        range: 'A1:B1',
        values
      });

      expect(mockClient.patch).toHaveBeenCalledWith({ values });
    });

    it('should create table', async () => {
      await worksheetManager.createTable({
        workbookId: '1',
        worksheetName: 'Sheet1',
        range: 'A1:B2'
      });

      expect(mockClient.post).toHaveBeenCalledWith({
        address: 'A1:B2',
        hasHeaders: true
      });
    });
  });
});