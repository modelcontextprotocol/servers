import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { google } from 'googleapis';
import { SpeechClient } from '@google-cloud/speech';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';

export class CaptionManager implements MCPFunctionGroup {
  private youtube;
  private speechClient;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
    this.speechClient = new SpeechClient();
  }

  @MCPFunction({
    description: 'Generate captions from video audio',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        languages: { type: 'array', items: { type: 'string' } },
        options: {
          type: 'object',
          properties: {
            enableSpeakerDiarization: { type: 'boolean' },
            enablePunctuation: { type: 'boolean' },
            enableTimestamps: { type: 'boolean' }
          }
        }
      },
      required: ['videoId']
    }
  })
  async generateCaptions({ videoId, languages = ['en'], options = {} }: {
    videoId: string;
    languages?: string[];
    options?: {
      enableSpeakerDiarization?: boolean;
      enablePunctuation?: boolean;
      enableTimestamps?: boolean;
    };
  }): Promise<any> {
    try {
      const audioPath = await this.extractAudio(videoId);
      const transcription = await this.transcribeAudio(audioPath, languages[0], options);
      await fs.unlink(audioPath);

      const captions = await this.formatTranscription(transcription, options);
      await this.uploadCaptions(videoId, captions, languages[0]);

      if (languages.length > 1) {
        await this.generateTranslations(videoId, languages.slice(1), captions);
      }

      return {
        languages: languages,
        captionTracks: await this.getCaptionTracks(videoId)
      };
    } catch (error) {
      throw new Error(`Failed to generate captions: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Apply auto-sync captions to video',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        captionFile: { type: 'string' },
        language: { type: 'string' }
      },
      required: ['videoId', 'captionFile']
    }
  })
  async syncCaptions({ videoId, captionFile, language = 'en' }: {
    videoId: string;
    captionFile: string;
    language?: string;
  }): Promise<any> {
    try {
      const captions = await fs.readFile(captionFile, 'utf-8');
      const audioPath = await this.extractAudio(videoId);
      const syncedCaptions = await this.autoSyncCaptions(audioPath, captions, language);
      await fs.unlink(audioPath);

      await this.uploadCaptions(videoId, syncedCaptions, language);

      return {
        status: 'success',
        language: language,
        track: await this.getCaptionTracks(videoId)
      };
    } catch (error) {
      throw new Error(`Failed to sync captions: ${error.message}`);
    }
  }

  private async extractAudio(videoId: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'audio');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${videoId}.wav`);

    return new Promise((resolve, reject) => {
      const video = ytdl(videoId, { quality: 'highestaudio' });

      ffmpeg(video)
        .toFormat('wav')
        .audioBitrate(16)
        .audioChannels(1)
        .audioFrequency(16000)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }

  private async transcribeAudio(audioPath: string, language: string, options: any): Promise<any> {
    const file = await fs.readFile(audioPath);
    const audio = {
      content: file.toString('base64')
    };

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: language,
      enableAutomaticPunctuation: options.enablePunctuation !== false,
      enableWordTimeOffsets: options.enableTimestamps !== false,
      enableSpeakerDiarization: options.enableSpeakerDiarization === true,
      diarizationSpeakerCount: options.enableSpeakerDiarization ? 2 : undefined,
      model: 'video'
    };

    const [operation] = await this.speechClient.longRunningRecognize({ audio, config });
    return operation.promise();
  }

  private async formatTranscription(transcription: any, options: any): Promise<string> {
    const formatTime = (seconds: number) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${pad(h)}:${pad(m)}:${pad(s)},${ms.toString().padStart(3, '0')}`;
    };

    let srtIndex = 1;
    let output = '';

    for (const result of transcription.results) {
      if (options.enableSpeakerDiarization) {
        const words = result.alternatives[0].words;
        let currentSpeaker = null;
        let currentSegment = { text: '', start: 0, end: 0 };

        for (const word of words) {
          if (word.speakerTag !== currentSpeaker) {
            if (currentSpeaker !== null) {
              output += `${srtIndex++}\n`;
              output += `${formatTime(currentSegment.start)} --> ${formatTime(currentSegment.end)}\n`;
              output += `Speaker ${currentSpeaker}: ${currentSegment.text.trim()}\n\n`;
            }
            currentSpeaker = word.speakerTag;
            currentSegment = {
              text: word.word,
              start: Number(word.startTime.seconds) + (word.startTime.nanos / 1e9),
              end: Number(word.endTime.seconds) + (word.endTime.nanos / 1e9)
            };
          } else {
            currentSegment.text += ` ${word.word}`;
            currentSegment.end = Number(word.endTime.seconds) + (word.endTime.nanos / 1e9);
          }
        }

        if (currentSegment.text) {
          output += `${srtIndex++}\n`;
          output += `${formatTime(currentSegment.start)} --> ${formatTime(currentSegment.end)}\n`;
          output += `Speaker ${currentSpeaker}: ${currentSegment.text.trim()}\n\n`;
        }
      } else {
        const words = result.alternatives[0].words;
        const segmentSize = 10;
        
        for (let i = 0; i < words.length; i += segmentSize) {
          const segment = words.slice(i, Math.min(i + segmentSize, words.length));
          const start = Number(segment[0].startTime.seconds) + (segment[0].startTime.nanos / 1e9);
          const end = Number(segment[segment.length - 1].endTime.seconds) + 
                     (segment[segment.length - 1].endTime.nanos / 1e9);

          output += `${srtIndex++}\n`;
          output += `${formatTime(start)} --> ${formatTime(end)}\n`;
          output += `${segment.map(w => w.word).join(' ')}\n\n`;
        }
      }
    }

    return output;
  }

  private async autoSyncCaptions(audioPath: string, captions: string, language: string): Promise<string> {
    // First get word-level timing from speech recognition
    const transcription = await this.transcribeAudio(
      audioPath,
      language,
      { enableTimestamps: true }
    );

    // Parse input captions and transcription
    const captionLines = captions.split('\n').filter(line => line.trim());
    const transcriptWords = transcription.results
      .flatMap(result => result.alternatives[0].words)
      .map(word => ({
        text: word.word.toLowerCase(),
        start: Number(word.startTime.seconds) + (word.startTime.nanos / 1e9),
        end: Number(word.endTime.seconds) + (word.endTime.nanos / 1e9)
      }));

    // Align captions with transcription
    let output = '';
    let srtIndex = 1;
    let transcriptIndex = 0;

    for (const line of captionLines) {
      const words = line.toLowerCase().split(/\s+/);
      const startWord = transcriptWords[transcriptIndex];
      
      let bestMatch = {
        start: startWord ? startWord.start : 0,
        end: startWord ? startWord.end : 0,
        confidence: 0
      };

      // Find best matching segment in transcript
      while (transcriptIndex < transcriptWords.length) {
        const windowSize = words.length;
        const transcriptSegment = transcriptWords
          .slice(transcriptIndex, transcriptIndex + windowSize)
          .map(w => w.text);

        const similarity = this.calculateSimilarity(
          words.join(' '),
          transcriptSegment.join(' ')
        );

        if (similarity > bestMatch.confidence) {
          bestMatch = {
            start: transcriptWords[transcriptIndex].start,
            end: transcriptWords[transcriptIndex + windowSize - 1]?.end || 
                 transcriptWords[transcriptIndex].end,
            confidence: similarity
          };
        }

        transcriptIndex++;
      }

      // Add synchronized caption
      output += `${srtIndex++}\n`;
      output += `${this.formatTime(bestMatch.start)} --> ${this.formatTime(bestMatch.end)}\n`;
      output += `${line}\n\n`;
    }

    return output;
  }

  private async uploadCaptions(videoId: string, captions: string, language: string): Promise<void> {
    const name = `${language}_${Date.now()}.srt`;
    const tmpPath = path.join(process.cwd(), 'temp', name);
    await fs.mkdir(path.dirname(tmpPath), { recursive: true });
    await fs.writeFile(tmpPath, captions);

    await this.youtube.captions.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          language,
          name,
          isDraft: false
        }
      },
      media: {
        body: fs.createReadStream(tmpPath)
      }
    });

    await fs.unlink(tmpPath);
  }

  private async getCaptionTracks(videoId: string): Promise<any[]> {
    const response = await this.youtube.captions.list({
      part: ['snippet'],
      videoId
    });

    return response.data.items || [];
  }

  private async generateTranslations(videoId: string, languages: string[], sourceCaptions: string): Promise<void> {
    const translate = new Translate({
      projectId: process.env.GOOGLE_PROJECT_ID,
      key: process.env.GOOGLE_TRANSLATE_API_KEY
    });

    for (const language of languages) {
      const translated = await this.translateCaptions(sourceCaptions, language, translate);
      await this.uploadCaptions(videoId, translated, language);
    }
  }

  private async translateCaptions(captions: string, targetLanguage: string, translate: any): Promise<string> {
    const lines = captions.split('\n');
    let output = '';
    let isText = false;

    for (const line of lines) {
      if (line.trim() === '') {
        output += '\n';
        isText = false;
        continue;
      }

      if (/^\d+$/.test(line.trim()) || /^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/.test(line.trim())) {
        output += line + '\n';
        isText = false;
      } else if (isText || !line.includes('-->')) {
        const [translation] = await translate.translate(line, targetLanguage);
        output += translation + '\n';
        isText = true;
      } else {
        output += line + '\n';
      }
    }

    return output;
  }

  private formatTime(seconds: number): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)},${ms.toString().padStart(3, '0')}`;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    return 1 - matrix[len1][len2] / maxLen;
  }
}