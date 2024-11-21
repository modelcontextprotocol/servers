# Model Context Protocol (MCP) Servers

![NPM Version](https://img.shields.io/npm/v/%40modelcontextprotocol%2Fexample-servers)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A collection of reference implementations and community-contributed servers for the Model Context Protocol (MCP). This repository showcases the versatility and extensibility of MCP, demonstrating how it can be used to give Large Language Models (LLMs) secure, controlled access to external tools and data sources.

## 🌟 Featured Servers

- **[SQLite](src/sqlite)** - Read and Write access to a local SQLite database with a helpful demo prompt to get started
- **[Filesystem](src/filesystem)** -  File operations with configurable access controls
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
1. Install Servers
```bash
# Install all servers globally
npm install -g @modelcontextprotocol/servers

# Or install individual servers
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-filesystem
# etc...
```
2. Configure Client (Claude Desktop)
```bash
# Open the claude_desktop_config.json
Interested in creating your own MCP server? Visit the official documentation at [modelcontextprotocol.io](https://modelcontextprotocol.io/introduction) for comprehensive guides, best practices, and technical details on implementing MCP servers.
{
  "mcpServers": {}
}
# Add the above servers and associated commands
{
  "mcpServers": {}
}
```



## 🛠️ Creating Your Own Server

Interested in creating your own MCP server? Visit the official documentation at [modelcontextprotocol.io/introduction](https://modelcontextprotocol.io/introduction) for comprehensive guides, best practices, and technical details on implementing MCP servers.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for information about how you can contribute to the MCP servers repository.

## 🔒 Security

See [SECURITY.md](SECURITY.md) for reporting security vulnerabilities.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💬 Community

- [GitHub Discussions](https://github.com/modelcontextprotocol/servers/discussions)

## ⭐ Support

If you find MCP servers useful, please consider:
- Starring the repository
- Contributing new servers or improvements
- Sharing your experience with the community

---

Managed by Anthropic, but built together with the community. The Model Context Protocol is open source and we encourage everyone to contribute their own servers and improvements!
