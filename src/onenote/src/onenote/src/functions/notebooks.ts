import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import { Notebook, NotebookCreateOptions } from '../types';

export class NotebookManagement implements MCPFunctionGroup {
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
    description: 'List all notebooks',
    parameters: {
      type: 'object',
      properties: {}
    }
  })
  async listNotebooks(): Promise<Notebook[]> {
    try {
      const response = await this.client
        .api('/me/onenote/notebooks')
        .select('id,displayName,createdDateTime,lastModifiedDateTime,sectionsUrl')
        .get();

      return response.value.map((notebook: any) => ({
        id: notebook.id,
        name: notebook.displayName,
        createdTime: notebook.createdDateTime,
        lastModifiedTime: notebook.lastModifiedDateTime,
        sectionsUrl: notebook.sectionsUrl
      }));
    } catch (error) {
      throw new Error(`Failed to list notebooks: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get notebook by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Notebook ID' }
      },
      required: ['id']
    }
  })
  async getNotebook({ id }: { id: string }): Promise<Notebook> {
    try {
      const notebook = await this.client
        .api(`/me/onenote/notebooks/${id}`)
        .select('id,displayName,createdDateTime,lastModifiedDateTime,sectionsUrl')
        .get();

      return {
        id: notebook.id,
        name: notebook.displayName,
        createdTime: notebook.createdDateTime,
        lastModifiedTime: notebook.lastModifiedDateTime,
        sectionsUrl: notebook.sectionsUrl
      };
    } catch (error) {
      throw new Error(`Failed to get notebook ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new notebook',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Notebook name' },
        sectionName: { type: 'string', description: 'Optional initial section name' }
      },
      required: ['name']
    }
  })
  async createNotebook({ name, sectionName }: NotebookCreateOptions): Promise<Notebook> {
    try {
      const notebook = await this.client
        .api('/me/onenote/notebooks')
        .post({
          displayName: name
        });

      if (sectionName) {
        await this.client
          .api(`/me/onenote/notebooks/${notebook.id}/sections`)
          .post({
            displayName: sectionName
          });
      }

      return {
        id: notebook.id,
        name: notebook.displayName,
        createdTime: notebook.createdDateTime,
        lastModifiedTime: notebook.lastModifiedDateTime,
        sectionsUrl: notebook.sectionsUrl
      };
    } catch (error) {
      throw new Error(`Failed to create notebook: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete notebook',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Notebook ID' }
      },
      required: ['id']
    }
  })
  async deleteNotebook({ id }: { id: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/onenote/notebooks/${id}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete notebook ${id}: ${error.message}`);
    }
  }
}