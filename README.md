# Model Context Protocol servers

This repository is a collection of *reference implementations* for the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), as well as references
to community built servers and additional resources.

The servers in this repository showcase the versatility and extensibility of MCP, demonstrating how it can be used to give Large Language Models (LLMs) secure, controlled access to tools and data sources.
Each MCP server is implemented with either the [Typescript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) or [Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk).

> Note: Lists in this README are maintained in alphabetical order to minimize merge conflicts when adding new items.

## 🌟 Reference Servers

These servers aim to demonstrate MCP features and the TypeScript and Python SDKs.

- **[AWS KB Retrieval](src/aws-kb-retrieval-server)** - Retrieval from AWS Knowledge Base using Bedrock Agent Runtime
- **[Brave Search](src/brave-search)** - Web and local search using Brave's Search API
- **[EverArt](src/everart)** - AI image generation using various models
- **[Everything](src/everything)** - Reference / test server with prompts, resources, and tools
- **[Fetch](src/fetch)** - Web content fetching and conversion for efficient LLM usage
- **[Filesystem](src/filesystem)** - Secure file operations with configurable access controls
- **[Git](src/git)** - Tools to read, search, and manipulate Git repositories
- **[GitHub](src/github)** - Repository management, file operations, and GitHub API integration
- **[GitLab](src/gitlab)** - GitLab API, enabling project management
- **[Google Drive](src/gdrive)** - File access and search capabilities for Google Drive
- **[Google Maps](src/google-maps)** - Location services, directions, and place details
- **[Memory](src/memory)** - Knowledge graph-based persistent memory system
- **[PostgreSQL](src/postgres)** - Read-only database access with schema inspection
- **[Puppeteer](src/puppeteer)** - Browser automation and web scraping
- **[Redis](src/redis)** - Interact with Redis key-value stores
- **[Sentry](src/sentry)** - Retrieving and analyzing issues from Sentry.io
- **[Sequential Thinking](src/sequentialthinking)** - Dynamic and reflective problem-solving through thought sequences
- **[Slack](src/slack)** - Channel management and messaging capabilities
- **[Sqlite](src/sqlite)** - Database interaction and business intelligence capabilities
- **[Time](src/time)** - Time and timezone conversion capabilities

## 🤝 Third-Party Servers

### 🎖️ Official Integrations

Official integrations are maintained by companies building production ready MCP servers for their platforms.

