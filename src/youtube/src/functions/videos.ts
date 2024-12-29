import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { google } from 'googleapis';
import { YoutubeTranscript } from 'youtube-transcript';

export class VideoManagement implements MCPFunctionGroup {
  private youtube;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
  }

  @MCPFunction({
    description: 'Get video details',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' }
      },
      required: ['videoId']
    }
  })
  async getVideo({ videoId }: { videoId: string }): Promise<any> {
    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: [videoId]
      });

      return response.data.items[0];
    } catch (error) {
      throw new Error(`Failed to get video: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get video transcript',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' }
      },
      required: ['videoId']
    }
  })
  async getTranscript({ videoId }: { videoId: string }): Promise<any> {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      return transcript;
    } catch (error) {
      throw new Error(`Failed to get transcript: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Search videos',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number' }
      },
      required: ['query']
    }
  })
  async searchVideos({ query, maxResults = 10 }: { 
    query: string;
    maxResults?: number;
  }): Promise<any[]> {
    try {
      const response = await this.youtube.search.list({
        part: ['snippet'],
        q: query,
        maxResults,
        type: ['video']
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to search videos: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get video comments',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        maxResults: { type: 'number' }
      },
      required: ['videoId']
    }
  })
  async getComments({ videoId, maxResults = 20 }: {
    videoId: string;
    maxResults?: number;
  }): Promise<any[]> {
    try {
      const response = await this.youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId,
        maxResults
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to get comments: ${error.message}`);
    }
  }
}