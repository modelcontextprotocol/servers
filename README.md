# Model Context Protocol (MCP) Servers

![NPM Version](https://img.shields.io/npm/v/%40modelcontextprotocol%2Fexample-servers)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A collection of reference implementations and community-contributed servers for the Model Context Protocol (MCP). This repository showcases the versatility and extensibility of MCP, demonstrating how it can be used to give Large Language Models (LLMs) secure, controlled access to external tools and data sources.

## 🌟 Featured Servers

- **[Filesystem](src/filesystem)** - Secure file operations with configurable access controls
- **[GitHub](src/github)** - Repository management, file operations, and GitHub API integration
- **[Google Drive](src/gdrive)** - File access and search capabilities for Google Drive
- **[PostgreSQL](src/postgres)** - Read-only database access with schema inspection
- **[Slack](src/slack)** - Channel management and messaging capabilities
- **[Memory](src/memory)** - Knowledge graph-based persistent memory system
- **[Puppeteer](src/puppeteer)** - Browser automation and web scraping
- **[Brave Search](src/brave-search)** - Web and local search using Brave's API
- **[Google Maps](src/google-maps)** - Location services, directions, and place details

## 🚀 Getting Started

### Installation

```bash
# Install all servers globally
npm install -g @modelcontextprotocol/servers

# Or install individual servers
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-filesystem
# etc...
```

### Usage

Each server can be run directly from the command line:

```bash
mcp-server-github
mcp-server-filesystem ~/allowed/path
mcp-server-postgres "postgresql://localhost/mydb"
```

## 🛠️ Creating Your Own Server

Interested in creating your own MCP server? Visit the official documentation at [modelcontextprotocol.io/introduction](https://modelcontextprotocol.io/introduction) for comprehensive guides, best practices, and technical details on implementing MCP servers.

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features to existing servers, or creating entirely new ones, here's how to contribute:

1. **Fork & Clone**:
   ```bash
   git clone https://github.com/your-username/mcp-servers.git
   cd mcp-servers
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Create Your Server**:
   - Add your server in `src/your-server-name/`
   - Include a comprehensive README.md
   - Follow the implementation guidelines from [modelcontextprotocol.io](https://modelcontextprotocol.io)

4. **Build & Test**:
   ```bash
   npm run build
   npm test
   ```

5. **Submit a Pull Request**:
   - Describe your changes in detail
   - Reference any related issues
   - Follow the existing code style

## 🔒 Security

See [SECURITY.md](SECURITY.md) for reporting security vulnerabilities.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💬 Community

- [Discord](https://discord.gg/modelcontextprotocol)
- [GitHub Discussions](https://github.com/modelcontextprotocol/servers/discussions)

## ⭐ Support

If you find MCP servers useful, please consider:
- Starring the repository
- Contributing new servers or improvements
- Sharing your experience with the community

---

Managed by Anthropic, but built together with the community. The Model Context Protocol is open source and we encourage everyone to contribute their own servers and improvements!