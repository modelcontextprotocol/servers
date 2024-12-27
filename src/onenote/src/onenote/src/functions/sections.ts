import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import { Section, SectionCreateOptions } from '../types';

export class SectionManagement implements MCPFunctionGroup {
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
    description: 'List sections in a notebook',
    parameters: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'Notebook ID' }
      },
      required: ['notebookId']
    }
  })
  async listSections({ notebookId }: { notebookId: string }): Promise<Section[]> {
    try {
      const response = await this.client
        .api(`/me/onenote/notebooks/${notebookId}/sections`)
        .select('id,displayName,createdDateTime,lastModifiedDateTime,pagesUrl')
        .get();

      return response.value.map((section: any) => ({
        id: section.id,
        name: section.displayName,
        createdTime: section.createdDateTime,
        lastModifiedTime: section.lastModifiedDateTime,
        pagesUrl: section.pagesUrl
      }));
    } catch (error) {
      throw new Error(`Failed to list sections: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new section',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Section name' },
        notebookId: { type: 'string', description: 'Notebook ID' }
      },
      required: ['name', 'notebookId']
    }
  })
  async createSection({ name, notebookId }: SectionCreateOptions): Promise<Section> {
    try {
      const section = await this.client
        .api(`/me/onenote/notebooks/${notebookId}/sections`)
        .post({
          displayName: name
        });

      return {
        id: section.id,
        name: section.displayName,
        createdTime: section.createdDateTime,
        lastModifiedTime: section.lastModifiedDateTime,
        pagesUrl: section.pagesUrl
      };
    } catch (error) {
      throw new Error(`Failed to create section: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get section by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Section ID' }
      },
      required: ['id']
    }
  })
  async getSection({ id }: { id: string }): Promise<Section> {
    try {
      const section = await this.client
        .api(`/me/onenote/sections/${id}`)
        .select('id,displayName,createdDateTime,lastModifiedDateTime,pagesUrl')
        .get();

      return {
        id: section.id,
        name: section.displayName,
        createdTime: section.createdDateTime,
        lastModifiedTime: section.lastModifiedDateTime,
        pagesUrl: section.pagesUrl
      };
    } catch (error) {
      throw new Error(`Failed to get section ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete section',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Section ID' }
      },
      required: ['id']
    }
  })
  async deleteSection({ id }: { id: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/onenote/sections/${id}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete section ${id}: ${error.message}`);
    }
  }
}