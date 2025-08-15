# Academiadepolitie.com MCP Server

A Model Context Protocol server that provides AI tutoring capabilities for Romanian police academy entrance exam preparation.

<a href="https://glama.ai/mcp/servers/academiadepolitie-com"><img width="380" height="200" src="https://glama.ai/mcp/servers/academiadepolitie-com/badge" alt="Academiadepolitie.com MCP server" /></a>

## Overview

This MCP server connects Claude to the Academiadepolitie.com educational platform, serving over 50,000 students preparing for entrance exams to Romanian law enforcement institutions (Police, Gendarmerie, Firefighters, Border Police).

The platform provides comprehensive study materials, personalized learning analytics, and AI-driven tutoring for subjects including Criminal Law, Constitutional Law, Logic, Administrative Law, and other topics essential for law enforcement careers in Romania.

### Key Features

- **Student Analytics**: Comprehensive learning progress analysis and knowledge gap identification
- **Content Search**: Fuzzy search across 5,000+ educational articles and lessons
- **Learning Tools**: Note-taking, progress tracking, and AI-generated quiz systems
- **Peer Collaboration**: Student matching and challenge systems for collaborative learning
- **Personalized Learning**: AI-driven recommendations based on individual performance data

## Tools

### Student Data & Analytics
- `get_student_data` - Comprehensive student profile and learning analytics
- `update_reading_progress` - Track granular reading progress across educational content

### Content Management  
- `search_articles` - Search educational articles with fuzzy matching on titles
- `get_article_content` - Retrieve paginated article content (5000 words/page)
- `add_note` - Add personal notes to articles and lessons

### Learning & Collaboration
- `send_challenge` - Send learning challenges between students for competitive studying
- `save_generated_quiz` - Save AI-generated quizzes to the platform for future practice

## Installation

### Prerequisites
- Node.js 18 or higher
- Valid Academiadepolitie.com account and API token

### Claude Desktop

Add the server config to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "academiadepolitie-com": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-academiadepolitie-com"
      ],
      "env": {
        "ACADEMIADEPOLITIE_JWT_TOKEN": "your-jwt-token-here"
      }
    }
  }
}
```

### Getting Your JWT Token

1. Visit [Academiadepolitie.com](https://www.academiadepolitie.com)
2. Create an account or log in to your existing account
3. Navigate to Account Settings → API Access
4. Generate a new JWT token for MCP integration
5. Copy the token and add it to your Claude configuration

## Usage Examples

### Analyze Student Performance
```
Can you analyze my learning progress and identify areas where I need to focus more for my police academy entrance exam?
```

### Search for Specific Topics  
```
Find articles about "procedura penală" (criminal procedure) and show me the most relevant ones for my exam preparation.
```

### Generate Practice Questions
```
Based on the constitutional law article I just read, create 5 practice questions and save them for later review.
```

### Track Reading Progress
```
I just finished reading 75% of the criminal law fundamentals article. Please update my progress.
```

### Find Study Partners
```
Find other students who are strong in areas where I'm struggling, so we can help each other prepare for the entrance exams.
```

## Technical Details

### Remote MCP Server
This is a **Remote MCP Server** that runs on dedicated infrastructure and connects to Claude via HTTP/SSE transport with OAuth 2.1 authentication. It supports both Claude Desktop and Claude Web.

### API Integration
The server integrates with the Academiadepolitie.com internal API endpoints:
- Educational content management system with 5,000+ articles
- Student progress tracking database with granular analytics
- Quiz and assessment generation engine powered by AI
- Peer matching and collaboration tools for study groups

### Authentication & Security
- OAuth 2.1 with PKCE (RFC 7636) for secure authentication
- JWT tokens for API access with audience validation
- Rate limiting and CORS protection
- Full MCP Auth Spec 2025-06-18 compliance

## Development

### Local Development
```bash
# Clone the repository
git clone https://github.com/modelcontextprotocol/servers.git
cd servers/src/academiadepolitie-com

# Install dependencies
npm install

# Set environment variables
export ACADEMIADEPOLITIE_JWT_TOKEN="your-jwt-token"
export API_BASE_URL="https://www.academiadepolitie.com/api/internal"

# Run the server
npm run dev
```

### Docker Support
```bash
# Build the image
docker build -t academiadepolitie-com-mcp .

# Run with environment variables
docker run -e ACADEMIADEPOLITIE_JWT_TOKEN="your-token" -p 3000:3000 academiadepolitie-com-mcp
```

## Use Cases

This MCP server is particularly valuable for:

1. **Romanian Law Enforcement Students** - Preparing for entrance exams to Police Academy, Gendarmerie, Firefighters
2. **Educational Institutions** - Providing AI-enhanced tutoring for law enforcement subjects
3. **Study Groups** - Collaborative learning with peer matching and challenges
4. **Personalized Learning** - AI-driven recommendations based on individual learning patterns

## Supported Subjects

- **Criminal Law** (Drept Penal) - Fundamental concepts, infractions, penalties
- **Constitutional Law** (Drept Constituțional) - Romanian constitution, state organization  
- **Administrative Law** (Drept Administrativ) - Public administration, procedures
- **Logic** (Logică) - Formal logic, reasoning, critical thinking
- **General Culture** (Cultură Generală) - Romanian history, geography, institutions

## Contributing

We welcome contributions! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues or questions:
- **GitHub Issues**: [Report a bug](https://github.com/modelcontextprotocol/servers/issues)
- **Email**: contact@academiadepolitie.com
- **Documentation**: [API Docs](https://www.academiadepolitie.com/api/docs)
- **Website**: [Academiadepolitie.com](https://www.academiadepolitie.com)

---

**Note**: This server is designed specifically for students of Romanian law enforcement institutions. Some features may require active enrollment in preparation programs. The platform currently serves over 50,000 active students with a proven 87% success rate for exam preparation.