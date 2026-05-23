# Model Context Protocol servers

This repository is a collection of *reference implementations* for the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), as well as references to community-built servers and additional resources.

> [!IMPORTANT]
> If you are looking for a list of MCP servers, you can browse published servers on [the MCP Registry](https://registry.modelcontextprotocol.io/). The repository served by this README is dedicated to housing just the small number of reference servers maintained by the MCP steering group.

> [!WARNING]
> The servers in this repository are intended as **reference implementations** to demonstrate MCP features and SDK usage. They are meant to serve as educational examples for developers building their own MCP servers, not as production-ready solutions. Developers should evaluate their own security requirements and implement appropriate safeguards based on their specific threat model and use case.

The servers in this repository showcase the versatility and extensibility of MCP, demonstrating how it can be used to give Large Language Models (LLMs) secure, controlled access to tools and data sources.
Typically, each MCP server is implemented with an MCP SDK:

- [C# MCP SDK](https://github.com/modelcontextprotocol/csharp-sdk)
- [Go MCP SDK](https://github.com/modelcontextprotocol/go-sdk)
- [Java MCP SDK](https://github.com/modelcontextprotocol/java-sdk)
- [Kotlin MCP SDK](https://github.com/modelcontextprotocol/kotlin-sdk)
- [PHP MCP SDK](https://github.com/modelcontextprotocol/php-sdk)
- [Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Ruby MCP SDK](https://github.com/modelcontextprotocol/ruby-sdk)
- [Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk)
- [Swift MCP SDK](https://github.com/modelcontextprotocol/swift-sdk)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## 🌟 Reference Servers

These servers aim to demonstrate MCP features and the official SDKs.

- **[Everything](src/everything)** - Reference / test server with prompts, resources, and tools.
- **[Fetch](src/fetch)** - Web content fetching and conversion for efficient LLM usage.
- **[Filesystem](src/filesystem)** - Secure file operations with configurable access controls.
- **[Git](src/git)** - Tools to read, search, and manipulate Git repositories.
- **[Memory](src/memory)** - Knowledge graph-based persistent memory system.
- **[Sequential Thinking](src/sequentialthinking)** - Dynamic and reflective problem-solving through thought sequences.
- **[Time](src/time)** - Time and timezone conversion capabilities.

### Archived

The following reference servers are now archived and can be found at [servers-archived](https://github.com/modelcontextprotocol/servers-archived).

- **[AWS KB Retrieval](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/aws-kb-retrieval-server)** - Retrieval from AWS Knowledge Base using Bedrock Agent Runtime.
- **[Brave Search](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search)** - Web and local search using Brave's Search API.  Has been replaced by the [official server](https://github.com/brave/brave-search-mcp-server).
- **[EverArt](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/everart)** - AI image generation using various models.
- **[GitHub](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github)** - Repository management, file operations, and GitHub API integration.
- **[GitLab](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gitlab)** - GitLab API, enabling project management.
- **[Google Drive](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive)** - File access and search capabilities for Google Drive.
- **[Google Maps](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/google-maps)** - Location services, directions, and place details.
- **[PostgreSQL](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres)** - Read-only database access with schema inspection.
- **[Puppeteer](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer)** - Browser automation and web scraping.
- **[Redis](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/redis)** - Interact with Redis key-value stores.
- **[Sentry](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sentry)** - Retrieving and analyzing issues from Sentry.io.
- **[Slack](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack)** - Channel management and messaging capabilities. Now maintained by [Zencoder](https://github.com/zencoderai/slack-mcp-server)
- **[SQLite](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite)** - Database interaction and business intelligence capabilities.

## 📚 Frameworks

These are high-level frameworks that make it easier to build MCP servers or clients.

### For servers

* **[Anubis MCP](https://github.com/zoedsoupe/anubis-mcp)** (Elixir) - A high-performance and high-level Model Context Protocol (MCP) implementation in Elixir. Think like "Live View" for MCP.
* **[ModelFetch](https://github.com/phuctm97/modelfetch/)** (TypeScript) - Runtime-agnostic SDK to create and deploy MCP servers anywhere TypeScript/JavaScript runs
* **[EasyMCP](https://github.com/zcaceres/easy-mcp/)** (TypeScript)
* **[FastAPI to MCP auto generator](https://github.com/tadata-org/fastapi_mcp)** – A zero-configuration tool for automatically exposing FastAPI endpoints as MCP tools by **[Tadata](https://tadata.com/)**
* **[FastMCP](https://github.com/punkpeye/fastmcp)** (TypeScript)
* **[Foobara MCP Connector](https://github.com/foobara/mcp-connector)** - Easily expose Foobara commands written in Ruby as tools via MCP
* **[Foxy Contexts](https://github.com/strowk/foxy-contexts)** – A library to build MCP servers in Golang by **[strowk](https://github.com/strowk)**
* **[Higress MCP Server Hosting](https://github.com/alibaba/higress/tree/main/plugins/wasm-go/mcp-servers)** - A solution for hosting MCP Servers by extending the API Gateway (based on Envoy) with wasm plugins.
* **[MCP Declarative Java SDK](https://github.com/codeboyzhou/mcp-declarative-java-sdk)** Annotation-driven MCP servers development with Java, no Spring Framework Required, minimize dependencies as much as possible.
* **[MCP-Framework](https://mcp-framework.com)** Build MCP servers with elegance and speed in TypeScript. Comes with a CLI to create your project with `mcp create app`. Get started with your first server in under 5 minutes by **[Alex Andru](https://github.com/QuantGeekDev)**
* **[MCP Plexus](https://github.com/Super-I-Tech/mcp_plexus)**: A secure, **multi-tenant** and Multi-user MCP python server framework built to integrate easily with external services via OAuth 2.1, offering scalable and robust solutions for managing complex AI applications.
* **[mcp_sse (Elixir)](https://github.com/kEND/mcp_sse)** An SSE implementation in Elixir for rapidly creating MCP servers.
* **[mxcp](https://github.com/raw-labs/mxcp)** (Python) - Open-source framework for building enterprise-grade MCP servers using just YAML, SQL, and Python, with built-in auth, monitoring, ETL and policy enforcement.
* **[Next.js MCP Server Template](https://github.com/vercel-labs/mcp-for-next.js)** (Typescript) - A starter Next.js project that uses the MCP Adapter to allow MCP clients to connect and access resources.
* **[PayMCP](https://github.com/blustAI/paymcp)** (Python & TypeScript) - Lightweight payments layer for MCP servers: turn tools into paid endpoints with a two-line decorator. [PyPI](https://pypi.org/project/paymcp/) · [npm](https://www.npmjs.com/package/paymcp) · [TS repo](https://github.com/blustAI/paymcp-ts)
* **[Perl SDK](https://github.com/mojolicious/mojo-mcp)** - An SDK for building MCP servers and clients with the Perl programming language.
* **[Quarkus MCP Server SDK](https://github.com/quarkiverse/quarkus-mcp-server)** (Java)
- **[R mcptools](https://github.com/posit-dev/mcptools)** - An R SDK for creating R-based MCP servers and retrieving functionality from third-party MCP servers as R functions.
* **[SAP ABAP MCP Server SDK](https://github.com/abap-ai/mcp)** - Build SAP ABAP based MCP servers. ABAP 7.52 based with 7.02 downport; runs on R/3 & S/4HANA on-premises, currently not cloud-ready.
* **[Spring AI MCP Server](https://docs.spring.io/spring-ai/reference/api/mcp/mcp-server-boot-starter-docs.html)** - Provides auto-configuration for setting up an MCP server in Spring Boot applications.
* **[Template MCP Server](https://github.com/mcpdotdirect/template-mcp-server)** - A CLI tool to create a new Model Context Protocol server project with TypeScript support, dual transport options, and an extensible structure
* **[AgentR Universal MCP SDK](https://github.com/universal-mcp/universal-mcp)** - A python SDK to build MCP Servers with inbuilt credential management by **[Agentr](https://agentr.dev/home)**
* **[Vercel MCP Adapter](https://github.com/vercel/mcp-adapter)** (TypeScript) - A simple package to start serving an MCP server on most major JS meta-frameworks including Next, Nuxt, Svelte, and more.
* **[PHP MCP Server](https://github.com/php-mcp/server)** (PHP) - Core PHP implementation for the Model Context Protocol (MCP) server

### For clients

* **[codemirror-mcp](https://github.com/marimo-team/codemirror-mcp)** - CodeMirror extension that implements the Model Context Protocol (MCP) for resource mentions and prompt commands
* **[llm-analysis-assistant](https://github.com/xuzexin-hz/llm-analysis-assistant)** <img height="12" width="12" src="https://raw.githubusercontent.com/xuzexin-hz/llm-analysis-assistant/refs/heads/main/src/llm_analysis_assistant/pages/html/imgs/favicon.ico" alt="Langfuse Logo" /> - A very streamlined mcp client that supports calling and monitoring stdio/sse/streamableHttp, and can also view request responses through the /logs page. It also supports monitoring and simulation of ollama/openai interface.
* **[MCP-Agent](https://github.com/lastmile-ai/mcp-agent)** - A simple, composable framework to build agents using Model Context Protocol by **[LastMile AI](https://www.lastmileai.dev)**
* **[Spring AI MCP Client](https://docs.spring.io/spring-ai/reference/api/mcp/mcp-client-boot-starter-docs.html)** - Provides auto-configuration for MCP client functionality in Spring Boot applications.
* **[MCP CLI Client](https://github.com/vincent-pli/mcp-cli-host)** - A CLI host application that enables Large Language Models (LLMs) to interact with external tools through the Model Context Protocol (MCP).
* **[OpenMCP Client](https://github.com/LSTM-Kirigaya/openmcp-client/)** - An all-in-one vscode/trae/cursor plugin for MCP server debugging. [Document](https://kirigaya.cn/openmcp/) & [OpenMCP SDK](https://kirigaya.cn/openmcp/sdk-tutorial/).
* **[PHP MCP Client](https://github.com/php-mcp/client)** - Core PHP implementation for the Model Context Protocol (MCP) Client
* **[Runbear](https://runbear.io/solutions/integrations/slack/mcp)** - No-code MCP client for team chat platforms, such as Slack, Microsoft Teams, and Discord.

## 📚 Resources

Additional resources on MCP.

- **[A2A-MCP Java Bridge](https://github.com/vishalmysore/a2ajava)** - A2AJava brings powerful A2A-MCP integration directly into your Java applications. It enables developers to annotate standard Java methods and instantly expose them as MCP Server, A2A-discoverable actions — with no boilerplate or service registration overhead.
- **[AiMCP](https://www.aimcp.info)** - A collection of MCP clients&servers to find the right mcp tools by **[Hekmon](https://github.com/hekmon8)**
- **[Awesome Crypto MCP Servers by badkk](https://github.com/badkk/awesome-crypto-mcp-servers)** - A curated list of MCP servers by **[Luke Fan](https://github.com/badkk)**
- **[Awesome MCP Servers by appcypher](https://github.com/appcypher/awesome-mcp-servers)** - A curated list of MCP servers by **[Stephen Akinyemi](https://github.com/appcypher)**
- **[Awesome MCP Servers by punkpeye](https://github.com/punkpeye/awesome-mcp-servers)** (**[website](https://glama.ai/mcp/servers)**) - A curated list of MCP servers by **[Frank Fiegel](https://github.com/punkpeye)**
- **[Awesome MCP Servers by wong2](https://github.com/wong2/awesome-mcp-servers)** (**[website](https://mcpservers.org)**) - A curated list of MCP servers by **[wong2](https://github.com/wong2)**
- **[Awesome Remote MCP Servers by JAW9C](https://github.com/jaw9c/awesome-remote-mcp-servers)** - A curated list of **remote** MCP servers, including their authentication support by **[JAW9C](https://github.com/jaw9c)**
- **[Discord Server](https://glama.ai/mcp/discord)** – A community discord server dedicated to MCP by **[Frank Fiegel](https://github.com/punkpeye)**
- **[Install This MCP](https://installthismcp.com)** - Reduce Installation Friction with beautiful installation guides
- <img height="12" width="12" src="https://raw.githubusercontent.com/klavis-ai/klavis/main/static/klavis-ai.png" alt="Klavis Logo" /> **[Klavis AI](https://www.klavis.ai)** - Open Source MCP Infra. Hosted MCP servers and MCP clients on Slack and Discord.
- **[MCP Badges](https://github.com/mcpx-dev/mcp-badges)** – Quickly highlight your MCP project with clear, eye-catching badges, by **[Ironben](https://github.com/nanbingxyz)**
- <img height="12" width="12" src="https://mcpproxy.app/favicon.svg" alt="MCPProxy Logo" /> **[MCPProxy](https://github.com/smart-mcp-proxy/mcpproxy-go)** - Open-source local app that enables access to multiple MCP servers and thousands of tools with intelligent discovery via MCP protocol, runs servers in isolated environments, and features automatic quarantine protection against malicious tools.
- **[MCPRepository.com](https://mcprepository.com/)** - A repository that indexes and organizes all MCP servers for easy discovery.
- **[mcp-cli](https://github.com/wong2/mcp-cli)** - A CLI inspector for the Model Context Protocol by **[wong2](https://github.com/wong2)**
- **[mcp-dockmaster](https://mcp-dockmaster.com)** - An Open-Sourced UI to install and manage MCP servers for Windows, Linux and macOS.
- **[mcp-get](https://mcp-get.com)** - Command line tool for installing and managing MCP servers by **[Michael Latman](https://github.com/michaellatman)**
- **[mcp-guardian](https://github.com/eqtylab/mcp-guardian)** - GUI application + tools for proxying / managing control of MCP servers by **[EQTY Lab](https://eqtylab.io)**
- **[MCP Linker](https://github.com/milisp/mcp-linker)** - A cross-platform Tauri GUI tool for one-click setup and management of MCP servers, supporting Claude Desktop, Cursor, Windsurf, VS Code, Cline, and Neovim.
- **[mcp-manager](https://github.com/zueai/mcp-manager)** - Simple Web UI to install and manage MCP servers for Claude Desktop by **[Zue](https://github.com/zueai)**
- **[MCP Marketplace Web Plugin](https://github.com/AI-Agent-Hub/mcp-marketplace)** MCP Marketplace is a small Web UX plugin to integrate with AI applications, Support various MCP Server API Endpoint (e.g pulsemcp.com/deepnlp.org and more). Allowing user to browse, paginate and select various MCP servers by different categories. [Pypi](https://pypi.org/project/mcp-marketplace) | [Maintainer](https://github.com/AI-Agent-Hub) | [Website](http://www.deepnlp.org/store/ai-agent/mcp-server)
- **[mcp.natoma.ai](https://mcp.natoma.ai)** – A Hosted MCP Platform to discover, install, manage and deploy MCP servers by **[Natoma Labs](https://www.natoma.ai)**
- **[mcp.run](https://mcp.run)** - A hosted registry and control plane to install & run secure + portable MCP Servers.
- **[MCPHub](https://www.mcphub.com)** - Website to list high quality MCP servers and reviews by real users. Also provide online chatbot for popular LLM models with MCP server support.
- **[MCP Router](https://mcp-router.net)** – Free Windows and macOS app that simplifies MCP management while providing seamless app authentication and powerful log visualization by **[MCP Router](https://github.com/mcp-router/mcp-router)**
- **[MCP Servers Hub](https://github.com/apappascs/mcp-servers-hub)** (**[website](https://mcp-servers-hub-website.pages.dev/)**) - A curated list of MCP servers by **[apappascs](https://github.com/apappascs)**
- **[MCPServers.com](https://mcpservers.com)** - A growing directory of high-quality MCP servers with clear setup guides for a variety of MCP clients. Built by the team behind the **[Highlight MCP client](https://highlightai.com/)**
- **[MCP Servers Rating and User Reviews](http://www.deepnlp.org/store/ai-agent/mcp-server)** - Website to rate MCP servers, write authentic user reviews, and [search engine for agent & mcp](http://www.deepnlp.org/search/agent)
- **[MCP Sky](https://bsky.app/profile/brianell.in/feed/mcp)** - Bluesky feed for MCP related news and discussion by **[@brianell.in](https://bsky.app/profile/brianell.in)**
- **[MCP X Community](https://x.com/i/communities/1861891349609603310)** – A X community for MCP by **[Xiaoyi](https://x.com/chxy)**
- **[MCPHub](https://github.com/Jeamee/MCPHub-Desktop)** – An Open Source macOS & Windows GUI Desktop app for discovering, installing and managing MCP servers by **[Jeamee](https://github.com/jeamee)**
- **[mcpm](https://github.com/pathintegral-institute/mcpm.sh)** ([website](https://mcpm.sh)) - MCP Manager (MCPM) is a Homebrew-like service for managing Model Context Protocol (MCP) servers across clients by **[Pathintegral](https://github.com/pathintegral-institute)**
- **[MCPVerse](https://mcpverse.dev)** - A portal for creating & hosting authenticated MCP servers and connecting to them securely.
- **[MCP Servers Search](https://github.com/atonomus/mcp-servers-search)** - An MCP server that provides tools for querying and discovering available MCP servers from this list.
- **[Search MCP Server](https://github.com/krzysztofkucmierz/search-mcp-server)** - Recommends the most relevant MCP servers based on the client's query by searching this README file.
- **[MCPWatch](https://github.com/kapilduraphe/mcp-watch)** - A comprehensive security scanner for Model Context Protocol (MCP) servers that detects vulnerabilities and security issues in your MCP server implementations.
- <img height="12" width="12" src="https://mkinf.io/favicon-lilac.png" alt="mkinf Logo" /> **[mkinf](https://mkinf.io)** - An Open Source registry of hosted MCP Servers to accelerate AI agent workflows.
- **[Open-Sourced MCP Servers Directory](https://github.com/chatmcp/mcp-directory)** - A curated list of MCP servers by **[mcpso](https://mcp.so)**
- <img height="12" width="12" src="https://opentools.com/favicon.ico" alt="OpenTools Logo" /> **[OpenTools](https://opentools.com)** - An open registry for finding, installing, and building with MCP servers by **[opentoolsteam](https://github.com/opentoolsteam)**
- **[Programmatic MCP Prototype](https://github.com/domdomegg/programmatic-mcp-prototype)** - Experimental agent prototype demonstrating programmatic MCP tool composition, progressive tool discovery, state persistence, and skill building through TypeScript code execution by **[Adam Jones](https://github.com/domdomegg)**
- **[PulseMCP](https://www.pulsemcp.com)** ([API](https://www.pulsemcp.com/api)) - Community hub & weekly newsletter for discovering MCP servers, clients, articles, and news by **[Tadas Antanavicius](https://github.com/tadasant)**, **[Mike Coughlin](https://github.com/macoughl)**, and **[Ravina Patel](https://github.com/ravinahp)**
- **[r/mcp](https://www.reddit.com/r/mcp)** – A Reddit community dedicated to MCP by **[Frank Fiegel](https://github.com/punkpeye)**
- **[MCP.ing](https://mcp.ing/)** - A list of MCP services for discovering MCP servers in the community and providing a convenient search function for MCP services by **[iiiusky](https://github.com/iiiusky)**
- **[MCP Hunt](https://mcp-hunt.com)** - Realtime platform for discovering trending MCP servers with momentum tracking, upvoting, and community discussions - like Product Hunt meets Reddit for MCP
- **[Smithery](https://smithery.ai/)** - A registry of MCP servers to find the right tools for your LLM agents by **[Henry Mao](https://github.com/calclavia)**
- **[Toolbase](https://gettoolbase.ai)** - Desktop application that manages tools and MCP servers with just a few clicks - no coding required by **[gching](https://github.com/gching)**
- **[ToolHive](https://github.com/StacklokLabs/toolhive)** - A lightweight utility designed to simplify the deployment and management of MCP servers, ensuring ease of use, consistency, and security through containerization by **[StacklokLabs](https://github.com/StacklokLabs)**
- **[NetMind](https://www.netmind.ai/AIServices)** - Access powerful AI services via simple APIs or MCP servers to supercharge your productivity.
- **[Webrix MCP Gateway](https://github.com/webrix-ai/secure-mcp-gateway)** - Enterprise MCP gateway with SSO, RBAC, audit trails, and token vaults for secure, centralized AI agent access control. Deploy via Helm charts on-premise or in your cloud. [webrix.ai](https://webrix.ai)



## 🚀 Getting Started

### Using MCP Servers in this Repository
TypeScript-based servers in this repository can be used directly with `npx`.

For example, this will start the [Memory](src/memory) server:
```sh
npx -y @modelcontextprotocol/server-memory
```

Python-based servers in this repository can be used directly with [`uvx`](https://docs.astral.sh/uv/concepts/tools/) or [`pip`](https://pypi.org/project/pip/). `uvx` is recommended for ease of use and setup.

For example, this will start the [Git](src/git) server:
```sh
# With uvx
uvx mcp-server-git

# With pip
pip install mcp-server-git
python -m mcp_server_git
```

Follow [these](https://docs.astral.sh/uv/getting-started/installation/) instructions to install `uv` / `uvx` and [these](https://pip.pypa.io/en/stable/installation/) to install `pip`.

### Using an MCP Client
However, running a server on its own isn't very useful, and should instead be configured into an MCP client. For example, here's the Claude Desktop configuration to use the above server:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

On Windows, wrap `npx` with `cmd /c`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

Additional examples of using the Claude Desktop as an MCP client might look like:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "path/to/git/repo"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

On Windows, apply the same wrapper to each `npx`-based entry above by changing `"command"` to `"cmd"` and prepending `"/c", "npx"` to the existing `args`. Leave `uvx` entries unchanged.

## 🛠️ Creating Your Own Server

Interested in creating your own MCP server? Visit the official documentation at [modelcontextprotocol.io](https://modelcontextprotocol.io/introduction) for comprehensive guides, best practices, and technical details on implementing MCP servers.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for information about contributing to this repository.

## 🔒 Security

See [SECURITY.md](SECURITY.md) for reporting security vulnerabilities.

## 📜 License

This project is licensed under the Apache License, Version 2.0 for new contributions, with existing code under MIT - see the [LICENSE](LICENSE) file for details.

## 💬 Community

- [GitHub Discussions](https://github.com/orgs/modelcontextprotocol/discussions)

## ⭐ Support

If you find MCP servers useful, please consider starring the repository and contributing new servers or improvements!

---

Managed by Anthropic, but built together with the community. The Model Context Protocol is open source and we encourage everyone to contribute their own servers and improvements!
