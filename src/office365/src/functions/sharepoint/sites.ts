import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import { SharePointSite } from '../../types';

export class SharePointSiteManagement implements MCPFunctionGroup {
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
    description: 'List SharePoint sites',
    parameters: { type: 'object', properties: {} }
  })
  async listSites(): Promise<SharePointSite[]> {
    try {
      const response = await this.client
        .api('/sites?search=*')
        .get();

      return response.value.map((site: any) => ({
        id: site.id,
        name: site.displayName,
        webUrl: site.webUrl,
        description: site.description
      }));
    } catch (error) {
      throw new Error(`Failed to list sites: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new SharePoint site',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        isPublic: { type: 'boolean' }
      },
      required: ['name']
    }
  })
  async createSite({ name, description, isPublic = false }: {
    name: string;
    description?: string;
    isPublic?: boolean;
  }): Promise<SharePointSite> {
    try {
      const site = await this.client
        .api('/sites/root/sites')
        .post({
          displayName: name,
          description,
          isPublic
        });

      return {
        id: site.id,
        name: site.displayName,
        webUrl: site.webUrl,
        description: site.description
      };
    } catch (error) {
      throw new Error(`Failed to create site: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get SharePoint site details',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  })
  async getSite({ id }: { id: string }): Promise<SharePointSite> {
    try {
      const site = await this.client
        .api(`/sites/${id}`)
        .get();

      return {
        id: site.id,
        name: site.displayName,
        webUrl: site.webUrl,
        description: site.description
      };
    } catch (error) {
      throw new Error(`Failed to get site ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Search SharePoint sites',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  })
  async searchSites({ query }: { query: string }): Promise<SharePointSite[]> {
    try {
      const response = await this.client
        .api(`/sites?search=${query}`)
        .get();

      return response.value.map((site: any) => ({
        id: site.id,
        name: site.displayName,
        webUrl: site.webUrl,
        description: site.description
      }));
    } catch (error) {
      throw new Error(`Failed to search sites: ${error.message}`);
    }
  }
}