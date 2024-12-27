import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

interface SlideElement {
  type: 'text' | 'image' | 'shape';
  content: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export class PowerPointSlideManagement implements MCPFunctionGroup {
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
    description: 'List slides in presentation',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' }
      },
      required: ['presentationId']
    }
  })
  async listSlides({ presentationId }: { presentationId: string }): Promise<any[]> {
    try {
      const response = await this.client
        .api(`/me/drive/items/${presentationId}/workbook/presentations/slides`)
        .get();

      return response.value;
    } catch (error) {
      throw new Error(`Failed to list slides: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Add element to slide',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
        slideId: { type: 'string', description: 'Slide ID' },
        element: { type: 'object', description: 'Element to add' }
      },
      required: ['presentationId', 'slideId', 'element']
    }
  })
  async addElement({ presentationId, slideId, element }: {
    presentationId: string;
    slideId: string;
    element: SlideElement;
  }): Promise<void> {
    try {
      const endpoint = `/me/drive/items/${presentationId}/workbook/presentations/slides/${slideId}/shapes`;
      
      switch (element.type) {
        case 'text':
          await this.client.api(endpoint).post({
            type: 'Text',
            text: element.content,
            ...element.position,
            ...element.size
          });
          break;
        case 'image':
          await this.client.api(endpoint).post({
            type: 'Picture',
            url: element.content,
            ...element.position,
            ...element.size
          });
          break;
        case 'shape':
          await this.client.api(endpoint).post({
            type: 'Shape',
            shapeType: element.content,
            ...element.position,
            ...element.size
          });
          break;
      }
    } catch (error) {
      throw new Error(`Failed to add element to slide: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get slide thumbnail',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
        slideId: { type: 'string', description: 'Slide ID' }
      },
      required: ['presentationId', 'slideId']
    }
  })
  async getThumbnail({ presentationId, slideId }: {
    presentationId: string;
    slideId: string;
  }): Promise<string> {
    try {
      const response = await this.client
        .api(`/me/drive/items/${presentationId}/workbook/presentations/slides/${slideId}/thumbnail`)
        .get();

      return response.value;
    } catch (error) {
      throw new Error(`Failed to get slide thumbnail: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Reorder slides',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
        slideIds: { type: 'array', description: 'Array of slide IDs in new order' }
      },
      required: ['presentationId', 'slideIds']
    }
  })
  async reorderSlides({ presentationId, slideIds }: {
    presentationId: string;
    slideIds: string[];
  }): Promise<void> {
    try {
      await this.client
        .api(`/me/drive/items/${presentationId}/workbook/presentations/slides/reorder`)
        .post({
          ids: slideIds
        });
    } catch (error) {
      throw new Error(`Failed to reorder slides: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Export slide as image',
    parameters: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Presentation ID' },
        slideId: { type: 'string', description: 'Slide ID' },
        format: { type: 'string', description: 'Image format (png/jpeg)' }
      },
      required: ['presentationId', 'slideId']
    }
  })
  async exportSlide({ presentationId, slideId, format = 'png' }: {
    presentationId: string;
    slideId: string;
    format?: 'png' | 'jpeg';
  }): Promise<string> {
    try {
      const response = await this.client
        .api(`/me/drive/items/${presentationId}/workbook/presentations/slides/${slideId}/export`)
        .post({
          format
        });

      return response.value;
    } catch (error) {
      throw new Error(`Failed to export slide: ${error.message}`);
    }
  }
}