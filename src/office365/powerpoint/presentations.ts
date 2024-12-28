import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';
import { PowerPointPresentation } from '../../types';

export class PowerPointPresentationManagement implements MCPFunctionGroup {
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
    description: 'List PowerPoint presentations',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Optional folder ID' }
      }
    }
  })
  async listPresentations({ folderId }: { folderId?: string } = {}): Promise<PowerPointPresentation[]> {
    try {
      let endpoint = '/me/drive/root/search(q=\'.pptx\')';
      if (folderId) {
        endpoint = `/me/drive/items/${folderId}/children?$filter=endswith(name,'.pptx')`;
      }

      const response = await this.client
        .api(endpoint)
        .select('id,name,createdDateTime,lastModifiedDateTime,webUrl')
        .get();

      return response.value.map((pres: any) => ({
        id: pres.id,
        name: pres.name,
        createdDateTime: pres.createdDateTime,
        lastModifiedDateTime: pres.lastModifiedDateTime,
        webUrl: pres.webUrl
      }));
    } catch (error) {
      throw new Error(`Failed to list presentations: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Create new PowerPoint presentation',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Presentation name' },
        folderId: { type: 'string', description: 'Optional folder ID' },
        template: { type: 'string', description: 'Optional template ID' }
      },
      required: ['name']
    }
  })
  async createPresentation({ name, folderId, template }: {
    name: string;
    folderId?: string;
    template?: string;
  }): Promise<PowerPointPresentation> {
    try {
      let endpoint = '/me/drive/root/children';
      if (folderId) {
        endpoint = `/me/drive/items/${folderId}/children`;
      }

      let presentation;
      if (template) {
        presentation = await this.client
          .api(`/me/drive/items/${template}/copy`)
          .post({
            name: name.endsWith('.pptx') ? name : `${name}.pptx`,
            parentReference: { id: folderId }
          });
      } else {
        presentation = await this.client
          .api(endpoint)
          .post({
            name: name.endsWith('.pptx') ? name : `${name}.pptx`,
            file: {},
            '@microsoft.graph.conflictBehavior': 'rename'
          });
      }

      return {
        id: presentation.id,
        name: presentation.name,
        createdDateTime: presentation.createdDateTime,
        lastModifiedDateTime: presentation.lastModifiedDateTime,
        webUrl: presentation.webUrl
      };
    } catch (error) {
      throw new Error(`Failed to create presentation: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete PowerPoint presentation',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Presentation ID' }
      },
      required: ['id']
    }
  })
  async deletePresentation({ id }: { id: string }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${id}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete presentation ${id}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Add slide to presentation',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
        layoutId: { type: 'string', description: 'Slide layout ID' }
      },
      required: ['presentationId']
    }
  })
  async addSlide({ presentationId, layoutId }: {
    presentationId: string;
    layoutId?: string;
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${presentationId}/workbook/presentations/slides`)
        .post({
          layoutId
        });
    } catch (error) {
      throw new Error(`Failed to add slide: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Delete slide from presentation',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
        slideId: { type: 'string', description: 'Slide ID' }
      },
      required: ['presentationId', 'slideId']
    }
  })
  async deleteSlide({ presentationId, slideId }: {
    presentationId: string;
    slideId: string;
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${presentationId}/workbook/presentations/slides/${slideId}`)
        .delete();
    } catch (error) {
      throw new Error(`Failed to delete slide: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Update slide content',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
        slideId: { type: 'string', description: 'Slide ID' },
        content: { type: 'object', description: 'Slide content' }
      },
      required: ['presentationId', 'slideId', 'content']
    }
  })
  async updateSlideContent({ presentationId, slideId, content }: {
    presentationId: string;
    slideId: string;
    content: any;
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${presentationId}/workbook/presentations/slides/${slideId}`)
        .patch(content);
    } catch (error) {
      throw new Error(`Failed to update slide content: ${error.message}`);
    }
  }
}