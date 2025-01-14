import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { google } from 'googleapis';
import { Translate } from '@google-cloud/translate/build/src/v2';

export class TranslationManager implements MCPFunctionGroup {
  private youtube;
  private translate;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
    this.translate = new Translate({
      projectId: process.env.GOOGLE_PROJECT_ID,
      key: process.env.GOOGLE_TRANSLATE_API_KEY
    });
  }

  @MCPFunction({
    description: 'Translate video captions',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        targetLanguages: { type: 'array', items: { type: 'string' } }
      },
      required: ['videoId', 'targetLanguages']
    }
  })
  async translateCaptions({ videoId, targetLanguages }: {
    videoId: string;
    targetLanguages: string[];
  }): Promise<Record<string, string[]>> {
    try {
      const captions = await this.youtube.captions.list({
        part: ['snippet'],
        videoId
      });

      const results = {};
      for (const caption of captions.data.items) {
        const track = await this.youtube.captions.download({
          id: caption.id
        });

        for (const lang of targetLanguages) {
          const [translation] = await this.translate.translate(track.data, lang);
          if (!results[lang]) results[lang] = [];
          results[lang].push(translation);
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to translate captions: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Translate video metadata',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        targetLanguages: { type: 'array', items: { type: 'string' } },
        fields: { type: 'array', items: { type: 'string' } }
      },
      required: ['videoId', 'targetLanguages']
    }
  })
  async translateMetadata({ videoId, targetLanguages, fields = ['title', 'description', 'tags'] }: {
    videoId: string;
    targetLanguages: string[];
    fields?: string[];
  }): Promise<Record<string, any>> {
    try {
      const video = await this.youtube.videos.list({
        part: ['snippet'],
        id: [videoId]
      });

      const translations = {};
      for (const lang of targetLanguages) {
        translations[lang] = {};
        
        for (const field of fields) {
          if (field === 'tags' && video.data.items[0].snippet.tags) {
            const [translatedTags] = await this.translate.translate(
              video.data.items[0].snippet.tags,
              lang
            );
            translations[lang].tags = translatedTags;
          } else {
            const content = video.data.items[0].snippet[field];
            if (content) {
              const [translation] = await this.translate.translate(content, lang);
              translations[lang][field] = translation;
            }
          }
        }
      }

      return translations;
    } catch (error) {
      throw new Error(`Failed to translate metadata: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Detect spoken languages in video',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        segments: { type: 'boolean' }
      },
      required: ['videoId']
    }
  })
  async detectLanguages({ videoId, segments = false }: {
    videoId: string;
    segments?: boolean;
  }): Promise<any> {
    try {
      const captions = await this.youtube.captions.list({
        part: ['snippet'],
        videoId
      });

      if (segments) {
        return await this.detectLanguageSegments(captions.data.items);
      }

      const allText = await this.getAllCaptionText(captions.data.items);
      const [detection] = await this.translate.detect(allText);
      
      return {
        language: detection.language,
        confidence: detection.confidence
      };
    } catch (error) {
      throw new Error(`Failed to detect languages: ${error.message}`);
    }
  }

  private async detectLanguageSegments(captions: any[]): Promise<any[]> {
    const segments = [];
    const segmentSize = 1000; // Characters per segment

    for (const caption of captions) {
      const track = await this.youtube.captions.download({
        id: caption.id
      });

      let currentSegment = '';
      const words = track.data.split(/\s+/);

      for (const word of words) {
        currentSegment += word + ' ';
        
        if (currentSegment.length >= segmentSize) {
          const [detection] = await this.translate.detect(currentSegment);
          segments.push({
            text: currentSegment.trim(),
            language: detection.language,
            confidence: detection.confidence
          });
          currentSegment = '';
        }
      }

      if (currentSegment) {
        const [detection] = await this.translate.detect(currentSegment);
        segments.push({
          text: currentSegment.trim(),
          language: detection.language,
          confidence: detection.confidence
        });
      }
    }

    return this.mergeConsecutiveSegments(segments);
  }

  private async getAllCaptionText(captions: any[]): Promise<string> {
    let text = '';
    
    for (const caption of captions) {
      const track = await this.youtube.captions.download({
        id: caption.id
      });
      text += track.data + ' ';
    }

    return text.trim();
  }

  private mergeConsecutiveSegments(segments: any[]): any[] {
    const merged = [];
    let current = null;

    for (const segment of segments) {
      if (!current || current.language !== segment.language) {
        if (current) merged.push(current);
        current = {
          ...segment,
          confidence: [segment.confidence]
        };
      } else {
        current.text += ' ' + segment.text;
        current.confidence.push(segment.confidence);
      }
    }

    if (current) {
      current.confidence = current.confidence.reduce((a, b) => a + b) / current.confidence.length;
      merged.push(current);
    }

    return merged;
  }
}