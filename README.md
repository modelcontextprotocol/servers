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
- <img height="12" width="12" src="https://invoxx-public-bucket.s3.eu-central-1.amazonaws.com/frontend-resources/adfin-logo-small.svg" alt="Adfin Logo" /> **[Adfin](https://github.com/Adfin-Engineering/mcp-server-adfin)** - The only platform you need to get paid - all payments in one place, invoicing and accounting reconciliations with [Adfin](https://www.adfin.com/).
- <img height="12" width="12" src="https://www.agentql.com/favicon/favicon.png" alt="AgentQL Logo" /> **[AgentQL](https://github.com/tinyfish-io/agentql-mcp)** - Enable AI agents to get structured data from unstructured web with [AgentQL](https://www.agentql.com/).
- <img height="12" width="12" src="https://agentrpc.com/favicon.ico" alt="AgentRPC Logo" /> **[AgentRPC](https://github.com/agentrpc/agentrpc)** - Connect to any function, any language, across network boundaries using [AgentRPC](https://www.agentrpc.com/).
- <img height="12" width="12" src="https://aiven.io/favicon.ico" alt="Aiven Logo" /> **[Aiven](https://github.com/Aiven-Open/mcp-aiven)** - Navigate your [Aiven projects](https://go.aiven.io/mcp-server) and interact with the PostgreSQL®, Apache Kafka®, ClickHouse® and OpenSearch® services
- <img height="12" width="12" src="https://iotdb.apache.org/img/logo.svg" alt="Apache IoTDB Logo" /> **[Apache IoTDB](https://github.com/apache/iotdb-mcp-server)** - MCP Server for [Apache IoTDB](https://github.com/apache/iotdb) database and its tools
- <img height="12" width="12" src="https://apify.com/favicon.ico" alt="Apify Logo" /> **[Apify](https://github.com/apify/actors-mcp-server)** - [Actors MCP Server](https://apify.com/apify/actors-mcp-server): Use 3,000+ pre-built cloud tools to extract data from websites, e-commerce, social media, search engines, maps, and more
- <img height="12" width="12" src="https://2052727.fs1.hubspotusercontent-na1.net/hubfs/2052727/cropped-cropped-apimaticio-favicon-1-32x32.png" alt="APIMatic Logo" /> **[APIMatic MCP](https://github.com/apimatic/apimatic-validator-mcp)** - APIMatic MCP Server is used to validate OpenAPI specifications using [APIMatic](https://www.apimatic.io/). The server processes OpenAPI files and returns validation summaries by leveraging APIMatic’s API.
- <img height="12" width="12" src="https://resources.audiense.com/hubfs/favicon-1.png" alt="Audiense Logo" /> **[Audiense Insights](https://github.com/AudienseCo/mcp-audiense-insights)** - Marketing insights and audience analysis from [Audiense](https://www.audiense.com/products/audiense-insights) reports, covering demographic, cultural, influencer, and content engagement analysis.
- <img height="12" width="12" src="https://axiom.co/favicon.ico" alt="Axiom Logo" /> **[Axiom](https://github.com/axiomhq/mcp-server-axiom)** - Query and analyze your Axiom logs, traces, and all other event data in natural language
- <img height="12" width="12" src="https://www.bankless.com/favicon.ico" alt="Bankless Logo" /> **[Bankless Onchain](https://github.com/bankless/onchain-mcp)** - Query Onchain data, like ERC20 tokens, transaction history, smart contract state.
- <img height="12" width="12" src="https://bicscan.io/favicon.png" alt="BICScan Logo" /> **[BICScan](https://github.com/ahnlabio/bicscan-mcp)** - Risk score / asset holdings of EVM blockchain address (EOA, CA, ENS) and even domain names.
- <img height="12" width="12" src="https://www.box.com/favicon.ico" alt="Box Logo" /> **[Box](https://github.com/box-community/mcp-server-box)** - Interact with the Intelligent Content Management platform through Box AI.
- <img height="12" width="12" src="https://browserbase.com/favicon.ico" alt="Browserbase Logo" /> **[Browserbase](https://github.com/browserbase/mcp-server-browserbase)** - Automate browser interactions in the cloud (e.g. web navigation, data extraction, form filling, and more)
- <img height="12" width="12" src="https://www.chargebee.com/static/resources/brand/favicon.png" /> **[Chargebee](https://github.com/chargebee/agentkit/tree/main/modelcontextprotocol)** - MCP Server that connects AI agents to [Chargebee platform](https://www.chargebee.com).
- <img height="12" width="12" src="https://trychroma.com/_next/static/media/chroma-logo.ae2d6e4b.svg" /> **[Chroma](https://github.com/chroma-core/chroma-mcp)** - Embeddings, vector search, document storage, and full-text search with the open-source AI application database
- <img height="12" width="12" src="https://www.chronulus.com/favicon/chronulus-logo-blue-on-alpha-square-128x128.ico" alt="Chronulus AI Logo" /> **[Chronulus AI](https://github.com/ChronulusAI/chronulus-mcp)** - Predict anything with Chronulus AI forecasting and prediction agents.
- <img height="12" width="12" src="https://circleci.com/favicon.ico" alt="CircleCI Logo" /> **[CircleCI](https://github.com/CircleCI-Public/mcp-server-circleci)** - Enable AI Agents to fix build failures from CircleCI.
- <img height="12" width="12" src="https://clickhouse.com/favicon.ico" alt="ClickHouse Logo" /> **[ClickHouse](https://github.com/ClickHouse/mcp-clickhouse)** - Query your [ClickHouse](https://clickhouse.com/) database server.
- <img height="12" width="12" src="https://cdn.simpleicons.org/cloudflare" /> **[Cloudflare](https://github.com/cloudflare/mcp-server-cloudflare)** - Deploy, configure & interrogate your resources on the Cloudflare developer platform (e.g. Workers/KV/R2/D1)
- <img height="12" width="12" src="https://codelogic.com/wp-content/themes/codelogic/assets/img/favicon.png" alt="CodeLogic Logo" /> **[CodeLogic](https://github.com/CodeLogicIncEngineering/codelogic-mcp-server)** - Interact with [CodeLogic](https://codelogic.com), a Software Intelligence platform that graphs complex code and data architecture dependencies, to boost AI accuracy and insight.
- <img height="12" width="12" src="https://www.comet.com/favicon.ico" alt="Comet Logo" /> **[Comet Opik](https://github.com/comet-ml/opik-mcp)** - Query and analyze your [Opik](https://github.com/comet-ml/opik) logs, traces, prompts and all other telemtry data from your LLMs in natural language.
- <img height="12" width="12" src="https://www.convex.dev/favicon.ico" /> **[Convex](https://stack.convex.dev/convex-mcp-server)** - Introspect and query your apps deployed to Convex.
- <img height="12" width="12" src="http://app.itsdart.com/static/img/favicon.png" alt="Dart Logo" /> **[Dart](https://github.com/its-dart/dart-mcp-server)** - Interact with task, doc, and project data in [Dart](https://itsdart.com), an AI-native project management tool
- <img height="12" width="12" src="https://www.devhub.com/img/upload/favicon-196x196-dh.png" alt="DevHub Logo" /> **[DevHub](https://github.com/devhub/devhub-cms-mcp)** - Manage and utilize website content within the [DevHub](https://www.devhub.com) CMS platform
- <img height="12" width="12" src="https://e2b.dev/favicon.ico" alt="E2B Logo" /> **[E2B](https://github.com/e2b-dev/mcp-server)** - Run code in secure sandboxes hosted by [E2B](https://e2b.dev)
- <img height="12" width="12" src="https://static.edubase.net/media/brand/favicon/favicon-32x32.png" alt="EduBase Logo" /> **[EduBase](https://github.com/EduBase/MCP)** - Interact with [EduBase](https://www.edubase.net), a comprehensive e-learning platform with advanced quizzing, exam management, and content organization capabilities
- <img height="12" width="12" src="https://www.elastic.co/favicon.ico" alt="Elasticsearch Logo" /> **[Elasticsearch](https://github.com/elastic/mcp-server-elasticsearch)** - Query your data in [Elasticsearch](https://www.elastic.co/elasticsearch)
- <img height="12" width="12" src="https://esignatures.com/favicon.ico" alt="eSignatures Logo" /> **[eSignatures](https://github.com/esignaturescom/mcp-server-esignatures)** - Contract and template management for drafting, reviewing, and sending binding contracts.
- <img height="12" width="12" src="https://exa.ai/images/favicon-32x32.png" alt="Exa Logo" /> **[Exa](https://github.com/exa-labs/exa-mcp-server)** - Search Engine made for AIs by [Exa](https://exa.ai)
- <img height="12" width="12" src="https://fewsats.com/favicon.svg" alt="Fewsats Logo" /> **[Fewsats](https://github.com/Fewsats/fewsats-mcp)** - Enable AI Agents to purchase anything in a secure way using [Fewsats](https://fewsats.com)
- <img height="12" width="12" src="https://fibery.io/favicon.svg" alt="Fibery Logo" /> **[Fibery](https://github.com/Fibery-inc/fibery-mcp-server)** - Perform queries and entity operations in your [Fibery](https://fibery.io) workspace.
- <img height="12" width="12" src="https://financialdatasets.ai/favicon.ico" alt="Financial Datasets Logo" /> **[Financial Datasets](https://github.com/financial-datasets/mcp-server)** - Stock market API made for AI agents
- <img height="12" width="12" src="https://firecrawl.dev/favicon.ico" alt="Firecrawl Logo" /> **[Firecrawl](https://github.com/mendableai/firecrawl-mcp-server)** - Extract web data with [Firecrawl](https://firecrawl.dev)
- <img height="12" width="12" src="https://fireproof.storage/favicon.ico" alt="Fireproof Logo" /> **[Fireproof](https://github.com/fireproof-storage/mcp-database-server)** - Immutable ledger database with live synchronization
- <img height="12" width="12" src="https://gitee.com/favicon.ico" alt="Gitee Logo" /> **[Gitee](https://github.com/oschina/mcp-gitee)** - Gitee API integration, repository, issue, and pull request management, and more.
- <img height="12" width="12" src="https://cdn.prod.website-files.com/6605a2979ff17b2cd1939cd4/6605a460de47e7596ed84f06_icon256.png" alt="gotoHuman Logo" /> **[gotoHuman](https://github.com/gotohuman/gotohuman-mcp-server)** - Human-in-the-loop platform - Allow AI agents and automations to send requests for approval to your [gotoHuman](https://www.gotohuman.com) inbox.
- <img height="12" width="12" src="https://grafana.com/favicon.ico" alt="Grafana Logo" /> **[Grafana](https://github.com/grafana/mcp-grafana)** - Search dashboards, investigate incidents and query datasources in your Grafana instance
- <img height="12" width="12" src="https://framerusercontent.com/images/KCOWBYLKunDff1Dr452y6EfjiU.png" alt="Graphlit Logo" /> **[Graphlit](https://github.com/graphlit/graphlit-mcp-server)** - Ingest anything from Slack to Gmail to podcast feeds, in addition to web crawling, into a searchable [Graphlit](https://www.graphlit.com) project.
- <img height="12" width="12" src="https://greptime.com/favicon.ico" alt="Greptime Logo" /> **[GreptimeDB](https://github.com/GreptimeTeam/greptimedb-mcp-server)** - Provides AI assistants with a secure and structured way to explore and analyze data in [GreptimeDB](https://github.com/GreptimeTeam/greptimedb).
- <img height="12" width="12" src="https://www.herokucdn.com/favicons/favicon.ico" alt="Heroku Logo" /> **[Heroku](https://github.com/heroku/heroku-mcp-server)** - Interact with the Heroku Platform through LLM-driven tools for managing apps, add-ons, dynos, databases, and more.
- <img height="12" width="12" src="https://img.alicdn.com/imgextra/i3/O1CN01d9qrry1i6lTNa2BRa_!!6000000004364-2-tps-218-200.png" alt="Hologres Logo" /> **[Hologres](https://github.com/aliyun/alibabacloud-hologres-mcp-server)** - Connect to a [Hologres](https://www.alibabacloud.com/en/product/hologres) instance, get table metadata, query and analyze data.
- <img height="12" width="12" src="https://hyperbrowser-assets-bucket.s3.us-east-1.amazonaws.com/Hyperbrowser-logo.png" alt="Hyperbrowsers23 Logo" /> **[Hyperbrowser](https://github.com/hyperbrowserai/mcp)** - [Hyperbrowser](https://www.hyperbrowser.ai/) is the next-generation platform empowering AI agents and enabling effortless, scalable browser automation.
- **[IBM wxflows](https://github.com/IBM/wxflows/tree/main/examples/mcp/javascript)** - Tool platform by IBM to build, test and deploy tools for any data source
- <img height="12" width="12" src="https://forevervm.com/icon.png" alt="ForeverVM Logo" /> **[ForeverVM](https://github.com/jamsocket/forevervm/tree/main/javascript/mcp-server)** - Run Python in a code sandbox.
- <img height="12" width="12" src="https://www.getinboxzero.com/icon.png" alt="Inbox Zero Logo" /> **[Inbox Zero](https://github.com/elie222/inbox-zero/tree/main/apps/mcp-server)** - AI personal assistant for email [Inbox Zero](https://www.getinboxzero.com)
- <img height="12" width="12" src="https://inkeep.com/favicon.ico" alt="Inkeep Logo" /> **[Inkeep](https://github.com/inkeep/mcp-server-python)** - RAG Search over your content powered by [Inkeep](https://inkeep.com)
- <img height="12" width="12" src="https://integration.app/favicon.ico" alt="Integration App Icon" /> **[Integration App](https://github.com/integration-app/mcp-server)** - Interact with any other SaaS applications on behalf of your customers.
- <img height="12" width="12" src="https://cdn.simpleicons.org/jetbrains" /> **[JetBrains](https://github.com/JetBrains/mcp-jetbrains)** – Work on your code with JetBrains IDEs
- <img height="12" width="12" src="https://kagi.com/favicon.ico" alt="Kagi Logo" /> **[Kagi Search](https://github.com/kagisearch/kagimcp)** - Search the web using Kagi's search API
- <img height="12" width="12" src="https://connection.keboola.com/favicon.ico" alt="Keboola Logo" /> **[Keboola](https://github.com/keboola/keboola-mcp-server)** - Build robust data workflows, integrations, and analytics on a single intuitive platform.
- <img height="12" width="12" src="https://laratranslate.com/favicon.ico" alt="Lara Translate Logo" /> **[Lara Translate](https://github.com/translated/lara-mcp)** - MCP Server for Lara Translate API, enabling powerful translation capabilities with support for language detection and context-aware translations.
- <img height="12" width="12" src="https://logfire.pydantic.dev/favicon.ico" alt="Logfire Logo" /> **[Logfire](https://github.com/pydantic/logfire-mcp)** - Provides access to OpenTelemetry traces and metrics through Logfire.
- <img height="12" width="12" src="https://langfuse.com/favicon.ico" alt="Langfuse Logo" /> **[Langfuse Prompt Management](https://github.com/langfuse/mcp-server-langfuse)** - Open-source tool for collaborative editing, versioning, evaluating, and releasing prompts.
- <img height="12" width="12" src="https://lingo.dev/favicon.ico" alt="Lingo.dev Logo" /> **[Lingo.dev](https://github.com/lingodotdev/lingo.dev/blob/main/mcp.md)** - Make your AI agent speak every language on the planet, using [Lingo.dev](https://lingo.dev) Localization Engine.
- <img height="12" width="12" src="https://www.mailgun.com/favicon.ico" alt="Mailgun Logo" /> **[Mailgun](https://github.com/mailgun/mailgun-mcp-server)** - Interact with Mailgun API.
- <img height="12" width="12" src="https://www.make.com/favicon.ico" alt="Make Logo" /> **[Make](https://github.com/integromat/make-mcp-server)** - Turn your [Make](https://www.make.com/) scenarios into callable tools for AI assistants.
- <img height="12" width="12" src="https://www.meilisearch.com/favicon.ico" alt="Meilisearch Logo" /> **[Meilisearch](https://github.com/meilisearch/meilisearch-mcp)** - Interact & query with Meilisearch (Full-text & semantic search API)
- <img height="12" width="12" src="https://metoro.io/static/images/logos/Metoro.svg" /> **[Metoro](https://github.com/metoro-io/metoro-mcp-server)** - Query and interact with kubernetes environments monitored by Metoro
- <img height="12" width="12" src="https://milvus.io/favicon-32x32.png" /> **[Milvus](https://github.com/zilliztech/mcp-server-milvus)** - Search, Query and interact with data in your Milvus Vector Database.
- <img height="12" width="12" src="https://www.motherduck.com/favicon.ico" alt="MotherDuck Logo" /> **[MotherDuck](https://github.com/motherduckdb/mcp-server-motherduck)** - Query and analyze data with MotherDuck and local DuckDB
- <img height="12" width="12" src="https://needle-ai.com/images/needle-logo-orange-2-rounded.png" alt="Needle AI Logo" /> **[Needle](https://github.com/needle-ai/needle-mcp)** - Production-ready RAG out of the box to search and retrieve data from your own documents.
- <img height="12" width="12" src="https://neo4j.com/favicon.ico" alt="Neo4j Logo" /> **[Neo4j](https://github.com/neo4j-contrib/mcp-neo4j/)** - Neo4j graph database server (schema + read/write-cypher) and separate graph database backed memory
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/183852044?s=48&v=4" alt="Neon Logo" /> **[Neon](https://github.com/neondatabase/mcp-server-neon)** - Interact with the Neon serverless Postgres platform
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/82347605?s=48&v=4" alt="OceanBase Logo" /> **[OceanBase](https://github.com/oceanbase/mcp-oceanbase)** - MCP Server for OceanBase database and its tools
- <img height="12" width="12" src="https://docs.octagonagents.com/logo.svg" alt="Octagon Logo" /> **[Octagon](https://github.com/OctagonAI/octagon-mcp-server)** - Deliver real-time investment research with extensive private and public market data.
- <img height="12" width="12" src="https://oxylabs.io/favicon.ico" alt="Oxylabs Logo" /> **[Oxylabs](https://github.com/oxylabs/oxylabs-mcp)** - Scrape websites with Oxylabs Web API, supporting dynamic rendering and parsing for structured data extraction.
- <img height="12" width="12" src="https://developer.paddle.com/favicon.svg" alt="Paddle Logo" /> **[Paddle](https://github.com/PaddleHQ/paddle-mcp-server)** - Interact with the Paddle API. Manage product catalog, billing and subscriptions, and reports.
- <img height="12" width="12" src="https://www.paypalobjects.com/webstatic/icon/favicon.ico" alt="PayPal Logo" /> **[PayPal](https://mcp.paypal.com)** - PayPal's official MCP server.
- <img height="12" width="12" src="https://www.perplexity.ai/favicon.ico" alt="Perplexity Logo" /> **[Perplexity](https://github.com/ppl-ai/modelcontextprotocol)** - An MCP server that connects to Perplexity's Sonar API, enabling real-time web-wide research in conversational AI.
- <img height="12" width="12" src="https://qdrant.tech/img/brand-resources-logos/logomark.svg" /> **[Qdrant](https://github.com/qdrant/mcp-server-qdrant/)** - Implement semantic memory layer on top of the Qdrant vector search engine
- <img height="12" width="12" src="https://www.ramp.com/favicon.ico" /> **[Ramp](https://github.com/ramp-public/ramp-mcp)** - Interact with [Ramp](https://ramp.com)'s Developer API to run analysis on your spend and gain insights leveraging LLMs
- **[Raygun](https://github.com/MindscapeHQ/mcp-server-raygun)** - Interact with your crash reporting and real using monitoring data on your Raygun account
- <img height="12" width="12" src="https://www.rember.com/favicon.ico" alt="Rember Logo" /> **[Rember](https://github.com/rember/rember-mcp)** - Create spaced repetition flashcards in [Rember](https://rember.com) to remember anything you learn in your chats
- <img height="12" width="12" src="https://riza.io/favicon.ico" alt="Riza logo" /> **[Riza](https://github.com/riza-io/riza-mcp)** - Arbitrary code execution and tool-use platform for LLMs by [Riza](https://riza.io)
- <img height="12" width="12" src="https://pics.fatwang2.com/56912e614b35093426c515860f9f2234.svg" /> [Search1API](https://github.com/fatwang2/search1api-mcp) - One API for Search, Crawling, and Sitemaps
- <img height="12" width="12" src="https://screenshotone.com/favicon.ico" alt="ScreenshotOne Logo" /> **[ScreenshotOne](https://github.com/screenshotone/mcp/)** - Render website screenshots with [ScreenshotOne](https://screenshotone.com/)
- <img height="12" width="12" src="https://semgrep.dev/favicon.ico" alt="Semgrep Logo" /> **[Semgrep](https://github.com/semgrep/mcp)** - Enable AI agents to secure code with [Semgrep](https://semgrep.dev/).
- <img height="12" width="12" src="https://www.singlestore.com/favicon-32x32.png?v=277b9cbbe31e8bc416504cf3b902d430"/> **[SingleStore](https://github.com/singlestore-labs/mcp-server-singlestore)** - Interact with the SingleStore database platform
- <img height="12" width="12" src="https://www.starrocks.io/favicon.ico" alt="StarRocks Logo" /> **[StarRocks](https://github.com/StarRocks/mcp-server-starrocks)** - Interact with [StarRocks](https://www.starrocks.io/)
- <img height="12" width="12" src="https://stripe.com/favicon.ico" alt="Stripe Logo" /> **[Stripe](https://github.com/stripe/agent-toolkit)** - Interact with Stripe API
- <img height="12" width="12" src="https://tavily.com/favicon.ico" alt="Tavily Logo" /> **[Tavily](https://github.com/tavily-ai/tavily-mcp)** - Search engine for AI agents (search + extract) powered by [Tavily](https://tavily.com/)
- <img height="12" width="12" src="https://thirdweb.com/favicon.ico" alt="Thirdweb Logo" /> **[Thirdweb](https://github.com/thirdweb-dev/ai/tree/main/python/thirdweb-mcp)** - Read/write to over 2k blockchains, enabling data querying, contract analysis/deployment, and transaction execution, powered by [Thirdweb](https://thirdweb.com/)
- <img height="12" width="12" src="https://www.tinybird.co/favicon.ico" alt="Tinybird Logo" /> **[Tinybird](https://github.com/tinybirdco/mcp-tinybird)** - Interact with Tinybird serverless ClickHouse platform
- <img height="12" width="12" src="https://unifai.network/favicon.ico" alt="UnifAI Logo" /> **[UnifAI](https://github.com/unifai-network/unifai-mcp-server)** - Dynamically search and call tools using [UnifAI Network](https://unifai.network)
- <img height="12" width="12" src="https://framerusercontent.com/images/plcQevjrOYnyriuGw90NfQBPoQ.jpg" alt="Unstructured Logo" /> **[Unstructured](https://github.com/Unstructured-IO/UNS-MCP)** - Set up and interact with your unstructured data processing workflows in [Unstructured Platform](https://unstructured.io)
- **[Vectorize](https://github.com/vectorize-io/vectorize-mcp-server/)** - [Vectorize](https://vectorize.io) MCP server for advanced retrieval, Private Deep Research, Anything-to-Markdown file extraction and text chunking.
- <img height="12" width="12" src="https://verodat.io/assets/favicon-16x16.png" alt="Verodat Logo" /> **[Verodat](https://github.com/Verodat/verodat-mcp-server)** - Interact with Verodat AI Ready Data platform
- <img height="12" width="12" src="https://www.veyrax.com/favicon.ico" alt="VeyraX Logo" /> **[VeyraX](https://github.com/VeyraX/veyrax-mcp)** - Single tool to control all 100+ API integrations, and UI components
- <img height="12" width="12" src="https://www.xero.com/favicon.ico" alt="Xero Logo" /> **[Xero](https://github.com/XeroAPI/xero-mcp-server)** - Interact with the accounting data in your business using our official MCP server
- <img height="12" width="12" src="https://cdn.zapier.com/zapier/images/favicon.ico" alt="Zapier Logo" /> **[Zapier](https://zapier.com/mcp)** - Connect your AI Agents to 8,000 apps instantly.
- **[ZenML](https://github.com/zenml-io/mcp-zenml)** - Interact with your MLOps and LLMOps pipelines through your [ZenML](https://www.zenml.io) MCP server

### 🌎 Community Servers

A growing set of community-developed and maintained servers demonstrates various applications of MCP across different domains.

> **Note:** Community servers are **untested** and should be used at **your own risk**. They are not affiliated with or endorsed by Anthropic.
- **[Ableton Live](https://github.com/Simon-Kansara/ableton-live-mcp-server)** - an MCP server to control Ableton Live.
- **[Airbnb](https://github.com/openbnb-org/mcp-server-airbnb)** - Provides tools to search Airbnb and get listing details.
- **[AI Agent Marketplace Index](https://github.com/AI-Agent-Hub/ai-agent-marketplace-index-mcp)** - MCP server to search more than 5000+ AI agents and tools of various categories from [AI Agent Marketplace Index](http://www.deepnlp.org/store/ai-agent) and monitor traffic of AI Agents.
- **[Algorand](https://github.com/GoPlausible/algorand-mcp)** - A comprehensive MCP server for tooling interactions (40+) and resource accessibility (60+) plus many useful prompts for interacting with the Algorand blockchain.
- **[Airflow](https://github.com/yangkyeongmo/mcp-server-apache-airflow)** - A MCP Server that connects to [Apache Airflow](https://airflow.apache.org/) using official python client.
- **[Airtable](https://github.com/domdomegg/airtable-mcp-server)** - Read and write access to [Airtable](https://airtable.com/) databases, with schema inspection.
- **[Airtable](https://github.com/felores/airtable-mcp)** - Airtable Model Context Protocol Server.
- **[AlphaVantage](https://github.com/calvernaz/alphavantage)** - MCP server for stock market data API [AlphaVantage](https://www.alphavantage.co)
- **[Anki](https://github.com/scorzeth/anki-mcp-server)** - An MCP server for interacting with your [Anki](https://apps.ankiweb.net) decks and cards.
- **[Any Chat Completions](https://github.com/pyroprompts/any-chat-completions-mcp)** - Interact with any OpenAI SDK Compatible Chat Completions API like OpenAI, Perplexity, Groq, xAI and many more.
- **[Apple Calendar](https://github.com/Omar-v2/mcp-ical)** - An MCP server that allows you to interact with your MacOS Calendar through natural language, including features such as event creation, modification, schedule listing, finding free time slots etc.
- **[ArangoDB](https://github.com/ravenwits/mcp-server-arangodb)** - MCP Server that provides database interaction capabilities through [ArangoDB](https://arangodb.com/).
- **[Arduino](https://github.com/vishalmysore/choturobo)** - MCP Server that enables AI-powered robotics using Claude AI and Arduino (ESP32) for real-world automation and interaction with robots.
- **[Atlassian](https://github.com/sooperset/mcp-atlassian)** - Interact with Atlassian Cloud products (Confluence and Jira) including searching/reading Confluence spaces/pages, accessing Jira issues, and project metadata.
- **[Attestable MCP](https://github.com/co-browser/attestable-mcp-server)** - An MCP server running inside a trusted execution environment (TEE) via Gramine, showcasing remote attestation using [RA-TLS](https://gramine.readthedocs.io/en/stable/attestation.html). This allows an MCP client to verify the server before conencting.
- **[AWS](https://github.com/rishikavikondala/mcp-server-aws)** - Perform operations on your AWS resources using an LLM.
- **[AWS Athena](https://github.com/lishenxydlgzs/aws-athena-mcp)** - A MCP server for AWS Athena to run SQL queries on Glue Catalog.
- **[AWS Cost Explorer](https://github.com/aarora79/aws-cost-explorer-mcp-server)** - Optimize your AWS spend (including Amazon Bedrock spend) with this MCP server by examining spend across regions, services, instance types and foundation models ([demo video](https://www.youtube.com/watch?v=WuVOmYLRFmI&feature=youtu.be)).
- **[AWS Resources Operations](https://github.com/baryhuang/mcp-server-aws-resources-python)** - Run generated python code to securely query or modify any AWS resources supported by boto3.
- **[AWS S3](https://github.com/aws-samples/sample-mcp-server-s3)** - A sample MCP server for AWS S3 that flexibly fetches objects from S3 such as PDF documents.
- **[Azure ADX](https://github.com/pab1it0/adx-mcp-server)** - Query and analyze Azure Data Explorer databases.
- **[Azure DevOps](https://github.com/Vortiago/mcp-azure-devops)** - An MCP server that provides a bridge to Azure DevOps services, enabling AI assistants to query and manage work items.
- **[Baidu AI Search](https://github.com/baidubce/app-builder/tree/master/python/mcp_server/ai_search)** - Web search with Baidu Cloud's AI Search
- **[Base Free USDC Transfer](https://github.com/magnetai/mcp-free-usdc-transfer)** - Send USDC on [Base](https://base.org) for free using Claude AI! Built with [Coinbase CDP](https://docs.cdp.coinbase.com/mpc-wallet/docs/welcome).
* **[Basic Memory](https://github.com/basicmachines-co/basic-memory)** - Local-first knowledge management system that builds a semantic graph from Markdown files, enabling persistent memory across conversations with LLMs.
- **[BigQuery](https://github.com/LucasHild/mcp-server-bigquery)** (by LucasHild) - This server enables LLMs to inspect database schemas and execute queries on BigQuery.
- **[BigQuery](https://github.com/ergut/mcp-bigquery-server)** (by ergut) - Server implementation for Google BigQuery integration that enables direct BigQuery database access and querying capabilities
- **[Bing Web Search API](https://github.com/leehanchung/bing-search-mcp)** (by hanchunglee) - Server implementation for Microsoft Bing Web Search API.
- **[Bitable MCP](https://github.com/lloydzhou/bitable-mcp)** (by lloydzhou) - MCP server provides access to Lark Bitable through the Model Context Protocol. It allows users to interact with Bitable tables using predefined tools.
- **[Blender](https://github.com/ahujasid/blender-mcp)** (by ahujasid) - Blender integration allowing prompt enabled 3D scene creation, modeling and manipulation.
- **[browser-use](https://github.com/co-browser/browser-use-mcp-server)** (by co-browser) - browser-use MCP server with dockerized playwright + chromium + vnc. supports stdio & resumable http.
- **[Bsc-mcp](https://github.com/TermiX-official/bsc-mcp)** The first MCP server that serves as the bridge between AI and BNB Chain, enabling AI agents to execute complex on-chain operations through seamless integration with the BNB Chain, including transfer, swap, launch, security check on any token and even more.
- **[Calculator](https://github.com/githejie/mcp-server-calculator)** - This server enables LLMs to use calculator for precise numerical calculations.
- **[CFBD API](https://github.com/lenwood/cfbd-mcp-server)** - An MCP server for the [College Football Data API](https://collegefootballdata.com/).
- **[ChatMCP](https://github.com/AI-QL/chat-mcp)** – An Open Source Cross-platform GUI Desktop application compatible with Linux, macOS, and Windows, enabling seamless interaction with MCP servers across dynamically selectable LLMs, by **[AIQL](https://github.com/AI-QL)**
- **[ChatSum](https://github.com/mcpso/mcp-server-chatsum)** - Query and Summarize chat messages with LLM. by [mcpso](https://mcp.so)
- **[Chroma](https://github.com/privetin/chroma)** - Vector database server for semantic document search and metadata filtering, built on Chroma
- **[ClaudePost](https://github.com/ZilongXue/claude-post)** - ClaudePost enables seamless email management for Gmail, offering secure features like email search, reading, and sending.
- **[Cloudinary](https://github.com/felores/cloudinary-mcp-server)** - Cloudinary Model Context Protocol Server to upload media to Cloudinary and get back the media link and details.
- **[code-assistant](https://github.com/stippi/code-assistant)** - A coding assistant MCP server that allows to explore a code-base and make changes to code. Should be used with trusted repos only (insufficient protection against prompt injections).
- **[code-executor](https://github.com/bazinga012/mcp_code_executor)** - An MCP server that allows LLMs to execute Python code within a specified Conda environment.
- **[code-sandbox-mcp](https://github.com/Automata-Labs-team/code-sandbox-mcp)** - An MCP server to create secure code sandbox environment for executing code within Docker containers.
- **[cognee-mcp](https://github.com/topoteretes/cognee/tree/main/cognee-mcp)** - GraphRAG memory server with customizable ingestion, data processing and search
- **[coin_api_mcp](https://github.com/longmans/coin_api_mcp)** - Provides access to [coinmarketcap](https://coinmarketcap.com/) cryptocurrency data.
- **[Contentful-mcp](https://github.com/ivo-toby/contentful-mcp)** - Read, update, delete, publish content in your [Contentful](https://contentful.com) space(s) from this MCP Server.
- **[crypto-feargreed-mcp](https://github.com/kukapay/crypto-feargreed-mcp)**  -  Providing real-time and historical Crypto Fear & Greed Index data.
- **[cryptopanic-mcp-server](https://github.com/kukapay/cryptopanic-mcp-server)** - Providing latest cryptocurrency news to AI agents, powered by CryptoPanic.
- **[Dappier](https://github.com/DappierAI/dappier-mcp)** - Connect LLMs to real-time, rights-cleared, proprietary data from trusted sources. Access specialized models for Real-Time Web Search, News, Sports, Financial Data, Crypto, and premium publisher content. Explore data models at [marketplace.dappier.com](https://marketplace.dappier.com/marketplace).
- **[Databricks](https://github.com/JordiNeil/mcp-databricks-server)** - Allows LLMs to run SQL queries, list and get details of jobs executions in a Databricks account.
- **[Datadog](https://github.com/GeLi2001/datadog-mcp-server)** - Datadog MCP Server for application tracing, monitoring, dashboard, incidents queries built on official datadog api.
- **[Data Exploration](https://github.com/reading-plus-ai/mcp-server-data-exploration)** - MCP server for autonomous data exploration on .csv-based datasets, providing intelligent insights with minimal effort. NOTE: Will execute arbitrary Python code on your machine, please use with caution!
- **[Dataset Viewer](https://github.com/privetin/dataset-viewer)** - Browse and analyze Hugging Face datasets with features like search, filtering, statistics, and data export
- **[DBHub](https://github.com/bytebase/dbhub/)** - Universal database MCP server connecting to MySQL, PostgreSQL, SQLite, DuckDB and etc.
- **[DeepSeek MCP Server](https://github.com/DMontgomery40/deepseek-mcp-server)** - Model Context Protocol server integrating DeepSeek's advanced language models, in addition to [other useful API endpoints](https://github.com/DMontgomery40/deepseek-mcp-server?tab=readme-ov-file#features)
- **[Deepseek_R1](https://github.com/66julienmartin/MCP-server-Deepseek_R1)** - A Model Context Protocol (MCP) server implementation connecting Claude Desktop with DeepSeek's language models (R1/V3)
- **[deepseek-thinker-mcp](https://github.com/ruixingshi/deepseek-thinker-mcp)** - A MCP (Model Context Protocol) provider Deepseek reasoning content to MCP-enabled AI Clients, like Claude Desktop. Supports access to Deepseek's thought processes from the Deepseek API service or from a local Ollama server.
- **[Descope](https://github.com/descope-sample-apps/descope-mcp-server)** - An MCP server to integrate with [Descope](https://descope.com) to search audit logs, manage users, and more.
- **[DevRev](https://github.com/kpsunil97/devrev-mcp-server)** - An MCP server to integrate with DevRev APIs to search through your DevRev Knowledge Graph where objects can be imported from diff. sources listed [here](https://devrev.ai/docs/import#available-sources).
- **[Dicom](https://github.com/ChristianHinge/dicom-mcp)** - An MCP server to query and retrieve medical images and for parsing and reading dicom-encapsulated documents (pdf etc.). 
- **[Dify](https://github.com/YanxingLiu/dify-mcp-server)** - A simple implementation of an MCP server for dify workflows.
- **[Discord](https://github.com/v-3/discordmcp)** - A MCP server to connect to Discord guilds through a bot and read and write messages in channels
- **[Discord](https://github.com/SaseQ/discord-mcp)** - A MCP server, which connects to Discord through a bot, and provides comprehensive integration with Discord.
- **[Discourse](https://github.com/AshDevFr/discourse-mcp-server)** - A MCP server to search Discourse posts on a Discourse forum.
- **[Docker](https://github.com/ckreiling/mcp-server-docker)** - Integrate with Docker to manage containers, images, volumes, and networks.
- **[Drupal](https://github.com/Omedia/mcp-server-drupal)** - Server for interacting with [Drupal](https://www.drupal.org/project/mcp) using STDIO transport layer.
- **[dune-analytics-mcp](https://github.com/kukapay/dune-analytics-mcp)** -  A mcp server that bridges Dune Analytics data to AI agents.
- **[EdgeOne Pages MCP](https://github.com/TencentEdgeOne/edgeone-pages-mcp)** - An MCP service for deploying HTML content to EdgeOne Pages and obtaining a publicly accessible URL.
- **[Elasticsearch](https://github.com/cr7258/elasticsearch-mcp-server)** - MCP server implementation that provides Elasticsearch interaction.
- **[ElevenLabs](https://github.com/mamertofabian/elevenlabs-mcp-server)** - A server that integrates with ElevenLabs text-to-speech API capable of generating full voiceovers with multiple voices.
- **[Ergo Blockchain MCP](https://github.com/marctheshark3/ergo-mcp)** -An MCP server to integrate Ergo Blockchain Node and Explorer APIs for checking address balances, analyzing transactions, viewing transaction history, performing forensic analysis of addresses, searching for tokens, and monitoring network status.
- **[Eunomia](https://github.com/whataboutyou-ai/eunomia-MCP-server)** - Extension of the Eunomia framework that connects Eunomia instruments with MCP servers
- **[EVM MCP Server](https://github.com/mcpdotdirect/evm-mcp-server)** - Comprehensive blockchain services for 30+ EVM networks, supporting native tokens, ERC20, NFTs, smart contracts, transactions, and ENS resolution.
- **[Everything Search](https://github.com/mamertofabian/mcp-everything-search)** - Fast file searching capabilities across Windows (using [Everything SDK](https://www.voidtools.com/support/everything/sdk/)), macOS (using mdfind command), and Linux (using locate/plocate command).
- **[Excel](https://github.com/haris-musa/excel-mcp-server)** - Excel manipulation including data reading/writing, worksheet management, formatting, charts, and pivot table.
- **[Fantasy PL](https://github.com/rishijatia/fantasy-pl-mcp)** - Give your coding agent direct access to up-to date Fantasy Premier League data
- **[fastn.ai – Unified API MCP Server](https://github.com/fastnai/mcp-fastn)** - A remote, dynamic MCP server with a unified API that connects to 1,000+ tools, actions, and workflows, featuring built-in authentication and monitoring.
- **[Fetch](https://github.com/zcaceres/fetch-mcp)** - A server that flexibly fetches HTML, JSON, Markdown, or plaintext.
- **[Fingertip](https://github.com/fingertip-com/fingertip-mcp)** - MCP server for Fingertip.com to search and create new sites.
- **[Figma](https://github.com/GLips/Figma-Context-MCP)** - Give your coding agent direct access to Figma file data, helping it one-shot design implementation.
- **[Firebase](https://github.com/gannonh/firebase-mcp)** - Server to interact with Firebase services including Firebase Authentication, Firestore, and Firebase Storage.
- **[FireCrawl](https://github.com/vrknetha/mcp-server-firecrawl)** - Advanced web scraping with JavaScript rendering, PDF support, and smart rate limiting
- **[FlightRadar24](https://github.com/sunsetcoder/flightradar24-mcp-server)** - A Claude Desktop MCP server that helps you track flights in real-time using Flightradar24 data.
- **[Ghost](https://github.com/MFYDev/ghost-mcp)** - A Model Context Protocol (MCP) server for interacting with Ghost CMS through LLM interfaces like Claude.
- **[Github Actions](https://github.com/ko1ynnky/github-actions-mcp-server)** - A Model Context Protocol (MCP) server for interacting with Github Actions.
- **[Glean](https://github.com/longyi1207/glean-mcp-server)** - A server that uses Glean API to search and chat.
- **[Gmail](https://github.com/GongRzhe/Gmail-MCP-Server)** - A Model Context Protocol (MCP) server for Gmail integration in Claude Desktop with auto authentication support.
- **[Gmail Headless](https://github.com/baryhuang/mcp-headless-gmail)** - Remote hostable MCP server that can get and send Gmail messages without local credential or file system setup.
- **[Goal Story](https://github.com/hichana/goalstory-mcp)** - a Goal Tracker and Visualization Tool for personal and professional development.
- **[GOAT](https://github.com/goat-sdk/goat/tree/main/typescript/examples/by-framework/model-context-protocol)** - Run more than +200 onchain actions on any blockchain including Ethereum, Solana and Base.
- **[Godot](https://github.com/Coding-Solo/godot-mcp)** - A MCP server providing comprehensive Godot engine integration for project editing, debugging, and scene management.
- **[Golang Filesystem Server](https://github.com/mark3labs/mcp-filesystem-server)** - Secure file operations with configurable access controls built with Go!
- **[Goodnews](https://github.com/VectorInstitute/mcp-goodnews)** - A simple MCP server that delivers curated positive and uplifting news stories.
- **[Google Calendar](https://github.com/v-3/google-calendar)** - Integration with Google Calendar to check schedules, find time, and add/delete events
- **[Google Calendar](https://github.com/nspady/google-calendar-mcp)** - Google Calendar MCP Server for managing Google calendar events. Also supports searching for events by attributes like title and location.
- **[Google Custom Search](https://github.com/adenot/mcp-google-search)** - Provides Google Search results via the Google Custom Search API
- **[Google Tasks](https://github.com/zcaceres/gtasks-mcp)** - Google Tasks API Model Context Protocol Server.
- **[GraphQL Schema](https://github.com/hannesj/mcp-graphql-schema)** - Allow LLMs to explore large GraphQL schemas without bloating the context.
- **[HDW LinkedIn](https://github.com/horizondatawave/hdw-mcp-server)** - Access to profile data and management of user account with [HorizonDataWave.ai](https://horizondatawave.ai/).
- **[Heurist Mesh Agent](https://github.com/heurist-network/heurist-mesh-mcp-server)** - Access specialized web3 AI agents for blockchain analysis, smart contract security, token metrics, and blockchain interactions through the [Heurist Mesh network](https://github.com/heurist-network/heurist-agent-framework/tree/main/mesh).
- **[Holaspirit](https://github.com/syucream/holaspirit-mcp-server)** - Interact with [Holaspirit](https://www.holaspirit.com/).
- **[Home Assistant](https://github.com/tevonsb/homeassistant-mcp)** - Interact with [Home Assistant](https://www.home-assistant.io/) including viewing and controlling lights, switches, sensors, and all other Home Assistant entities.
- **[Home Assistant](https://github.com/voska/hass-mcp)** - Docker-ready MCP server for Home Assistant with entity management, domain summaries, automation support, and guided conversations. Includes pre-built container images for easy installation.
- **[HubSpot](https://github.com/buryhuang/mcp-hubspot)** - HubSpot CRM integration for managing contacts and companies. Create and retrieve CRM data directly through Claude chat.
- **[HuggingFace Spaces](https://github.com/evalstate/mcp-hfspace)** - Server for using HuggingFace Spaces, supporting Open Source Image, Audio, Text Models and more. Claude Desktop mode for easy integration.
- **[Hyperliquid](https://github.com/mektigboy/server-hyperliquid)** - An MCP server implementation that integrates the Hyperliquid SDK for exchange data.
- **[iFlytek Workflow](https://github.com/iflytek/ifly-workflow-mcp-server)** - Connect to iFlytek Workflow via the MCP server and run your own Agent.
- **[Image Generation](https://github.com/GongRzhe/Image-Generation-MCP-Server)** - This MCP server provides image generation capabilities using the Replicate Flux model.
- **[InfluxDB](https://github.com/idoru/influxdb-mcp-server)** - Run queries against InfluxDB OSS API v2.
- **[Inoyu](https://github.com/sergehuber/inoyu-mcp-unomi-server)** - Interact with an Apache Unomi CDP customer data platform to retrieve and update customer profiles
- **[Intercom](https://github.com/raoulbia-ai/mcp-server-for-intercom)** - An MCP-compliant server for retrieving customer support tickets from Intercom. This tool enables AI assistants like Claude Desktop and Cline to access and analyze your Intercom support tickets.
- **[iOS Simulator](https://github.com/InditexTech/mcp-server-simulator-ios-idb)** - A Model Context Protocol (MCP) server that enables LLMs to interact with iOS simulators (iPhone, iPad, etc.) through natural language commands.
- **[iTerm MCP](https://github.com/ferrislucas/iterm-mcp)** - Integration with iTerm2 terminal emulator for macOS, enabling LLMs to execute and monitor terminal commands.
- **[JavaFX](https://github.com/mcpso/mcp-server-javafx)** - Make drawings using a JavaFX canvas
- **[JDBC](https://github.com/quarkiverse/quarkus-mcp-servers/tree/main/jdbc)** - Connect to any JDBC-compatible database and query, insert, update, delete, and more. Supports MySQL, PostgreSQL, Oracle, SQL Server, sqllite and [more](https://github.com/quarkiverse/quarkus-mcp-servers/tree/main/jdbc#supported-jdbc-variants).
- **[JSON](https://github.com/GongRzhe/JSON-MCP-Server)** - JSON handling and processing server with advanced query capabilities using JSONPath syntax and support for array, string, numeric, and date operations.
- **[KiCad MCP](https://github.com/lamaalrajih/kicad-mcp)** - MCP server for KiCad on Mac, Windows, and Linux.
- **[Keycloak MCP](https://github.com/ChristophEnglisch/keycloak-model-context-protocol)** - This MCP server enables natural language interaction with Keycloak for user and realm management including creating, deleting, and listing users and realms.
- **[Kibela](https://github.com/kiwamizamurai/mcp-kibela-server)** (by kiwamizamurai) - Interact with Kibela API.
- **[kintone](https://github.com/macrat/mcp-server-kintone)** - Manage records and apps in [kintone](https://kintone.com) through LLM tools.
- **[Kong Konnect](https://github.com/Kong/mcp-konnect)** - A Model Context Protocol (MCP) server for interacting with Kong Konnect APIs, allowing AI assistants to query and analyze Kong Gateway configurations, traffic, and analytics.
- **[Kubernetes](https://github.com/Flux159/mcp-server-kubernetes)** - Connect to Kubernetes cluster and manage pods, deployments, and services.
- **[Kubernetes and OpenShift](https://github.com/manusa/kubernetes-mcp-server)** - A powerful Kubernetes MCP server with additional support for OpenShift. Besides providing CRUD operations for any Kubernetes resource, this server provides specialized tools to interact with your cluster.
- **[Langflow-DOC-QA-SERVER](https://github.com/GongRzhe/Langflow-DOC-QA-SERVER)** - A Model Context Protocol server for document Q&A powered by Langflow. It demonstrates core MCP concepts by providing a simple interface to query documents through a Langflow backend.
- **[Lightdash](https://github.com/syucream/lightdash-mcp-server)** - Interact with [Lightdash](https://www.lightdash.com/), a BI tool.
- **[Linear](https://github.com/jerhadf/linear-mcp-server)** - Allows LLM to interact with Linear's API for project management, including searching, creating, and updating issues.
- **[Linear (Go)](https://github.com/geropl/linear-mcp-go)** - Allows LLM to interact with Linear's API via a single static binary.
- **[LINE](https://github.com/amornpan/py-mcp-line)** (by amornpan) - Implementation for LINE Bot integration that enables Language Models to read and analyze LINE conversations through a standardized interface. Features asynchronous operation, comprehensive logging, webhook event handling, and support for various message types.
- **[LlamaCloud](https://github.com/run-llama/mcp-server-llamacloud)** (by marcusschiesser) - Integrate the data stored in a managed index on [LlamaCloud](https://cloud.llamaindex.ai/)
- **[llm-context](https://github.com/cyberchitta/llm-context.py)** - Provides a repo-packing MCP tool with configurable profiles that specify file inclusion/exclusion patterns and optional prompts.
- **[mac-messages-mcp](https://github.com/carterlasalle/mac_messages_mcp)** - An MCP server that securely interfaces with your iMessage database via the Model Context Protocol (MCP), allowing LLMs to query and analyze iMessage conversations. It includes robust phone number validation, attachment processing, contact management, group chat handling, and full support for sending and receiving messages.
- **[MariaDB](https://github.com/abel9851/mcp-server-mariadb)** - MariaDB database integration with configurable access controls in Python.
- **[Maton](https://github.com/maton-ai/agent-toolkit/tree/main/modelcontextprotocol)** - Connect to your SaaS tools like HubSpot, Salesforce, and more.
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
- **[Microsoft Teams](https://github.com/InditexTech/mcp-teams-server)** - MCP server that integrates Microsoft Teams messaging (read, post, mention, list members and threads) 
- **[Mindmap](https://github.com/YuChenSSR/mindmap-mcp-server)** (by YuChenSSR) - A server that generates mindmaps from input containing markdown code.
- **[Minima](https://github.com/dmayboroda/minima)** - MCP server for RAG on local files
- **[Mobile MCP](https://github.com/mobile-next/mobile-mcp)** (by Mobile Next) - MCP server for Mobile(iOS/Android) automation, app scraping and development using physical devices or simulators/emulators.
- **[MongoDB](https://github.com/kiliczsh/mcp-mongo-server)** - A Model Context Protocol Server for MongoDB.
- **[MongoDB Lens](https://github.com/furey/mongodb-lens)** - Full Featured MCP Server for MongoDB Databases.
- **[Monday.com](https://github.com/sakce/mcp-server-monday)** - MCP Server to interact with Monday.com boards and items.
- **[Multicluster-MCP-Sever](https://github.com/yanmxa/multicluster-mcp-server)** - The gateway for GenAI systems to interact with multiple Kubernetes clusters.
- **[MySQL](https://github.com/benborla/mcp-server-mysql)** (by benborla) - MySQL database integration in NodeJS with configurable access controls and schema inspection
- **[MySQL](https://github.com/designcomputer/mysql_mcp_server)** (by DesignComputer) - MySQL database integration in Python with configurable access controls and schema inspection
- **[n8n](https://github.com/leonardsellem/n8n-mcp-server)** - This MCP server provides tools and resources for AI assistants to manage n8n workflows and executions, including listing, creating, updating, and deleting workflows, as well as monitoring their execution status.
- **[NASA](https://github.com/ProgramComputer/NASA-MCP-server)** (by ProgramComputer) - Access to a unified gateway of NASA's data sources including but not limited to APOD, NEO, EPIC, GIBS.
- **[Nasdaq Data Link](https://github.com/stefanoamorelli/nasdaq-data-link-mcp)** (by stefanoamorelli) - An MCP server to access, explore, and interact with Nasdaq Data Link’s extensive and valuable financial and economic datasets.
- **[National Parks](https://github.com/KyrieTangSheng/mcp-server-nationalparks)** - The server provides latest information of park details, alerts, visitor centers, campgrounds, hiking trails, and events for U.S. National Parks.
- **[NAVER](https://github.com/pfldy2850/py-mcp-naver)** (by pfldy2850) - This MCP server provides tools to interact with various Naver services, such as searching blogs, news, books, and more.
- **[NS Travel Information](https://github.com/r-huijts/ns-mcp-server)** - Access Dutch Railways (NS) real-time train travel information and disruptions through the official NS API.
- **[Neo4j](https://github.com/da-okazaki/mcp-neo4j-server)** - A community built server that interacts with Neo4j Graph Database.
- **[Neovim](https://github.com/bigcodegen/mcp-neovim-server)** - An MCP Server for your Neovim session.
- **[Notion](https://github.com/suekou/mcp-notion-server)** (by suekou) - Interact with Notion API.
- **[Notion](https://github.com/v-3/notion-server)** (by v-3) - Notion MCP integration. Search, Read, Update, and Create pages through Claude chat.
- **[ntfy-mcp](https://github.com/teddyzxcv/ntfy-mcp)** (by teddyzxcv) - The MCP server that keeps you informed by sending the notification on phone using ntfy
- **[oatpp-mcp](https://github.com/oatpp/oatpp-mcp)** - C++ MCP integration for Oat++. Use [Oat++](https://oatpp.io) to build MCP servers.
- **[Obsidian Markdown Notes](https://github.com/calclavia/mcp-obsidian)** - Read and search through your Obsidian vault or any directory containing Markdown notes
- **[obsidian-mcp](https://github.com/StevenStavrakis/obsidian-mcp)** - (by Steven Stavrakis) An MCP server for Obsidian.md with tools for searching, reading, writing, and organizing notes.
- **[OceanBase](https://github.com/yuanoOo/oceanbase_mcp_server)** - (by yuanoOo) A Model Context Protocol (MCP) server that enables secure interaction with OceanBase databases.
- **[Okta](https://github.com/kapilduraphe/okta-mcp-server)** - Interact with Okta API.
- **[OneNote](https://github.com/rajvirtual/MCP-Servers/tree/master/onenote)** - (by Rajesh Vijay) An MCP server that connects to Microsoft OneNote using the Microsoft Graph API. Reading notebooks, sections, and pages from OneNote,Creating new notebooks, sections, and pages in OneNote.
- **[OpenAI WebSearch MCP](https://github.com/ConechoAI/openai-websearch-mcp)** - This is a Python-based MCP server that provides OpenAI `web_search` build-in tool.
- **[OpenAPI](https://github.com/snaggle-ai/openapi-mcp-server)** - Interact with [OpenAPI](https://www.openapis.org/) APIs.
- **[OpenAPI AnyApi](https://github.com/baryhuang/mcp-server-any-openapi)** - Interact with large [OpenAPI](https://www.openapis.org/) docs using built-in semantic search for endpoints. Allows for customizing the MCP server prefix.
- **[OpenAPI Schema](https://github.com/hannesj/mcp-openapi-schema)** - Allow LLMs to explore large [OpenAPI](https://www.openapis.org/) schemas without bloating the context.
- **[OpenCTI](https://github.com/Spathodea-Network/opencti-mcp)** - Interact with OpenCTI platform to retrieve threat intelligence data including reports, indicators, malware and threat actors.
- **[OpenDota](https://github.com/asusevski/opendota-mcp-server)** - Interact with OpenDota API to retrieve Dota 2 match data, player statistics, and more.
- **[OpenRPC](https://github.com/shanejonas/openrpc-mpc-server)** - Interact with and discover JSON-RPC APIs via [OpenRPC](https://open-rpc.org).
- **[Open Strategy Partners Marketing Tools](https://github.com/open-strategy-partners/osp_marketing_tools)** - Content editing codes, value map, and positioning tools for product marketing.
- **[Pandoc](https://github.com/vivekVells/mcp-pandoc)** - MCP server for seamless document format conversion using Pandoc, supporting Markdown, HTML, PDF, DOCX (.docx), csv and more.
- **[PIF](https://github.com/hungryrobot1/MCP-PIF)** - A Personal Intelligence Framework (PIF), providing tools for file operations, structured reasoning, and journal-based documentation to support continuity and evolving human-AI collaboration across sessions.
- **[Pinecone](https://github.com/sirmews/mcp-pinecone)** - MCP server for searching and uploading records to Pinecone. Allows for simple RAG features, leveraging Pinecone's Inference API.
- **[Placid.app](https://github.com/felores/placid-mcp-server)** - Generate image and video creatives using Placid.app templates
- **[Playwright](https://github.com/executeautomation/mcp-playwright)** - This MCP Server will help you run browser automation and webscraping using Playwright
- **[Postman](https://github.com/shannonlal/mcp-postman)** - MCP server for running Postman Collections locally via Newman. Allows for simple execution of Postman Server and returns the results of whether the collection passed all the tests.
- **[Productboard](https://github.com/kenjihikmatullah/productboard-mcp)** - Integrate the Productboard API into agentic workflows via MCP.
- **[Prometheus](https://github.com/pab1it0/prometheus-mcp-server)** - Query and analyze Prometheus - open-source monitoring system.
- **[Pulumi](https://github.com/dogukanakkaya/pulumi-mcp-server)** - MCP Server to Interact with Pulumi API, creates and lists Stacks
- **[Pushover](https://github.com/ashiknesin/pushover-mcp)** - Send instant notifications to your devices using [Pushover.net](https://pushover.net/)
- **[QGIS](https://github.com/jjsantos01/qgis_mcp)** - connects QGIS to Claude AI through the MCP. This integration enables prompt-assisted project creation, layer loading, code execution, and more.
- **[QuickChart](https://github.com/GongRzhe/Quickchart-MCP-Server)** - A Model Context Protocol server for generating charts using QuickChart.io
- **[Qwen_Max](https://github.com/66julienmartin/MCP-server-Qwen_Max)** - A Model Context Protocol (MCP) server implementation for the Qwen models.
- **[RabbitMQ](https://github.com/kenliao94/mcp-server-rabbitmq)** - The MCP server that interacts with RabbitMQ to publish and consume messages.
- **[RAG Web Browser](https://github.com/apify/mcp-server-rag-web-browser)** An MCP server for Apify's open-source RAG Web Browser [Actor](https://apify.com/apify/rag-web-browser) to perform web searches, scrape URLs, and return content in Markdown.
- **[Reaper](https://github.com/dschuler36/reaper-mcp-server)** - Interact with your [Reaper](https://www.reaper.fm/) (Digital Audio Workstation) projects.
- **[Redis](https://github.com/GongRzhe/REDIS-MCP-Server)** - Redis database operations and caching microservice server with support for key-value operations, expiration management, and pattern-based key listing.
- **[Redis](https://github.com/prajwalnayak7/mcp-server-redis)** MCP server to interact with Redis Server, AWS Memory DB, etc for caching or other use-cases where in-memory and key-value based storage is appropriate
- **[Rememberizer AI](https://github.com/skydeckai/mcp-server-rememberizer)** - An MCP server designed for interacting with the Rememberizer data source, facilitating enhanced knowledge retrieval.
- **[Replicate](https://github.com/deepfates/mcp-replicate)** - Search, run and manage machine learning models on Replicate through a simple tool-based interface. Browse models, create predictions, track their status, and handle generated images.
- **[Rquest](https://github.com/xxxbrian/mcp-rquest)** - An MCP server providing realistic browser-like HTTP request capabilities with accurate TLS/JA3/JA4 fingerprints for bypassing anti-bot measures.
- **[Rijksmuseum](https://github.com/r-huijts/rijksmuseum-mcp)** - Interface with the Rijksmuseum API to search artworks, retrieve artwork details, access image tiles, and explore user collections.
- **[Salesforce MCP](https://github.com/smn2gnt/MCP-Salesforce)** - Interact with Salesforce Data and Metadata
- **[Scholarly](https://github.com/adityak74/mcp-scholarly)** - A MCP server to search for scholarly and academic articles.
- **[scrapling-fetch](https://github.com/cyberchitta/scrapling-fetch-mcp)** - Access text content from bot-protected websites. Fetches HTML/markdown from sites with anti-automation measures using Scrapling.
- **[SearXNG](https://github.com/ihor-sokoliuk/mcp-searxng)** - A Model Context Protocol Server for [SearXNG](https://docs.searxng.org)
- **[ServiceNow](https://github.com/osomai/servicenow-mcp)** - A MCP server to interact with a ServiceNow instance
- **[Shopify](https://github.com/GeLi2001/shopify-mcp)** - MCP to interact with Shopify API including order, product, customers and so on.
- **[Siri Shortcuts](https://github.com/dvcrn/mcp-server-siri-shortcuts)** - MCP to interact with Siri Shortcuts on macOS. Exposes all Shortcuts as MCP tools.
- **[Snowflake](https://github.com/isaacwasserman/mcp-snowflake-server)** - This MCP server enables LLMs to interact with Snowflake databases, allowing for secure and controlled data operations.
- **[Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit/tree/main/examples/agent-kit-mcp-server)** - This MCP server enables LLMs to interact with the Solana blockchain with help of Solana Agent Kit by SendAI, allowing for 40+ protcool actions and growing
- **[Spotify](https://github.com/varunneal/spotify-mcp)** - This MCP allows an LLM to play and use Spotify.
- **[Starwind UI](https://github.com/Boston343/starwind-ui-mcp/)** - This MCP provides relevant commands, documentation, and other information to allow LLMs to take full advantage of Starwind UI's open source Astro components.
- **[Stripe](https://github.com/atharvagupta2003/mcp-stripe)** - This MCP allows integration with Stripe for handling payments, customers, and refunds.
- **[ShaderToy](https://github.com/wilsonchenghy/ShaderToy-MCP)** - This MCP server lets LLMs to interact with the ShaderToy API, allowing LLMs to learn from compute shaders examples and enabling them to create complex GLSL shaders that they are previously not capable of.
- **[TMDB](https://github.com/Laksh-star/mcp-server-tmdb)** - This MCP server integrates with The Movie Database (TMDB) API to provide movie information, search capabilities, and recommendations.
- **[Tavily search](https://github.com/RamXX/mcp-tavily)** - An MCP server for Tavily's search & news API, with explicit site inclusions/exclusions
- **[Telegram](https://github.com/chigwell/telegram-mcp)** - An MCP server that provides paginated chat reading, message retrieval, and message sending capabilities for Telegram through Telethon integration.
- **[Terminal-Control](https://github.com/GongRzhe/terminal-controller-mcp)** - A MCP server that enables secure terminal command execution, directory navigation, and file system operations through a standardized interface.
- **[TFT-Match-Analyzer](https://github.com/GeLi2001/tft-mcp-server)** - MCP server for teamfight tactics match history & match details fetching, providing user the detailed context for every match.
- **[Ticketmaster](https://github.com/delorenj/mcp-server-ticketmaster)** - Search for events, venues, and attractions through the Ticketmaster Discovery API
- **[Todoist](https://github.com/abhiz123/todoist-mcp-server)** - Interact with Todoist to manage your tasks.
- **[Typesense](https://github.com/suhail-ak-s/mcp-typesense-server)** - A Model Context Protocol (MCP) server implementation that provides AI models with access to Typesense search capabilities. This server enables LLMs to discover, search, and analyze data stored in Typesense collections.
- **[Travel Planner](https://github.com/GongRzhe/TRAVEL-PLANNER-MCP-Server)** - Travel planning and itinerary management server integrating with Google Maps API for location search, place details, and route calculations.
- **[Unity Catalog](https://github.com/ognis1205/mcp-server-unitycatalog)** - An MCP server that enables LLMs to interact with Unity Catalog AI, supporting CRUD operations on Unity Catalog Functions and executing them as MCP tools.
- **[Unity3d Game Engine](https://github.com/CoderGamester/mcp-unity)** - An MCP server that enables LLMs to interact with Unity3d Game Engine, supporting access to a variety of the Unit's Editor engine tools (e.g. Console Logs, Test Runner logs, Editor functions, hierarchy state, etc) and executing them as MCP tools or gather them as resources.
- **[Unity Integration (Advanced)](https://github.com/quazaai/UnityMCPIntegration)** - Advanced Unity3d Game Engine MCP which supports ,Execution of Any Editor Related Code Directly Inside of Unity, Fetch Logs, Get Editor State and Allow File Access of the Project making it much more useful in Script Editing or asset creation.
- **[Vega-Lite](https://github.com/isaacwasserman/mcp-vegalite-server)** - Generate visualizations from fetched data using the VegaLite format and renderer.
- **[Video Editor](https://github.com/burningion/video-editing-mcp)** - A Model Context Protocol Server to add, edit, and search videos with [Video Jungle](https://www.video-jungle.com/).
- **[Virtual location (Google Street View,etc.)](https://github.com/mfukushim/map-traveler-mcp)** - Integrates Google Map, Google Street View, PixAI, Stability.ai, ComfyUI API and Bluesky to provide a virtual location simulation in LLM (written in Effect.ts)
- **[VolcEngine TOS](https://github.com/dinghuazhou/sample-mcp-server-tos)** - A sample MCP server for VolcEngine TOS that flexibly get objects from TOS.
- **[Wanaku MCP Router](https://github.com/wanaku-ai/wanaku/)** - The Wanaku MCP Router is a SSE-based MCP server that provides an extensible routing engine that allows integrating your enterprise systems with AI agents.
- **[Webflow](https://github.com/kapilduraphe/webflow-mcp-server)** - Interfact with the Webflow APIs
- **[whale-tracker-mcp](https://github.com/kukapay/whale-tracker-mcp)**  -  A mcp server for tracking cryptocurrency whale transactions. 
- **[Whois MCP](https://github.com/bharathvaj-ganesan/whois-mcp)** - MCP server that performs whois lookup against domain, IP, ASN and TLD. 
- **[Wikidata MCP](https://github.com/zzaebok/mcp-wikidata)** - Wikidata MCP server that interact with Wikidata, by searching identifiers, extracting metadata, and executing sparql query.
- **[WildFly MCP](https://github.com/wildfly-extras/wildfly-mcp)** - WildFly MCP server that enables LLM to interact with running WildFly servers (retrieve metrics, logs, invoke operations, ...).
- **[Windows CLI](https://github.com/SimonB97/win-cli-mcp-server)** - MCP server for secure command-line interactions on Windows systems, enabling controlled access to PowerShell, CMD, and Git Bash shells.
- **[World Bank data API](https://github.com/anshumax/world_bank_mcp_server)** - A server that fetches data indicators available with the World Bank as part of their data API
- **[X (Twitter)](https://github.com/EnesCinr/twitter-mcp)** (by EnesCinr) - Interact with twitter API. Post tweets and search for tweets by query.
- **[X (Twitter)](https://github.com/vidhupv/x-mcp)** (by vidhupv) - Create, manage and publish X/Twitter posts directly through Claude chat.
- **[xcodebuild](https://github.com/ShenghaiWang/xcodebuild)**  - 🍎 Build iOS Xcode workspace/project and feed back errors to llm.
- **[Xero-mcp-server](https://github.com/john-zhang-dev/xero-mcp)** - Enabling clients to interact with Xero system for streamlined accounting, invoicing, and business operations.
- **[XiYan](https://github.com/XGenerationLab/xiyan_mcp_server)** - 🗄️ An MCP server that supports fetching data from a database using natural language queries, powered by XiyanSQL as the text-to-SQL LLM.
- **[XMind](https://github.com/apeyroux/mcp-xmind)** - Read and search through your XMind directory containing XMind files.
- **[YouTube](https://github.com/ZubeidHendricks/youtube-mcp-server)** - Comprehensive YouTube API integration for video management, Shorts creation, and analytics.

## 📚 Frameworks

These are high-level frameworks that make it easier to build MCP servers or clients.

### For servers

* **[EasyMCP](https://github.com/zcaceres/easy-mcp/)** (TypeScript)
- **[FastAPI to MCP auto generator](https://github.com/tadata-org/fastapi_mcp)** – A zero-configuration tool for automatically exposing FastAPI endpoints as MCP tools by **[Tadata](https://tadata.com/)**
* **[FastMCP](https://github.com/punkpeye/fastmcp)** (TypeScript)
* **[Foxy Contexts](https://github.com/strowk/foxy-contexts)** – A library to build MCP servers in Golang by **[strowk](https://github.com/strowk)**
* **[Higress MCP Server Hosting](https://github.com/alibaba/higress/tree/main/plugins/wasm-go/mcp-servers)** - A solution for hosting MCP Servers by extending the API Gateway (based on Envoy) with wasm plugins.
* **[MCP-Framework](https://mcp-framework.com)** Build MCP servers with elegance and speed in Typescript. Comes with a CLI to create your project with `mcp create app`. Get started with your first server in under 5 minutes by **[Alex Andru](https://github.com/QuantGeekDev)**
* **[Quarkus MCP Server SDK](https://github.com/quarkiverse/quarkus-mcp-server)** (Java)
* **[Template MCP Server](https://github.com/mcpdotdirect/template-mcp-server)** - A CLI tool to create a new Model Context Protocol server project with TypeScript support, dual transport options, and an extensible structure

### For clients

* **[codemirror-mcp](https://github.com/marimo-team/codemirror-mcp)** - CodeMirror extension that implements the Model Context Protocol (MCP) for resource mentions and prompt commands

## 📚 Resources

Additional resources on MCP.

- **[AiMCP](https://www.aimcp.info)** - A collection of MCP clients&servers to find the right mcp tools by **[Hekmon](https://github.com/hekmon8)**
- **[Awesome Crypto MCP Servers by badkk](https://github.com/badkk/awesome-crypto-mcp-servers)** - A curated list of MCP servers by **[Luke Fan](https://github.com/badkk)**
- **[Awesome MCP Servers by appcypher](https://github.com/appcypher/awesome-mcp-servers)** - A curated list of MCP servers by **[Stephen Akinyemi](https://github.com/appcypher)**
- **[Awesome MCP Servers by punkpeye](https://github.com/punkpeye/awesome-mcp-servers)** (**[website](https://glama.ai/mcp/servers)**) - A curated list of MCP servers by **[Frank Fiegel](https://github.com/punkpeye)**
- **[Awesome MCP Servers by wong2](https://github.com/wong2/awesome-mcp-servers)** (**[website](https://mcpservers.org)**) - A curated list of MCP servers by **[wong2](https://github.com/wong2)**
- **[Discord Server](https://glama.ai/mcp/discord)** – A community discord server dedicated to MCP by **[Frank Fiegel](https://github.com/punkpeye)**
- **[Discord Server (ModelContextProtocol)](https://discord.gg/jHEGxQu2a5)** – Connect with developers, share insights, and collaborate on projects in an active Discord community dedicated to the Model Context Protocol by **[Alex Andru](https://github.com/QuantGeekDev)**

- **[MCP Badges](https://github.com/mcpx-dev/mcp-badges)** – Quickly highlight your MCP project with clear, eye-catching badges, by **[Ironben](https://github.com/nanbingxyz)**
- **[MCP Servers Hub](https://github.com/apappascs/mcp-servers-hub)** (**[website](https://mcp-servers-hub-website.pages.dev/)**) - A curated list of MCP servers by **[apappascs](https://github.com/apappascs)**
- **[MCP X Community](https://x.com/i/communities/1861891349609603310)** – A X community for MCP by **[Xiaoyi](https://x.com/chxy)**
- **[mcp-cli](https://github.com/wong2/mcp-cli)** - A CLI inspector for the Model Context Protocol by **[wong2](https://github.com/wong2)**
- **[mcp-get](https://mcp-get.com)** - Command line tool for installing and managing MCP servers by **[Michael Latman](https://github.com/michaellatman)**
- **[mcp-guardian](https://github.com/eqtylab/mcp-guardian)** - GUI application + tools for proxying / managing control of MCP servers by **[EQTY Lab](https://eqtylab.io)**
- **[mcp-manager](https://github.com/zueai/mcp-manager)** - Simple Web UI to install and manage MCP servers for Claude Desktop by **[Zue](https://github.com/zueai)**
- **[MCPHub](https://github.com/Jeamee/MCPHub-Desktop)** – An Open Source MacOS & Windows GUI Desktop app for discovering, installing and managing MCP servers by **[Jeamee](https://github.com/jeamee)**
- **[mcp.natoma.id](https://mcp.natoma.id)** - A Hosted MCP Platform to discover, install, manage and deploy MCP servers by **[Natoma Labs](https://www.natoma.id)**
- **[mcp.run](https://mcp.run)** - A hosted registry and control plane to install & run secure + portable MCP Servers.
- **[mcp-dockmaster](https://mcp-dockmaster.com)** - An Open-Sourced UI to install and manage MCP servers for Windows, Linux and MacOS.
- **[MCP Servers Rating and User Reviews](http://www.deepnlp.org/store/ai-agent/mcp-server)** - Website to rate MCP servers, write authentic user reviews, and [search engine for agent & mcp](http://www.deepnlp.org/search/agent)
- <img height="12" width="12" src="https://mkinf.io/favicon-lilac.png" alt="mkinf Logo" /> **[mkinf](https://mkinf.io)** - An Open Source registry of hosted MCP Servers to accelerate AI agent workflows.
- **[Open-Sourced MCP Servers Directory](https://github.com/chatmcp/mcp-directory)** - A curated list of MCP servers by **[mcpso](https://mcp.so)**
- <img height="12" width="12" src="https://opentools.com/favicon.ico" alt="OpenTools Logo" /> **[OpenTools](https://opentools.com)** - An open registry for finding, installing, and building with MCP servers by **[opentoolsteam](https://github.com/opentoolsteam)**
- **[PulseMCP](https://www.pulsemcp.com)** ([API](https://www.pulsemcp.com/api)) - Community hub & weekly newsletter for discovering MCP servers, clients, articles, and news by **[Tadas Antanavicius](https://github.com/tadasant)**, **[Mike Coughlin](https://github.com/macoughl)**, and **[Ravina Patel](https://github.com/ravinahp)**
- **[r/mcp](https://www.reddit.com/r/mcp)** – A Reddit community dedicated to MCP by **[Frank Fiegel](https://github.com/punkpeye)**
- **[r/modelcontextprotocol](https://www.reddit.com/r/modelcontextprotocol)** – A Model Context Protocol community Reddit page - discuss ideas, get answers to your questions, network with like-minded people, and showcase your projects! by **[Alex Andru](https://github.com/QuantGeekDev)**


- **[Smithery](https://smithery.ai/)** - A registry of MCP servers to find the right tools for your LLM agents by **[Henry Mao](https://github.com/calclavia)**
- **[Toolbase](https://gettoolbase.ai)** - Desktop application that manages tools and MCP servers with just a few clicks - no coding required by **[gching](https://github.com/gching)**

## 🚀 Getting Started

### Using MCP Servers in this Repository
Typescript-based servers in this repository can be used directly with `npx`.

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

## 🛠️ Creating Your Own Server

Interested in creating your own MCP server? Visit the official documentation at [modelcontextprotocol.io](https://modelcontextprotocol.io/introduction) for comprehensive guides, best practices, and technical details on implementing MCP servers.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for information about contributing to this repository.

## 🔒 Security

See [SECURITY.md](SECURITY.md) for reporting security vulnerabilities.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💬 Community

- [GitHub Discussions](https://github.com/orgs/modelcontextprotocol/discussions)

## ⭐ Support

If you find MCP servers useful, please consider starring the repository and contributing new servers or improvements!

---

Managed by Anthropic, but built together with the community. The Model Context Protocol is open source and we encourage everyone to contribute their own servers and improvements!
