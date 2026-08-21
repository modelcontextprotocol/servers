# OpenLM MCP Server

Query license usage, allocations, and analytics data directly through Claude using the OpenLM MCP Server.

## Overview

The OpenLM MCP Server exposes 43 powerful tools that enable Claude users to access their OpenLM license management data through natural conversation. Users can query license usage metrics, view allocations, and access detailed analytics without leaving Claude.

## Features

- **43 Tools** for license management queries
- **License Usage Queries** - Real-time consumption metrics and trends
- **Allocations** - View and manage license assignments
- **Analytics & Reporting** - Comprehensive dashboards and data exports
- **OAuth 2.0 Authentication** - Secure, credential-based access
- **Read-Only Access** - Safe exploration of license data

## Authentication

The server uses OAuth 2.0 authentication with OpenLM credentials. Users authenticate once in Claude and gain access to all their OpenLM license data with read-only permissions.

## Setup

1. Add the OpenLM connector in Claude Settings → Connectors
2. Authenticate with your OpenLM credentials
3. Grant permission for license data access
4. Start querying your license data!

For detailed setup instructions, see [SETUP.md](./SETUP.md)

## Available Tools

### License Usage (15 tools)
- Query current license usage
- View usage trends and analytics
- Analyze consumption patterns
- Compare usage across departments

### Allocations (14 tools)
- View current allocations
- See allocation assignments
- Track allocation history
- Manage user assignments

### Analytics & Reporting (14 tools)
- Generate custom reports
- Access pre-built dashboards
- Export data in multiple formats
- Visualize license metrics

## Example Queries

Once connected, you can ask Claude questions like:

- "What's our current license usage?"
- "Show me our license allocations"
- "Generate a usage report for this quarter"
- "Which licenses are running low?"
- "What's our license utilization rate?"
- "Compare our usage to allocations"

## Support

- **Documentation**: https://www.openlm.com/docs/mcp-server
- **Support Email**: support@openlm.com
- **Issues**: Report problems on GitHub

## About OpenLM

OpenLM is the industry-leading platform for AI and software license management. Learn more at https://www.openlm.com

## License

Proprietary - OpenLM

---

**Protocol**: Model Context Protocol (MCP)  
**Version**: 0.1.0  
**Author**: OpenLM  
**Last Updated**: August 2026