- <img height="12" width="12" src="https://www.21st.dev/favicon.ico" alt="21st.dev Logo" /> **[21st.dev Magic](https://github.com/21st-dev/magic-mcp)** - Create crafted UI components inspired by the best 21st.dev design engineers.
- <img height="12" width="12" src="https://www.agentql.com/favicon/favicon.png" alt="AgentQL Logo" /> **[AgentQL](https://github.com/tinyfish-io/agentql-mcp)** - Enable AI agents to get structured data from unstructured web with [AgentQL](https://www.agentql.com/).
- <img height="12" width="12" src="https://apify.com/favicon.ico" alt="Apify Logo" /> **[Apify](https://github.com/apify/actors-mcp-server)** - [Actors MCP Server](https://apify.com/apify/actors-mcp-server): Use 3,000+ pre-built cloud tools to extract data from websites, e-commerce, social media, search engines, maps, and more
- <img height="12" width="12" src="https://resources.audiense.com/hubfs/favicon-1.png" alt="Audiense Logo" /> **[Audiense Insights](https://github.com/AudienseCo/mcp-audiense-insights)** - Marketing insights and audience analysis from [Audiense](https://www.audiense.com/products/audiense-insights) reports, covering demographic, cultural, influencer, and content engagement analysis.
- <img height="12" width="12" src="https://axiom.co/favicon.ico" alt="Axiom Logo" /> **[Axiom](https://github.com/axiomhq/mcp-server-axiom)** - Query and analyze your Axiom logs, traces, and all other event data in natural language
- <img height="12" width="12" src="https://www.bankless.com/favicon.ico" alt="Bankless Logo" /> **[Bankless Onchain](https://github.com/bankless/onchain-mcp)** - Query Onchain data, like ERC20 tokens, transaction history, smart contract state.
- <img height="12" width="12" src="https://browserbase.com/favicon.ico" alt="Browserbase Logo" /> **[Browserbase](https://github.com/browserbase/mcp-server-browserbase)** - Automate browser interactions in the cloud (e.g. web navigation, data extraction, form filling, and more)
- <img height="12" width="12" src="https://trychroma.com/_next/static/media/chroma-logo.ae2d6e4b.svg" /> **[Chroma](https://github.com/chroma-core/chroma-mcp)** - Embeddings, vector search, document storage, and full-text search with the open-source AI application database
- <img height="12" width="12" src="https://www.chronulus.com/favicon/chronulus-logo-blue-on-alpha-square-128x128.ico" alt="Chronulus AI Logo" /> **[Chronulus AI](https://github.com/ChronulusAI/chronulus-mcp)** - Predict anything with Chronulus AI forecasting and prediction agents.
- <img height="12" width="12" src="https://clickhouse.com/favicon.ico" alt="ClickHouse Logo" /> **[ClickHouse](https://github.com/ClickHouse/mcp-clickhouse)** - Query your [ClickHouse](https://clickhouse.com/) database server.
- <img height="12" width="12" src="https://cdn.simpleicons.org/cloudflare" /> **[Cloudflare](https://github.com/cloudflare/mcp-server-cloudflare)** - Deploy, configure & interrogate your resources on the Cloudflare developer platform (e.g. Workers/KV/R2/D1)
- <img height="12" width="12" src="https://www.comet.com/favicon.ico" alt="Comet Logo" /> **[Comet Opik](https://github.com/comet-ml/opik-mcp)** - Query and analyze your [Opik](https://github.com/comet-ml/opik) logs, traces, prompts and all other telemtry data from your LLMs in natural language.
- <img height="12" width="12" src="https://www.convex.dev/favicon.ico" /> **[Convex](https://stack.convex.dev/convex-mcp-server)** - Introspect and query your apps deployed to Convex.
- <img height="12" width="12" src="http://app.itsdart.com/static/img/favicon.png" alt="Dart Logo" /> **[Dart](https://github.com/its-dart/dart-mcp-server)** - Interact with task, doc, and project data in [Dart](https://itsdart.com), an AI-native project management tool
- <img height="12" width="12" src="https://e2b.dev/favicon.ico" alt="E2B Logo" /> **[E2B](https://github.com/e2b-dev/mcp-server)** - Run code in secure sandboxes hosted by [E2B](https://e2b.dev)
- <img height="12" width="12" src="https://static.edubase.net/media/brand/favicon/favicon-32x32.png" alt="EduBase Logo" /> **[EduBase](https://github.com/EduBase/MCP)** - Interact with [EduBase](https://www.edubase.net), a comprehensive e-learning platform with advanced quizzing, exam management, and content organization capabilities
- <img height="12" width="12" src="https://esignatures.com/favicon.ico" alt="eSignatures Logo" /> **[eSignatures](https://github.com/esignaturescom/mcp-server-esignatures)** - Contract and template management for drafting, reviewing, and sending binding contracts.
- <img height="12" width="12" src="https://exa.ai/images/favicon-32x32.png" alt="Exa Logo" /> **[Exa](https://github.com/exa-labs/exa-mcp-server)** - Search Engine made for AIs by [Exa](https://exa.ai)
- <img height="12" width="12" src="https://fewsats.com/favicon.svg" alt="Fewsats Logo" /> **[Fewsats](https://github.com/Fewsats/fewsats-mcp)** - Enable AI Agents to purchase anything in a secure way using [Fewsats](https://fewsats.com)
- <img height="12" width="12" src="https://financialdatasets.ai/favicon.ico" alt="Financial Datasets Logo" /> **[Financial Datasets](https://github.com/financial-datasets/mcp-server)** - Stock market API made for AI agents
- <img height="12" width="12" src="https://firecrawl.dev/favicon.ico" alt="Firecrawl Logo" /> **[Firecrawl](https://github.com/mendableai/firecrawl-mcp-server)** - Extract web data with [Firecrawl](https://firecrawl.dev)
- <img height="12" width="12" src="https://fireproof.storage/favicon.ico" alt="Fireproof Logo" /> **[Fireproof](https://github.com/fireproof-storage/mcp-database-server)** - Immutable ledger database with live synchronization
- <img height="12" width="12" src="https://grafana.com/favicon.ico" alt="Grafana Logo" /> **[Grafana](https://github.com/grafana/mcp-grafana)** - Search dashboards, investigate incidents and query datasources in your Grafana instance
- <img height="12" width="12" src="https://framerusercontent.com/images/KCOWBYLKunDff1Dr452y6EfjiU.png" alt="Graphlit Logo" /> **[Graphlit](https://github.com/graphlit/graphlit-mcp-server)** - Ingest anything from Slack to Gmail to podcast feeds, in addition to web crawling, into a searchable [Graphlit](https://www.graphlit.com) project.
- <img height="12" width="12" src="https://hyperbrowser-assets-bucket.s3.us-east-1.amazonaws.com/Hyperbrowser-logo.png" alt="Hyperbrowsers23 Logo" /> **[Hyperbrowser](https://github.com/hyperbrowserai/mcp)** - [Hyperbrowser](https://www.hyperbrowser.ai/) is the next-generation platform empowering AI agents and enabling effortless, scalable browser automation.
- **[IBM wxflows](https://github.com/IBM/wxflows/tree/main/examples/mcp/javascript)** - Tool platform by IBM to build, test and deploy tools for any data source
- <img height="12" width="12" src="https://forevervm.com/icon.png" alt="ForeverVM Logo" /> **[ForeverVM](https://github.com/jamsocket/forevervm/tree/main/javascript/mcp-server)** - Run Python in a code sandbox.
- <img height="12" width="12" src="https://inkeep.com/favicon.ico" alt="Inkeep Logo" /> **[Inkeep](https://github.com/inkeep/mcp-server-python)** - RAG Search over your content powered by [Inkeep](https://inkeep.com)
- <img height="12" width="12" src="https://integration.app/favicon.ico" alt="Integration App Icon" /> **[Integration App](https://github.com/integration-app/mcp-server)** - Interact with any other SaaS applications on behalf of your customers.
- <img height="12" width="12" src="https://cdn.simpleicons.org/jetbrains" /> **[JetBrains](https://github.com/JetBrains/mcp-jetbrains)** – Work on your code with JetBrains IDEs
- <img height="12" width="12" src="https://kagi.com/favicon.ico" alt="Kagi Logo" /> **[Kagi Search](https://github.com/kagisearch/kagimcp)** - Search the web using Kagi's search API
- <img height="12" width="12" src="https://langfuse.com/favicon.ico" alt="Langfuse Logo" /> **[Langfuse Prompt Management](https://github.com/langfuse/mcp-server-langfuse)** - Open-source tool for collaborative editing, versioning, evaluating, and releasing prompts.
- <img height="12" width="12" src="https://lingo.dev/favicon.ico" alt="Lingo.dev Logo" /> **[Lingo.dev](https://github.com/lingodotdev/lingo.dev/blob/main/mcp.md)** - Make your AI agent speak every language on the planet, using [Lingo.dev](https://lingo.dev) Localization Engine.
- <img height="12" width="12" src="https://www.make.com/favicon.ico" alt="Make Logo" /> **[Make](https://github.com/integromat/make-mcp-server)** - Turn your [Make](https://www.make.com/) scenarios into callable tools for AI assistants.
- <img height="12" width="12" src="https://www.meilisearch.com/favicon.ico" alt="Meilisearch Logo" /> **[Meilisearch](https://github.com/meilisearch/meilisearch-mcp)** - Interact & query with Meilisearch (Full-text & semantic search API)
- <img height="12" width="12" src="https://metoro.io/static/images/logos/Metoro.svg" /> **[Metoro](https://github.com/metoro-io/metoro-mcp-server)** - Query and interact with kubernetes environments monitored by Metoro
- <img height="12" width="12" src="https://milvus.io/favicon-32x32.png" /> **[Milvus](https://github.com/zilliztech/mcp-server-milvus)** - Search, Query and interact with data in your Milvus Vector Database.
- <img height="12" width="12" src="https://www.motherduck.com/favicon.ico" alt="MotherDuck Logo" /> **[MotherDuck](https://github.com/motherduckdb/mcp-server-motherduck)** - Query and analyze data with MotherDuck and local DuckDB
- <img height="12" width="12" src="https://needle-ai.com/images/needle-logo-orange-2-rounded.png" alt="Needle AI Logo" /> **[Needle](https://github.com/needle-ai/needle-mcp)** - Production-ready RAG out of the box to search and retrieve data from your own documents.
- <img height="12" width="12" src="https://neo4j.com/favicon.ico" alt="Neo4j Logo" /> **[Neo4j](https://github.com/neo4j-contrib/mcp-neo4j/)** - Neo4j graph database server (schema + read/write-cypher) and separate graph database backed memory
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/183852044?s=48&v=4" alt="Neon Logo" /> **[Neon](https://github.com/neondatabase/mcp-server-neon)** - Interact with the Neon serverless Postgres platform
- <img height="12" width="12" src="https://oxylabs.io/favicon.ico" alt="Oxylabs Logo" /> **[Oxylabs](https://github.com/oxylabs/oxylabs-mcp)** - Scrape websites with Oxylabs Web API, supporting dynamic rendering and parsing for structured data extraction.
- <img height="12" width="12" src="https://www.perplexity.ai/favicon.ico" alt="Perplexity Logo" /> **[Perplexity](https://github.com/ppl-ai/modelcontextprotocol)** - An MCP server that connects to Perplexity's Sonar API, enabling real-time web-wide research in conversational AI.
- <img height="12" width="12" src="https://qdrant.tech/img/brand-resources-logos/logomark.svg" /> **[Qdrant](https://github.com/qdrant/mcp-server-qdrant/)** - Implement semantic memory layer on top of the Qdrant vector search engine
- **[Raygun](https://github.com/MindscapeHQ/mcp-server-raygun)** - Interact with your crash reporting and real using monitoring data on your Raygun account
- <img height="12" width="12" src="https://www.rember.com/favicon.ico" alt="Rember Logo" /> **[Rember](https://github.com/rember/rember-mcp)** - Create spaced repetition flashcards in [Rember](https://rember.com) to remember anything you learn in your chats
- <img height="12" width="12" src="https://riza.io/favicon.ico" alt="Riza logo" /> **[Riza](https://github.com/riza-io/riza-mcp)** - Arbitrary code execution and tool-use platform for LLMs by [Riza](https://riza.io)
- <img height="12" width="12" src="https://pics.fatwang2.com/56912e614b35093426c515860f9f2234.svg" /> [Search1API](https://github.com/fatwang2/search1api-mcp) - One API for Search, Crawling, and Sitemaps
- <img height="12" width="12" src="https://screenshotone.com/favicon.ico" alt="ScreenshotOne Logo" /> **[ScreenshotOne](https://github.com/screenshotone/mcp/)** - Render website screenshots with [ScreenshotOne](https://screenshotone.com/)
- <img height="12" width="12" src="https://www.starrocks.io/favicon.ico" alt="StarRocks Logo" /> **[StarRocks](https://github.com/StarRocks/mcp-server-starrocks)** - Interact with [StarRocks](https://www.starrocks.io/)
- <img height="12" width="12" src="https://stripe.com/favicon.ico" alt="Stripe Logo" /> **[Stripe](https://github.com/stripe/agent-toolkit)** - Interact with Stripe API
- <img height="12" width="12" src="https://tavily.com/favicon.ico" alt="Tavily Logo" /> **[Tavily](https://github.com/tavily-ai/tavily-mcp)** - Search engine for AI agents (search + extract) powered by [Tavily](https://tavily.com/)
- <img height="12" width="12" src="https://www.tinybird.co/favicon.ico" alt="Tinybird Logo" /> **[Tinybird](https://github.com/tinybirdco/mcp-tinybird)** - Interact with Tinybird serverless ClickHouse platform
- <img height="12" width="12" src="https://unifai.network/favicon.ico" alt="UnifAI Logo" /> **[UnifAI](https://github.com/unifai-network/unifai-mcp-server)** - Dynamically search and call tools using [UnifAI Network](https://unifai.network)
- <img height="12" width="12" src="https://verodat.io/assets/favicon-16x16.png" alt="Verodat Logo" /> **[Verodat](https://github.com/Verodat/verodat-mcp-server)** - Interact with Verodat AI Ready Data platform
- **[ZenML](https://github.com/zenml-io/mcp-zenml)** - Interact with your MLOps and LLMOps pipelines through your [ZenML](https://www.zenml.io) MCP server

### 🌎 Community Servers

A growing set of community-developed and maintained servers demonstrates various applications of MCP across different domains.

> **Note:** Community servers are **untested** and should be used at **your own risk**. They are not affiliated with or endorsed by Anthropic.
- **[Ableton Live](https://github.com/Simon-Kansara/ableton-live-mcp-server)** - an MCP server to control Ableton Live.
- **[Airbnb](https://github.com/openbnb-org/mcp-server-airbnb)** - Provides tools to search Airbnb and get listing details.
- **[Algorand](https://github.com/GoPlausible/algorand-mcp)** - A comprehensive MCP server for tooling interactions (40+) and resource accessibility (60+) plus many useful prompts for interacting with the Algorand blockchain.
- **[Airflow](https://github.com/yangkyeongmo/mcp-server-apache-airflow)** - A MCP Server that connects to [Apache Airflow](https://airflow.apache.org/) using official python client.
- **[Airtable](https://github.com/domdomegg/airtable-mcp-server)** - Read and write access to [Airtable](https://airtable.com/) databases, with schema inspection.
- **[Airtable](https://github.com/felores/airtable-mcp)** - Airtable Model Context Protocol Server.
- **[AlphaVantage](https://github.com/calvernaz/alphavantage)** - MCP server for stock market data API [AlphaVantage](https://www.alphavantage.co)
- **[Anki](https://github.com/scorzeth/anki-mcp-server)** - An MCP server for interacting with your [Anki](https://apps.ankiweb.net) decks and cards.
- **[Any Chat Completions](https://github.com/pyroprompts/any-chat-completions-mcp)** - Interact with any OpenAI SDK Compatible Chat Completions API like OpenAI, Perplexity, Groq, xAI and many more.
- **[ArangoDB](https://github.com/ravenwits/mcp-server-arangodb)** - MCP Server that provides database interaction capabilities through [ArangoDB](https://arangodb.com/).
- **[Atlassian](https://github.com/sooperset/mcp-atlassian)** - Interact with Atlassian Cloud products (Confluence and Jira) including searching/reading Confluence spaces/pages, accessing Jira issues, and project metadata.
- **[AWS](https://github.com/rishikavikondala/mcp-server-aws)** - Perform operations on your AWS resources using an LLM.
- **[AWS Athena](https://github.com/lishenxydlgzs/aws-athena-mcp)** - A MCP server for AWS Athena to run SQL queries on Glue Catalog.
- **[AWS Cost Explorer](https://github.com/aarora79/aws-cost-explorer-mcp-server)** - Optimize your AWS spend (including Amazon Bedrock spend) with this MCP server by examining spend across regions, services, instance types and foundation models ([demo video](https://www.youtube.com/watch?v=WuVOmYLRFmI&feature=youtu.be)).
- **[AWS S3](https://github.com/aws-samples/sample-mcp-server-s3)** - A sample MCP server for AWS S3 that flexibly fetches objects from S3 such as PDF documents.
- **[Azure ADX](https://github.com/pab1it0/adx-mcp-server)** - Query and analyze Azure Data Explorer databases.
- **[Base Free USDC Transfer](https://github.com/magnetai/mcp-free-usdc-transfer)** - Send USDC on [Base](https://base.org) for free using Claude AI! Built with [Coinbase CDP](https://docs.cdp.coinbase.com/mpc-wallet/docs/welcome).
- **[BigQuery](https://github.com/LucasHild/mcp-server-bigquery)** (by LucasHild) - This server enables LLMs to inspect database schemas and execute queries on BigQuery.
- **[BigQuery](https://github.com/ergut/mcp-bigquery-server)** (by ergut) - Server implementation for Google BigQuery integration that enables direct BigQuery database access and querying capabilities
- **[Blender](https://github.com/ahujasid/blender-mcp)** (by ahujasid) - Blender integration allowing prompt enabled 3D scene creation, modeling and manipulation.
- **[CFBD API](https://github.com/lenwood/cfbd-mcp-server)** - An MCP server for the [College Football Data API](https://collegefootballdata.com/).
- **[ChatMCP](https://github.com/AI-QL/chat-mcp)** – An Open Source Cross-platform GUI Desktop application compatible with Linux, macOS, and Windows, enabling seamless interaction with MCP servers across dynamically selectable LLMs, by **[AIQL](https://github.com/AI-QL)**
- **[ChatSum](https://github.com/mcpso/mcp-server-chatsum)** - Query and Summarize chat messages with LLM. by [mcpso](https://mcp.so)
- **[Chess.com](https://github.com/Pavel.Shklovsky/chess-mcp)** - Access Chess.com player data, game records, and other public information through standardized MCP interfaces, allowing AI assistants to search and analyze chess information.
- **[Chroma](https://github.com/privetin/chroma)** - Vector database server for semantic document search and metadata filtering, built on Chroma
- **[ClaudePost](https://github.com/ZilongXue/claude-post)** - ClaudePost enables seamless email management for Gmail, offering secure features like email search, reading, and sending.
- **[Cloudinary](https://github.com/felores/cloudinary-mcp-server)** - Cloudinary Model Context Protocol Server to upload media to Cloudinary and get back the media link and details.
- **[code-executor](https://github.com/bazinga012/mcp_code_executor)** - An MCP server that allows LLMs to execute Python code within a specified Conda environment.
- **[code-sandbox-mcp](https://github.com/Automata-Labs-team/code-sandbox-mcp)** - An MCP server to create secure code sandbox environment for executing code within Docker containers.
- **[cognee-mcp](https://github.com/topoteretes/cognee/tree/main/cognee-mcp)** - GraphRAG memory server with customizable ingestion, data processing and search
- **[coin_api_mcp](https://github.com/longmans/coin_api_mcp)** - Provides access to [coinmarketcap](https://coinmarketcap.com/) cryptocurrency data.
- **[Contentful-mcp](https://github.com/ivo-toby/contentful-mcp)** - Read, update, delete, publish content in your [Contentful](https://contentful.com) space(s) from this MCP Server.
- **[Dappier](https://github.com/DappierAI/dappier-mcp)** - Connect LLMs to real-time, rights-cleared, proprietary data from trusted sources. Access specialized models for Real-Time Web Search, News, Sports, Financial Data, Crypto, and premium publisher content. Explore data models at [marketplace.dappier.com](https://marketplace.dappier.com/marketplace).
- **[Data Exploration](https://github.com/reading-plus-ai/mcp-server-data-exploration)** - MCP server for autonomous data exploration on .csv-based datasets, providing intelligent insights with minimal effort. NOTE: Will execute arbitrary Python code on your machine, please use with caution!
- **[Dataset Viewer](https://github.com/privetin/dataset-viewer)** - Browse and analyze Hugging Face datasets with features like search, filtering, statistics, and data export
- **[DBHub](https://github.com/bytebase/dbhub/)** - Universal database MCP server connecting to MySQL, PostgreSQL, SQLite, DuckDB and etc.
- **[DeepSeek MCP Server](https://github.com/DMontgomery40/deepseek-mcp-server)** - Model Context Protocol server integrating DeepSeek's advanced language models, in addition to [other useful API endpoints](https://github.com/DMontgomery40/deepseek-mcp-server?tab=readme-ov-file#features)
- **[Deepseek_R1](https://github.com/66julienmartin/MCP-server-Deepseek_R1)** - A Model Context Protocol (MCP) server implementation connecting Claude Desktop with DeepSeek's language models (R1/V3)
- **[deepseek-thinker-mcp](https://github.com/ruixingshi/deepseek-thinker-mcp)** - A MCP (Model Context Protocol) provider Deepseek reasoning content to MCP-enabled AI Clients, like Claude Desktop. Supports access to Deepseek's thought processes from the Deepseek API service or from a local Ollama server.
- **[Descope](https://github.com/descope-sample-apps/descope-mcp-server)** - An MCP server to integrate with [Descope](https://descope.com) to search audit logs, manage users, and more.
- **[DevRev](https://github.com/kpsunil97/devrev-mcp-server)** - An MCP server to integrate with DevRev APIs to search through your DevRev Knowledge Graph where objects can be imported from diff. sources listed [here](https://devrev.ai/docs/import#available-sources).
- **[Dify](https://github.com/YanxingLiu/dify-mcp-server)** - A simple implementation of an MCP server for dify workflows.
- **[Discord](https://github.com/v-3/discordmcp)** - A MCP server to connect to Discord guilds through a bot and read and write messages in channels
- **[Discourse](https://github.com/AshDevFr/discourse-mcp-server)** - A MCP server to search Discourse posts on a Discourse forum.
- **[Docker](https://github.com/ckreiling/mcp-server-docker)** - Integrate with Docker to manage containers, images, volumes, and networks.
- **[Drupal](https://github.com/Omedia/mcp-server-drupal)** - Server for interacting with [Drupal](https://www.drupal.org/project/mcp) using STDIO transport layer.
- **[Elasticsearch](https://github.com/cr7258/elasticsearch-mcp-server)** - MCP server implementation that provides Elasticsearch interaction.
- **[ElevenLabs](https://github.com/mamertofabian/elevenlabs-mcp-server)** - A server that integrates with ElevenLabs text-to-speech API capable of generating full voiceovers with multiple voices.
- **[Ergo Blockchain MCP](https://github.com/marctheshark3/ergo-mcp)** -An MCP server to integrate Ergo Blockchain Node and Explorer APIs for checking address balances, analyzing transactions, viewing transaction history, performing forensic analysis of addresses, searching for tokens, and monitoring network status.
- **[Eunomia](https://github.com/whataboutyou-ai/eunomia-MCP-server)** - Extension of the Eunomia framework that connects Eunomia instruments with MCP servers
- **[EVM MCP Server](https://github.com/mcpdotdirect/evm-mcp-server)** - Comprehensive blockchain services for 30+ EVM networks, supporting native tokens, ERC20, NFTs, smart contracts, transactions, and ENS resolution.
- **[Everything Search](https://github.com/mamertofabian/mcp-everything-search)** - Fast file searching capabilities across Windows (using [Everything SDK](https://www.voidtools.com/support/everything/sdk/)), macOS (using mdfind command), and Linux (using locate/plocate command).
- **[Fetch](https://github.com/zcaceres/fetch-mcp)** - A server that flexibly fetches HTML, JSON, Markdown, or plaintext.
- **[Figma](https://github.com/GLips/Figma-Context-MCP)** - Give your coding agent direct access to Figma file data, helping it one-shot design implementation.
- **[FireCrawl](https://github.com/vrknetha/mcp-server-firecrawl)** - Advanced web scraping with JavaScript rendering, PDF support, and smart rate limiting
- **[FlightRadar24](https://github.com/sunsetcoder/flightradar24-mcp-server)** - A Claude Desktop MCP server that helps you track flights in real-time using Flightradar24 data.
- **[Ghost](https://github.com/MFYDev/ghost-mcp)** - A Model Context Protocol (MCP) server for interacting with Ghost CMS through LLM interfaces like Claude.
- **[Glean](https://github.com/longyi1207/glean-mcp-server)** - A server that uses Glean API to search and chat.
- **[Gmail](https://github.com/GongRzhe/Gmail-MCP-Server)** - A Model Context Protocol (MCP) server for Gmail integration in Claude Desktop with auto authentication support.
- **[Goal Story](https://github.com/hichana/goalstory-mcp)** - a Goal Tracker and Visualization Tool for personal and professional development.
- **[GOAT](https://github.com/goat-sdk/goat/tree/main/typescript/examples/by-framework/model-context-protocol)** - Run more than +200 onchain actions on any blockchain including Ethereum, Solana and Base.
- **[Golang Filesystem Server](https://github.com/mark3labs/mcp-filesystem-server)** - Secure file operations with configurable access controls built with Go!
- **[Google Calendar](https://github.com/v-3/google-calendar)** - Integration with Google Calendar to check schedules, find time, and add/delete events
- **[Google Calendar](https://github.com/nspady/google-calendar-mcp)** - Google Calendar MCP Server for managing Google calendar events. Also supports searching for events by attributes like title and location.
- **[Google Custom Search](https://github.com/adenot/mcp-google-search)** - Provides Google Search results via the Google Custom Search API
- **[Google Tasks](https://github.com/zcaceres/gtasks-mcp)** - Google Tasks API Model Context Protocol Server.
- **[GraphQL Schema](https://github.com/hannesj/mcp-graphql-schema)** - Allow LLMs to explore large GraphQL schemas without bloating the context.
- **[HDW LinkedIn](https://github.com/horizondatawave/hdw-mcp-server)** - Access to profile data and management of user account with [HorizonDataWave.ai](https://horizondatawave.ai/).
- **[Heurist Mesh Agent](https://github.com/heurist-network/heurist-mesh-mcp-server)** - Access specialized web3 AI agents for blockchain analysis, smart contract security, token metrics, and blockchain interactions through the [Heurist Mesh network](https://github.com/heurist-network/heurist-agent-framework/tree/main/mesh).
- **[Holaspirit](https://github.com/syucream/holaspirit-mcp-server)** - Interact with [Holaspirit](https://www.holaspirit.com/).
- **[Home Assistant](https://github.com/tevonsb/homeassistant-mcp)** - Interact with [Home Assistant](https://www.home-assistant.io/) including viewing and controlling lights, switches, sensors, and all other Home Assistant entities.
- **[HubSpot](https://github.com/buryhuang/mcp-hubspot)** - HubSpot CRM integration for managing contacts and companies. Create and retrieve CRM data directly through Claude chat.
- **[HuggingFace Spaces](https://github.com/evalstate/mcp-hfspace)** - Server for using HuggingFace Spaces, supporting Open Source Image, Audio, Text Models and more. Claude Desktop mode for easy integration.
- **[Hyperliquid](https://github.com/mektigboy/server-hyperliquid)** - An MCP server implementation that integrates the Hyperliquid SDK for exchange data.
- **[Image Generation](https://github.com/GongRzhe/Image-Generation-MCP-Server)** - This MCP server provides image generation capabilities using the Replicate Flux model.
- **[InfluxDB](https://github.com/idoru/influxdb-mcp-server)** - Run queries against InfluxDB OSS API v2.
- **[Inoyu](https://github.com/sergehuber/inoyu-mcp-unomi-server)** - Interact with an Apache Unomi CDP customer data platform to retrieve and update customer profiles
- **[Intercom](https://github.com/raoulbia-ai/mcp-server-for-intercom)** - An MCP-compliant server for retrieving customer support tickets from Intercom. This tool enables AI assistants like Claude Desktop and Cline to access and analyze your Intercom support tickets.
- **[iTerm MCP](https://github.com/ferrislucas/iterm-mcp)** - Integration with iTerm2 terminal emulator for macOS, enabling LLMs to execute and monitor terminal commands.
- **[JavaFX](https://github.com/mcpso/mcp-server-javafx)** - Make drawings using a JavaFX canvas
- **[JDBC](https://github.com/quarkiverse/quarkus-mcp-servers/tree/main/jdbc)** - Connect to any JDBC-compatible database and query, insert, update, delete, and more. Supports MySQL, PostgreSQL, Oracle, SQL Server, sqllite and [more](https://github.com/quarkiverse/quarkus-mcp-servers/tree/main/jdbc#supported-jdbc-variants).
- **[JSON](https://github.com/GongRzhe/JSON-MCP-Server)** - JSON handling and processing server with advanced query capabilities using JSONPath syntax and support for array, string, numeric, and date operations.
- **[Keycloak MCP](https://github.com/ChristophEnglisch/keycloak-model-context-protocol)** - This MCP server enables natural language interaction with Keycloak for user and realm management including creating, deleting, and listing users and realms.
- **[Kibela](https://github.com/kiwamizamurai/mcp-kibela-server)** (by kiwamizamurai) - Interact with Kibela API.
- **[kintone](https://github.com/macrat/mcp-server-kintone)** - Manage records and apps in [kintone](https://kintone.com) through LLM tools.
- **[Kubernetes](https://github.com/Flux159/mcp-server-kubernetes)** - Connect to Kubernetes cluster and manage pods, deployments, and services.
- **[Kubernetes and OpenShift](https://github.com/manusa/kubernetes-mcp-server)** - A powerful Kubernetes MCP server with additional support for OpenShift. Besides providing CRUD operations for any Kubernetes resource, this server provides specialized tools to interact with your cluster.
- **[Langflow-DOC-QA-SERVER](https://github.com/GongRzhe/Langflow-DOC-QA-SERVER)** - A Model Context Protocol server for document Q&A powered by Langflow. It demonstrates core MCP concepts by providing a simple interface to query documents through a Langflow backend.
- **[Lightdash](https://github.com/syucream/lightdash-mcp-server)** - Interact with [Lightdash](https://www.lightdash.com/), a BI tool.
- **[Linear](https://github.com/jerhadf/linear-mcp-server)** - Allows LLM to interact with Linear's API for project management, including searching, creating, and updating issues.
- **[LINE](https://github.com/amornpan/py-mcp-line)** (by amornpan) - Implementation for LINE Bot integration that enables Language Models to read and analyze LINE conversations through a standardized interface. Features asynchronous operation, comprehensive logging, webhook event handling, and support for various message types.
- **[LlamaCloud](https://github.com/run-llama/mcp-server-llamacloud)** (by marcusschiesser) - Integrate the data stored in a managed index on [LlamaCloud](https://cloud.llamaindex.ai/)
- **[llm-context](https://github.com/cyberchitta/llm-context.py)** - Provides a repo-packing MCP tool with configurable profiles that specify file inclusion/exclusion patterns and optional prompts.
- **[mac-messages-mcp](https://github.com/carterlasalle/mac_messages_mcp)** - An MCP server that securely interfaces with your iMessage database via the Model Context Protocol (MCP), allowing LLMs to query and analyze iMessage conversations. It includes robust phone number validation, attachment processing, contact management, group chat handling, and full support for sending and receiving messages.
- **[MariaDB](https://github.com/abel9851/mcp-server-mariadb)** - MariaDB database integration with configurable access controls in Python.
- **[MCP Compass](https://github.com/liuyoshio/mcp-compass)** - Suggest the right MCP server for your needs
- **[MCP Create](https://github.com/tesla0225/mcp-create)** - A dynamic MCP server management service that creates, runs, and manages Model Context Protocol servers on-the-fly.
- **[MCP Installer](https://github.com/anaisbetts/mcp-installer)** - This server is a server that installs other MCP servers for you.
- **[mcp-k8s-go](https://github.com/strowk/mcp-k8s-go)** - Golang-based Kubernetes server for MCP to browse pods and their logs, events, namespaces and more. Built to be extensible.
- **[mcp-local-rag](https://github.com/nkapila6/mcp-local-rag)** - "primitive" RAG-like web search model context protocol (MCP) server that runs locally using Google's MediaPipe Text Embedder and DuckDuckGo Search. ✨ no APIs required ✨.
- **[mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)** - Connect to MCP servers that run on SSE transport, or expose stdio servers as an SSE server.
- **[mem0-mcp](https://github.com/mem0ai/mem0-mcp)** - A Model Context Protocol server for Mem0, which helps with managing coding preferences.
- **[MSSQL](https://github.com/aekanun2020/mcp-server/)** - MSSQL database integration with configurable access controls and schema inspection
- **[MSSQL](https://github.com/JexinSam/mssql_mcp_server)** (by jexin) - MCP Server for MSSQL database in Python
- **[MSSQL-Python](https://github.com/amornpan/py-mcp-mssql)** (by amornpan) - A read-only Python implementation for MSSQL database access with enhanced security features, configurable access controls, and schema inspection capabilities. Focuses on safe database interaction through Python ecosystem.
- **[MSSQL-MCP](https://github.com/daobataotie/mssql-mcp)** (by daobataotie) - MSSQL MCP that refer to the official website's SQLite MCP for modifications to adapt to MSSQL
- **[Markdownify](https://github.com/zcaceres/mcp-markdownify-server)** - MCP to convert almost anything to Markdown (PPTX, HTML, PDF, Youtube Transcripts and more)
- **[Minima](https://github.com/dmayboroda/minima)** - MCP server for RAG on local files
- **[MongoDB](https://github.com/kiliczsh/mcp-mongo-server)** - A Model Context Protocol Server for MongoDB.
- **[Monday.com](https://github.com/sakce/mcp-server-monday)** - MCP Server to interact with Monday.com boards and items.
- **[Multicluster-MCP-Sever](https://github.com/yanmxa/multicluster-mcp-server)** - The gateway for GenAI systems to interact with multiple Kubernetes clusters.
- **[MySQL](https://github.com/benborla/mcp-server-mysql)** (by benborla) - MySQL database integration in NodeJS with configurable access controls and schema inspection
- **[MySQL](https://github.com/designcomputer/mysql_mcp_server)** (by DesignComputer) - MySQL database integration in Python with configurable access controls and schema inspection
- **[n8n](https://github.com/leonardsellem/n8n-mcp-server)** - This MCP server provides tools and resources for AI assistants to manage n8n workflows and executions, including listing, creating, updating, and deleting workflows, as well as monitoring their execution status.
- **[NASA](https://github.com/ProgramComputer/NASA-MCP-server)** (by ProgramComputer) - Access to a unified gateway of NASA's data sources including but not limited to APOD, NEO, EPIC, GIBS.
- **[NS Travel Information](https://github.com/r-huijts/ns-mcp-server)** - Access Dutch Railways (NS) real-time train travel information and disruptions through the official NS API.
- **[Neo4j](https://github.com/da-okazaki/mcp-neo4j-server)** - A community built server that interacts with Neo4j Graph Database.
- **[Neovim](https://github.com/bigcodegen/mcp-neovim-server)** - An MCP Server for your Neovim session.
- **[Notion](https://github.com/suekou/mcp-notion-server)** (by suekou) - Interact with Notion API.
- **[Notion](https://github.com/v-3/notion-server)** (by v-3) - Notion MCP integration. Search, Read, Update, and Create pages through Claude chat.
- **[oatpp-mcp](https://github.com/oatpp/oatpp-mcp)** - C++ MCP integration for Oat++. Use [Oat++](https://oatpp.io) to build MCP servers.
- **[Obsidian Markdown Notes](https://github.com/calclavia/mcp-obsidian)** - Read and search through your Obsidian vault or any directory containing Markdown notes
- **[obsidian-mcp](https://github.com/StevenStavrakis/obsidian-mcp)** - (by Steven Stavrakis) An MCP server for Obsidian.md with tools for searching, reading, writing, and organizing notes.
- **[OceanBase](https://github.com/yuanoOo/oceanbase_mcp_server)** - (by yuanoOo