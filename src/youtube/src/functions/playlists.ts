import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { google } from 'googleapis';

export class PlaylistManagement implements MCPFunctionGroup {
  private youtube;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
  }

  @MCPFunction({
    description: 'Get playlist details',
    parameters: {
      type: 'object',
      properties: {
        playlistId: { type: 'string' }
      },
      required: ['playlistId']
    }
  })
  async getPlaylist({ playlistId }: { playlistId: string }): Promise<any> {
    try {
      const response = await this.youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        id: [playlistId]
      });

      return response.data.items[0];
    } catch (error) {
      throw new Error(`Failed to get playlist: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get playlist items',
    parameters: {
      type: 'object',
      properties: {
        playlistId: { type: 'string' },
        maxResults: { type: 'number' }
      },
      required: ['playlistId']
    }
  })
  async getPlaylistItems({ playlistId, maxResults = 50 }: {
    playlistId: string;
    maxResults?: number;
  }): Promise<any[]> {
    try {
      const response = await this.youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId,
        maxResults
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to get playlist items: ${error.message}`);
    }
  }
}