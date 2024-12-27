import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import { Page, PageCreateOptions, SearchOptions } from '../types';

export class PageManagement implements MCPFunctionGroup {
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
    description: 'List pages in a section',
    parameters: {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Section ID' }
      },
      required: ['sectionId']
    }
  })
  async listPages({ sectionId }: { sectionId: string }): Promise<Page[]> {
    try {
      const response = await this.client
        .api(`/me/onenote/sections/${sectionId}/pages`)
        .select('id,title,createdDateTime,lastModifiedDateTime,contentUrl')
        .get();

      return response.value.map((page: any) => ({
        id: page.id,
        title: page.title,
        createdTime: page.createdDateTime,
        lastModifiedTime: page.lastModifiedDateTime,
        contentUrl: page.contentUrl
      }));
    } catch (error) {
      throw new Error(`Failed to list pages: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Search pages across notebooks',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        notebookId: { type: 'string', description: 'Optional notebook ID to limit search scope' },
        sectionId: { type: 'string', description: 'Optional section ID to limit search scope' }
      },
      required: ['query']
    }
  })
  async searchPages({ query, notebookId, sectionId }: SearchOptions): Promise<Page[]> {
    try {
      let searchEndpoint = '/me/onenote/pages';
      if (sectionId) {
        searchEndpoint = `/me/onenote/sections/${sectionId}/pages`;
      } else if (notebookId) {
        searchEndpoint = `/me/onenote/notebooks/${notebookId}/pages`;
      }

      const response = await this.client
        .api(searchEndpoint)
        .search(query)
        .select('id,title,createdDateTime,lastModifiedDateTime,contentUrl')
        .get();

      return response.value.map((page: any) => ({
        id: page.id,
        title: page.title,
        createdTime: page.createdDateTime,
        lastModifiedTime: page.lastModifiedDateTime,
        contentUrl: page.contentUrl
      }));
    } catch (error) {
      throw new Error(`Failed to search pages: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new page',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Page title' },
        content: { type: 'string', description: 'Page content in HTML format' },
        sectionId: { type: 'string', description: 'Section ID' }
      },
      required: ['title', 'content', 'sectionId']
    }
  })
  async createPage({ title, content, sectionId }: PageCreateOptions): Promise<Page> {
    try {
      const htmlContent = `<!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
          </head>
          <body>
            ${content}
          </body>
        </html>`;

      const page = await this.client
        .api(`/me/onenote/sections/${sectionId}/pages`)
        .header('Content-Type', 'application/xhtml+xml')
        .post(htmlContent);

      return {
        id: page.id,
        title: page.title,
        createdTime: page.createdDateTime,
        lastModifiedTime: page.lastModifiedDateTime,
        contentUrl: page.contentUrl
      };
    } catch (error) {
      throw new Error(`Failed to create page: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get page content',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Page ID' }
      },
      required: ['id']
    }
  })
  async getPage({ id }: { id: string }): Promise<Page> {
    try {
      const page = await this.client
        .api(`/me/onenote/pages/${id}`)
        .select('id,title,createdDateTime,lastModifiedDateTime,contentUrl')
        .get();

      const content = await this.client
        .api(`/me/onenote/pages/${id}/content`)
        .get();

      return {
        id: page.id,
        title: page.title,
        createdTime: page.createdDateTime,
        lastModifiedTime: page.lastModifiedDateTime,
        content,
        contentUrl: page.contentUrl
      };
    } catch (error) {
      throw new Error(`Failed to get page ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Update page content',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Page ID' },
        content: { type: 'string', description: 'New page content in HTML format' }
      },
      required: ['id', 'content']
    }
  })
  async updatePage({ id, content }: { id: string; content: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/onenote/pages/${id}/content`)
        .patch(content);
    } catch (error) {
      throw new Error(`Failed to update page ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete page',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Page ID' }
      },
      required: ['id']
    }
  })
  async deletePage({ id }: { id: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/onenote/pages/${id}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete page ${id}: ${error.message}`);
    }
  }
}