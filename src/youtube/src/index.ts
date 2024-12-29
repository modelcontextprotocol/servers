import { MCPServer } from '@modelcontextprotocol/typescript-sdk';
import { VideoManagement } from './functions/videos';
import { PlaylistManagement } from './functions/playlists';
import { ChannelManagement } from './functions/channels';

export class YouTubeMCPServer extends MCPServer {
  constructor() {
    super();

    if (!process.env.YOUTUBE_API_KEY) {
      throw new Error('YOUTUBE_API_KEY must be provided');
    }

    this.registerFunctions(new VideoManagement());
    this.registerFunctions(new PlaylistManagement());
    this.registerFunctions(new ChannelManagement());
  }
}

if (require.main === module) {
  const server = new YouTubeMCPServer();
  server.start();
}