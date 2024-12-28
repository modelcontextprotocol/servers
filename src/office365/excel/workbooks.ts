import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import { ExcelWorkbook } from '../../types';

export class ExcelWorkbookManagement implements MCPFunctionGroup {
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
    description: 'List Excel workbooks',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Optional folder ID' }
      }
    }
  })
  async listWorkbooks({ folderId }: { folderId?: string } = {}): Promise<ExcelWorkbook[]> {
    try {
      let endpoint = '/me/drive/root/search(q=\'.xlsx\')';
      if (folderId) {
        endpoint = `/me/drive/items/${folderId}/children?$filter=endswith(name,'.xlsx')`;
      }

      const response = await this.client
        .api(endpoint)
        .select('id,name,createdDateTime,lastModifiedDateTime,webUrl')
        .get();

      return response.value.map((wb: any) => ({
        id: wb.id,
        name: wb.name,
        createdDateTime: wb.createdDateTime,
        lastModifiedDateTime: wb.lastModifiedDateTime,
        webUrl: wb.webUrl
      }));
    } catch (error) {
      throw new Error(`Failed to list workbooks: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new Excel workbook',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workbook name' },
        folderId: { type: 'string', description: 'Optional folder ID' },
        template: { type: 'string', description: 'Optional template ID' }
      },
      required: ['name']
    }
  })
  async createWorkbook({ name, folderId, template }: {
    name: string;
    folderId?: string;
    template?: string;
  }): Promise<ExcelWorkbook> {
    try {
      let endpoint = '/me/drive/root/children';
      if (folderId) {
        endpoint = `/me/drive/items/${folderId}/children`;
      }

      let workbook;
      if (template) {
        workbook = await this.client
          .api(`/me/drive/items/${template}/copy`)
          .post({
            name: name.endsWith('.xlsx') ? name : `${name}.xlsx`,
            parentReference: { id: folderId }
          });
      } else {
        workbook = await this.client
          .api(endpoint)
          .post({
            name: name.endsWith('.xlsx') ? name : `${name}.xlsx`,
            file: {},
            '@microsoft.graph.conflictBehavior': 'rename'
          });
      }

      return {
        id: workbook.id,
        name: workbook.name,
        createdDateTime: workbook.createdDateTime,
        lastModifiedDateTime: workbook.lastModifiedDateTime,
        webUrl: workbook.webUrl
      };
    } catch (error) {
      throw new Error(`Failed to create workbook: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get workbook information',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Workbook ID' }
      },
      required: ['id']
    }
  })
  async getWorkbook({ id }: { id: string }): Promise<ExcelWorkbook> {
    try {
      const workbook = await this.client
        .api(`/me/drive/items/${id}`)
        .select('id,name,createdDateTime,lastModifiedDateTime,webUrl')
        .get();

      return {
        id: workbook.id,
        name: workbook.name,
        createdDateTime: workbook.createdDateTime,
        lastModifiedDateTime: workbook.lastModifiedDateTime,
        webUrl: workbook.webUrl
      };
    } catch (error) {
      throw new Error(`Failed to get workbook ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete Excel workbook',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Workbook ID' }
      },
      required: ['id']
    }
  })
  async deleteWorkbook({ id }: { id: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${id}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete workbook ${id}: ${error.message}`);
    }
  }
}