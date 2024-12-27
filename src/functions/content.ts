import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

/**
 * ContentManagement provides advanced content manipulation capabilities
 * for OneNote pages.
 */
export class ContentManagement implements MCPFunctionGroup {
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
    description: 'Extract text content from a page',
    parameters: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID' }
      },
      required: ['pageId']
    }
  })
  async extractText({ pageId }: { pageId: string }): Promise<string> {
    try {
      const content = await this.client
        .api(`/me/onenote/pages/${pageId}/content`)
        .get();

      // Simple HTML to text conversion
      const text = content
        .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
        .replace(/\s+/g, ' ')      // Normalize whitespace
        .trim();                   // Trim ends

      return text;
    } catch (error) {
      throw new Error(`Failed to extract text from page ${pageId}: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Convert Markdown to OneNote HTML format',
    parameters: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown content' }
      },
      required: ['markdown']
    }
  })
  async markdownToHtml({ markdown }: { markdown: string }): Promise<string> {
    try {
      // Basic markdown conversion
      const html = markdown
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br/>');

      return html;
    } catch (error) {
      throw new Error(`Failed to convert markdown to HTML: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Insert an image into a page',
    parameters: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID' },
        imageUrl: { type: 'string', description: 'URL of the image to insert' },
        altText: { type: 'string', description: 'Alternative text for the image' }
      },
      required: ['pageId', 'imageUrl']
    }
  })
  async insertImage({ pageId, imageUrl, altText = '' }: { 
    pageId: string; 
    imageUrl: string; 
    altText?: string 
  }): Promise<void> {
    try {
      const html = `<img src="${imageUrl}" alt="${altText}" />`;
      
      await this.client
        .api(`/me/onenote/pages/${pageId}/content`)
        .patch(html);
    } catch (error) {
      throw new Error(`Failed to insert image into page ${pageId}: ${error.message}`);
    }
  }
}