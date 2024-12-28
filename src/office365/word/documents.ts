import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import { WordDocument } from '../../types';

export class WordDocumentManagement implements MCPFunctionGroup {
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
    description: 'List Word documents in OneDrive',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Optional folder ID to list documents from' }
      }
    }
  })
  async listDocuments({ folderId }: { folderId?: string } = {}): Promise<WordDocument[]> {
    try {
      let endpoint = '/me/drive/root/search(q=\'.docx\')';
      if (folderId) {
        endpoint = `/me/drive/items/${folderId}/children?$filter=endswith(name,'.docx')`;
      }

      const response = await this.client
        .api(endpoint)
        .select('id,name,createdDateTime,lastModifiedDateTime,webUrl')
        .get();

      return response.value.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        createdDateTime: doc.createdDateTime,
        lastModifiedDateTime: doc.lastModifiedDateTime,
        webUrl: doc.webUrl
      }));
    } catch (error) {
      throw new Error(`Failed to list documents: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new Word document',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Document name' },
        content: { type: 'string', description: 'Initial document content (HTML)' },
        folderId: { type: 'string', description: 'Optional folder ID to create document in' }
      },
      required: ['name']
    }
  })
  async createDocument({ name, content = '', folderId }: { 
    name: string;
    content?: string;
    folderId?: string;
  }): Promise<WordDocument> {
    try {
      let endpoint = '/me/drive/root/children';
      if (folderId) {
        endpoint = `/me/drive/items/${folderId}/children`;
      }

      // Create empty document
      const file = await this.client
        .api(endpoint)
        .post({
          name: name.endsWith('.docx') ? name : `${name}.docx`,
          file: {},
          '@microsoft.graph.conflictBehavior': 'rename'
        });

      // Add content if provided
      if (content) {
        await this.client
          .api(`/me/drive/items/${file.id}/content`)
          .put(content);
      }

      return {
        id: file.id,
        name: file.name,
        createdDateTime: file.createdDateTime,
        lastModifiedDateTime: file.lastModifiedDateTime,
        webUrl: file.webUrl
      };
    } catch (error) {
      throw new Error(`Failed to create document: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get Word document content',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document ID' }
      },
      required: ['id']
    }
  })
  async getDocument({ id }: { id: string }): Promise<WordDocument> {
    try {
      const doc = await this.client
        .api(`/me/drive/items/${id}`)
        .select('id,name,createdDateTime,lastModifiedDateTime,webUrl')
        .get();

      const content = await this.client
        .api(`/me/drive/items/${id}/content`)
        .get();

      return {
        id: doc.id,
        name: doc.name,
        createdDateTime: doc.createdDateTime,
        lastModifiedDateTime: doc.lastModifiedDateTime,
        webUrl: doc.webUrl,
        content
      };
    } catch (error) {
      throw new Error(`Failed to get document ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Update Word document content',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document ID' },
        content: { type: 'string', description: 'New document content (HTML)' }
      },
      required: ['id', 'content']
    }
  })
  async updateDocument({ id, content }: { id: string; content: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${id}/content`)
        .put(content);
    } catch (error) {
      throw new Error(`Failed to update document ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete Word document',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document ID' }
      },
      required: ['id']
    }
  })
  async deleteDocument({ id }: { id: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${id}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete document ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Search Word documents',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  })
  async searchDocuments({ query }: { query: string }): Promise<WordDocument[]> {
    try {
      const response = await this.client
        .api(`/me/drive/root/search(q='${query} AND .docx')`)
        .select('id,name,createdDateTime,lastModifiedDateTime,webUrl')
        .get();

      return response.value.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        createdDateTime: doc.createdDateTime,
        lastModifiedDateTime: doc.lastModifiedDateTime,
        webUrl: doc.webUrl
      }));
    } catch (error) {
      throw new Error(`Failed to search documents: ${error.message}`);
    }
  }
}