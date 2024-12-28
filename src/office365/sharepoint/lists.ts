import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

export class SharePointListManagement implements MCPFunctionGroup {
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
    description: 'List all lists in a site',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string' }
      },
      required: ['siteId']
    }
  })
  async getLists({ siteId }: { siteId: string }): Promise<any[]> {
    try {
      const response = await this.client
        .api(`/sites/${siteId}/lists`)
        .get();

      return response.value;
    } catch (error) {
      throw new Error(`Failed to get lists: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new list',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        name: { type: 'string' },
        columns: { type: 'array' }
      },
      required: ['siteId', 'name']
    }
  })
  async createList({ siteId, name, columns = [] }: {
    siteId: string;
    name: string;
    columns?: Array<{
      name: string;
      type: string;
    }>;
  }): Promise<any> {
    try {
      const list = await this.client
        .api(`/sites/${siteId}/lists`)
        .post({
          displayName: name,
          columns
        });

      return list;
    } catch (error) {
      throw new Error(`Failed to create list: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get list items',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        listId: { type: 'string' }
      },
      required: ['siteId', 'listId']
    }
  })
  async getItems({ siteId, listId }: {
    siteId: string;
    listId: string;
  }): Promise<any[]> {
    try {
      const response = await this.client
        .api(`/sites/${siteId}/lists/${listId}/items?expand=fields`)
        .get();

      return response.value;
    } catch (error) {
      throw new Error(`Failed to get list items: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Add list item',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        listId: { type: 'string' },
        fields: { type: 'object' }
      },
      required: ['siteId', 'listId', 'fields']
    }
  })
  async addItem({ siteId, listId, fields }: {
    siteId: string;
    listId: string;
    fields: Record<string, any>;
  }): Promise<any> {
    try {
      const item = await this.client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields
        });

      return item;
    } catch (error) {
      throw new Error(`Failed to add list item: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Update list item',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        listId: { type: 'string' },
        itemId: { type: 'string' },
        fields: { type: 'object' }
      },
      required: ['siteId', 'listId', 'itemId', 'fields']
    }
  })
  async updateItem({ siteId, listId, itemId, fields }: {
    siteId: string;
    listId: string;
    itemId: string;
    fields: Record<string, any>;
  }): Promise<void> {
    try {
      await this.client
        .api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`)
        .patch(fields);
    } catch (error) {
      throw new Error(`Failed to update list item: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete list item',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        listId: { type: 'string' },
        itemId: { type: 'string' }
      },
      required: ['siteId', 'listId', 'itemId']
    }
  })
  async deleteItem({ siteId, listId, itemId }: {
    siteId: string;
    listId: string;
    itemId: string;
  }): Promise<void> {
    try {
      await this.client
        .api(`/sites/${siteId}/lists/${listId}/items/${itemId}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete list item: ${error.message}`);
    }
  }
}