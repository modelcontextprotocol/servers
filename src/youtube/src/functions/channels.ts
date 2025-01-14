import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { google } from 'googleapis';

export class ChannelManagement implements MCPFunctionGroup {
  private youtube;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
  }

  @MCPFunction({
    description: 'Get channel details',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string' }
      },
      required: ['channelId']
    }
  })
  async getChannel({ channelId }: { channelId: string }): Promise<any> {
    try {
      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: [channelId]
      });

      return response.data.items[0];
    } catch (error) {
      throw new Error(`Failed to get channel: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get channel playlists',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
        maxResults: { type: 'number' }
      },
      required: ['channelId']
    }
  })
  async getChannelPlaylists({ channelId, maxResults = 50 }: {
    channelId: string;
    maxResults?: number;
  }): Promise<any[]> {
    try {
      const response = await this.youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        channelId,
        maxResults
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to get channel playlists: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get channel videos',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
        maxResults: { type: 'number' }
      },
      required: ['channelId']
    }
  })
  async getChannelVideos({ channelId, maxResults = 50 }: {
    channelId: string;
    maxResults?: number;
  }): Promise<any[]> {
    try {
      const response = await this.youtube.search.list({
        part: ['snippet'],
        channelId,
        maxResults,
        order: 'date',
        type: ['video']
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to get channel videos: ${error.message}`);
    }
  }
}