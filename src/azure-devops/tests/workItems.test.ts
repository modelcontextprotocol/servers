import { WorkItemManagement } from '../functions/workItems';
import * as azdev from 'azure-devops-node-api';

jest.mock('azure-devops-node-api');

describe('WorkItemManagement', () => {
  let workItemManager: WorkItemManagement;
  
  beforeEach(() => {
    process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test';
    process.env.AZURE_PERSONAL_ACCESS_TOKEN = 'test-token';
    workItemManager = new WorkItemManagement();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getWorkItem', () => {
    it('should retrieve work item by ID', async () => {
      const mockWorkItem = {
        id: 1,
        fields: {
          'System.Title': 'Test Work Item',
          'System.State': 'Active',
          'System.WorkItemType': 'Task',
          'System.Description': 'Test Description'
        }
      };

      const mockClient = {
        getWorkItem: jest.fn().mockResolvedValue(mockWorkItem)
      };

      (azdev.WebApi as jest.Mock).mockImplementation(() => ({
        getWorkItemTrackingApi: () => mockClient
      }));

      const result = await workItemManager.getWorkItem({ id: 1 });

      expect(result).toEqual({
        id: 1,
        title: 'Test Work Item',
        state: 'Active',
        type: 'Task',
        description: 'Test Description'
      });
    });
  });
});