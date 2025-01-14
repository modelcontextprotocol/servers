import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { google } from 'googleapis';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';

export class ShortsManager implements MCPFunctionGroup {
  private youtube;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
  }

  @MCPFunction({
    description: 'Create Short from video segment',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        startTime: { type: 'number' },
        duration: { type: 'number' },
        title: { type: 'string' },
        effects: { type: 'array', items: { type: 'string' } }
      },
      required: ['videoId', 'startTime']
    }
  })
  async createShort({ videoId, startTime, duration = 60, title, effects = [] }: {
    videoId: string;
    startTime: number;
    duration?: number;
    title?: string;
    effects?: string[];
  }): Promise<string> {
    try {
      const outputDir = path.join(process.cwd(), 'shorts');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `${videoId}-short-${Date.now()}.mp4`);

      await this.extractAndProcessSegment(
        videoId,
        startTime,
        Math.min(duration, 60),
        outputPath,
        effects
      );

      const uploadedVideoId = await this.uploadShort(
        outputPath,
        title || `Short from ${videoId}`,
        effects
      );

      await fs.unlink(outputPath);
      return uploadedVideoId;
    } catch (error) {
      throw new Error(`Failed to create Short: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Find optimal segments for Shorts',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        maxSegments: { type: 'number' }
      },
      required: ['videoId']
    }
  })
  async findShortSegments({ videoId, maxSegments = 3 }: {
    videoId: string;
    maxSegments?: number;
  }): Promise<any[]> {
    try {
      const video = await this.youtube.videos.list({
        part: ['contentDetails', 'statistics'],
        id: [videoId]
      });

      const markers = await this.getEngagementMarkers(videoId);
      const segments = this.identifyInterestingSegments(markers, maxSegments);

      return segments.map(segment => ({
        startTime: segment.startTime,
        duration: segment.duration,
        confidence: segment.confidence,
        suggestedEffects: this.suggestEffects(segment.type)
      }));
    } catch (error) {
      throw new Error(`Failed to find segments: ${error.message}`);
    }
  }

  private async extractAndProcessSegment(
    videoId: string,
    startTime: number,
    duration: number,
    outputPath: string,
    effects: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = ytdl(videoId, { quality: 'highest' });
      let command = ffmpeg(video)
        .seekInput(startTime)
        .duration(duration)
        .size('1080x1920')
        .videoFilter('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1');

      effects.forEach(effect => {
        switch (effect) {
          case 'speedup':
            command = command.videoFilters('setpts=0.5*PTS');
            break;
          case 'slowdown':
            command = command.videoFilters('setpts=2*PTS');
            break;
          case 'fade':
            command = command.videoFilters('fade=in:0:30,fade=out:st='+(duration-1)+':d=1');
            break;
          case 'mirror':
            command = command.videoFilters('hflip');
            break;
          case 'blur-background':
            command = command.complexFilter([
              '[0:v]split[original][blur]',
              '[blur]scale=1080:1920,boxblur=20:20[blurred]',
              '[original]scale=1080:1920:force_original_aspect_ratio=decrease[scaled]',
              '[blurred][scaled]overlay=(W-w)/2:(H-h)/2'
            ]);
            break;
        }
      });

      command
        .outputOptions('-c:v', 'libx264')
        .outputOptions('-c:a', 'aac')
        .outputOptions('-movflags', '+faststart')
        .toFormat('mp4')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }

  private async uploadShort(filePath: string, title: string, effects: string[]): Promise<string> {
    const fileSize = (await fs.stat(filePath)).size;
    
    const res = await this.youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description: `Created with effects: ${effects.join(', ')}`,
          tags: ['Short'],
          categoryId: '22'
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(filePath)
      }
    });

    return res.data.id;
  }

  private async getEngagementMarkers(videoId: string): Promise<any[]> {
    const [analytics, comments] = await Promise.all([
      this.youtube.videos.list({
        part: ['statistics', 'topicDetails'],
        id: [videoId]
      }),
      this.youtube.commentThreads.list({
        part: ['snippet'],
        videoId,
        order: 'relevance',
        maxResults: 100
      })
    ]);

    const markers = [];

    // Process comments for timestamps and sentiment
    comments.data.items.forEach(comment => {
      const text = comment.snippet.topLevelComment.snippet.textOriginal;
      const timestamp = this.extractTimestamp(text);
      if (timestamp) {
        markers.push({
          time: timestamp,
          type: 'comment',
          engagement: parseInt(comment.snippet.topLevelComment.snippet.likeCount)
        });
      }
    });

    return markers;
  }

  private extractTimestamp(text: string): number | null {
    const timePattern = /(\d+:)?(\d+):(\d+)/;
    const match = text.match(timePattern);
    if (match) {
      const [hours, minutes, seconds] = match.slice(1).map(t => parseInt(t || '0'));
      return hours * 3600 + minutes * 60 + seconds;
    }
    return null;
  }

  private identifyInterestingSegments(markers: any[], maxSegments: number): any[] {
    const segments = [];
    const windowSize = 60; // 60 seconds for Shorts

    // Group markers into potential segments
    for (let i = 0; i < markers.length; i++) {
      const segmentMarkers = markers.filter(m => 
        m.time >= markers[i].time && 
        m.time < markers[i].time + windowSize
      );

      if (segmentMarkers.length > 0) {
        const engagement = segmentMarkers.reduce((sum, m) => sum + m.engagement, 0);
        segments.push({
          startTime: markers[i].time,
          duration: windowSize,
          markers: segmentMarkers,
          engagement,
          type: this.determineSegmentType(segmentMarkers),
          confidence: this.calculateConfidence(segmentMarkers)
        });
      }
    }

    return segments
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, maxSegments);
  }

  private determineSegmentType(markers: any[]): string {
    const types = markers.map(m => m.type);
    const typeCount = {};
    types.forEach(t => {
      typeCount[t] = (typeCount[t] || 0) + 1;
    });
    return Object.entries(typeCount)
      .sort(([,a], [,b]) => b - a)[0][0];
  }

  private calculateConfidence(markers: any[]): number {
    const factors = {
      markerCount: Math.min(markers.length / 5, 1),
      engagementSpread: this.calculateEngagementSpread(markers),
      markerTypes: new Set(markers.map(m => m.type)).size / 3
    };

    return Object.values(factors)
      .reduce((sum, val) => sum + val, 0) / Object.keys(factors).length;
  }

  private calculateEngagementSpread(markers: any[]): number {
    const engagements = markers.map(m => m.engagement);
    const max = Math.max(...engagements);
    const min = Math.min(...engagements);
    return 1 - ((max - min) / max);
  }

  private suggestEffects(segmentType: string): string[] {
    const effects = [];
    switch (segmentType) {
      case 'action':
        effects.push('speedup', 'fade');
        break;
      case 'highlight':
        effects.push('slowdown', 'blur-background');
        break;
      case 'transition':
        effects.push('fade');
        break;
      default:
        effects.push('blur-background');
    }
    return effects;
  }
}