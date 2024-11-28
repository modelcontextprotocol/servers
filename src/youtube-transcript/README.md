# YouTube Transcript Server

A Model Context Protocol server that enables retrieval of transcripts from YouTube videos. This server provides direct access to video captions and subtitles through a simple interface.

## Components

### Tools

- **get_transcript**
  - Extract transcripts from YouTube videos
  - Inputs:
    - `url` (string, required): YouTube video URL or video ID
    - `lang` (string, optional, default: "en"): Language code for transcript (e.g., 'ko', 'en')

## Key Features

- Support for multiple video URL formats
- Language-specific transcript retrieval
- Detailed metadata in responses

## Configuration

To use with Claude Desktop, add this server configuration:

```json
{
  "mcpServers": {
    "youtube-transcript": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-youtube-transcript"]
    }
  }
}
```

## Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Setup

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

### Testing

```bash
npm test
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the MCP Inspector for development:

```bash
npm run inspector
```

## Error Handling

The server implements robust error handling for common scenarios:
- Invalid video URLs or IDs
- Unavailable transcripts
- Language availability issues
- Network errors

## Usage Examples

1. Get transcript by video URL:
```typescript
await server.callTool("get_transcript", {
  url: "https://www.youtube.com/watch?v=VIDEO_ID",
  lang: "en"
});
```

2. Get transcript by video ID:
```typescript
await server.callTool("get_transcript", {
  url: "VIDEO_ID",
  lang: "ko"
});
```

3. How to Extract YouTube Subtitles in Claude Desktop App
```
chat: https://youtu.be/ODaHJzOyVCQ?si=aXkJgso96Deri0aB Extract subtitles
```

## Security Considerations

The server:
- Validates all input parameters
- Handles YouTube API errors gracefully
- Implements timeouts for transcript retrieval
- Provides detailed error messages for troubleshooting

## License

This MCP server is licensed under the MIT License. See the LICENSE file for details.