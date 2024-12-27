import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

export class ExcelWorksheetManagement implements MCPFunctionGroup {
  private client: Client;

  constructor(credential: TokenCredential) {
    this.client = Client.init({
      authProvider: async (done) => {
        try {
          const token = await credential.getToken('https://graph.microsoft.com/.default');
          done(null, token?.token || '');
        } catch (error) {
          done(error as Error, '');
        }
      }
    });
  }

  @MCPFunction({
    description: 'Get worksheet data',
    parameters: {
      type: 'object',
      properties: {
        workbookId: { type: 'string', description: 'Workbook ID' },
        worksheetName: { type: 'string', description: 'Worksheet name' },
        range: { type: 'string', description: 'Cell range (e.g., "A1:D10")' }
      },
      required: ['workbookId', 'worksheetName']
    }
  })
  async getWorksheetData({ workbookId, worksheetName, range }: {
    workbookId: string;
    worksheetName: string;
    range?: string;
  }): Promise<any[][]> {
    try {
      let endpoint = `/me/drive/items/${workbookId}/workbook/worksheets/${worksheetName}`;
      if (range) {
        endpoint += `/range(address='${range}')`;
      } else {
        endpoint += '/usedRange';
      }

      const response = await this.client
        .api(endpoint)
        .get();

      return response.values;
    } catch (error) {
      throw new Error(`Failed to get worksheet data: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Update worksheet data',
    parameters: {
      type: 'object',
      properties: {
        workbookId: { type: 'string', description: 'Workbook ID' },
        worksheetName: { type: 'string', description: 'Worksheet name' },
        range: { type: 'string', description: 'Cell range to update' },
        values: { type: 'array', description: 'Data to write' }
      },
      required: ['workbookId', 'worksheetName', 'range', 'values']
    }
  })
  async updateWorksheetData({ workbookId, worksheetName, range, values }: {
    workbookId: string;
    worksheetName: string;
    range: string;
    values: any[][];
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${workbookId}/workbook/worksheets/${worksheetName}/range(address='${range}')`)
        .patch({
          values
        });
    } catch (error) {
      throw new Error(`Failed to update worksheet data: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Add new worksheet',
    parameters: {
      type: 'object',
      properties: {
        workbookId: { type: 'string', description: 'Workbook ID' },
        name: { type: 'string', description: 'New worksheet name' }
      },
      required: ['workbookId', 'name']
    }
  })
  async addWorksheet({ workbookId, name }: {
    workbookId: string;
    name: string;
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${workbookId}/workbook/worksheets`)
        .post({
          name
        });
    } catch (error) {
      throw new Error(`Failed to add worksheet: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete worksheet',
    parameters: {
      type: 'object',
      properties: {
        workbookId: { type: 'string', description: 'Workbook ID' },
        worksheetName: { type: 'string', description: 'Worksheet name' }
      },
      required: ['workbookId', 'worksheetName']
    }
  })
  async deleteWorksheet({ workbookId, worksheetName }: {
    workbookId: string;
    worksheetName: string;
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${workbookId}/workbook/worksheets/${worksheetName}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete worksheet: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create Excel table',
    parameters: {
      type: 'object',
      properties: {
        workbookId: { type: 'string', description: 'Workbook ID' },
        worksheetName: { type: 'string', description: 'Worksheet name' },
        range: { type: 'string', description: 'Range for table' },
        hasHeaders: { type: 'boolean', description: 'Whether first row contains headers' }
      },
      required: ['workbookId', 'worksheetName', 'range']
    }
  })
  async createTable({ workbookId, worksheetName, range, hasHeaders = true }: {
    workbookId: string;
    worksheetName: string;
    range: string;
    hasHeaders?: boolean;
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${workbookId}/workbook/worksheets/${worksheetName}/tables/add`)
        .post({
          address: range,
          hasHeaders
        });
    } catch (error) {
      throw new Error(`Failed to create table: ${error.message}`);
    }
  }
}