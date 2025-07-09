# Model Context Protocol servers

This repository is a collection of *reference implementations* for the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), as well as references
to community built servers and additional resources.

The servers in this repository showcase the versatility and extensibility of MCP, demonstrating how it can be used to give Large Language Models (LLMs) secure, controlled access to tools and data sources.
Typically, each MCP server is implemented with an MCP SDK:
- [C# MCP SDK](https://github.com/modelcontextprotocol/csharp-sdk)
- [Java MCP SDK](https://github.com/modelcontextprotocol/java-sdk)
- [Kotlin MCP SDK](https://github.com/modelcontextprotocol/kotlin-sdk)
- [Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Typescript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

> Note: Lists in this README are maintained in alphabetical order to minimize merge conflicts when adding new items.

## 🌟 Reference Servers

These servers aim to demonstrate MCP features and the official SDKs.

- **[Everything](src/everything)** - Reference / test server with prompts, resources, and tools
- **[Fetch](src/fetch)** - Web content fetching and conversion for efficient LLM usage
- **[Filesystem](src/filesystem)** - Secure file operations with configurable access controls
- **[Git](src/git)** - Tools to read, search, and manipulate Git repositories
- **[Memory](src/memory)** - Knowledge graph-based persistent memory system
- **[Sequential Thinking](src/sequentialthinking)** - Dynamic and reflective problem-solving through thought sequences
- **[Time](src/time)** - Time and timezone conversion capabilities

### Archived

The following reference servers are now archived and can be found at [servers-archived](https://github.com/modelcontextprotocol/servers-archived).

- **[AWS KB Retrieval](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/aws-kb-retrieval-server)** - Retrieval from AWS Knowledge Base using Bedrock Agent Runtime
- **[Brave Search](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search)** - Web and local search using Brave's Search API
- **[EverArt](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/everart)** - AI image generation using various models
- **[GitHub](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github)** - Repository management, file operations, and GitHub API integration
- **[GitLab](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gitlab)** - GitLab API, enabling project management
- **[Google Drive](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive)** - File access and search capabilities for Google Drive
- **[Google Maps](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/google-maps)** - Location services, directions, and place details
- **[PostgreSQL](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres)** - Read-only database access with schema inspection
- **[Puppeteer](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer)** - Browser automation and web scraping
- **[Redis](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/redis)** - Interact with Redis key-value stores
- **[Sentry](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sentry)** - Retrieving and analyzing issues from Sentry.io
- **[Slack](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack)** - Channel management and messaging capabilities
- **[Sqlite](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite)** - Database interaction and business intelligence capabilities

## 🤝 Third-Party Servers

### 🎖️ Official Integrations

Official integrations are maintained by companies building production ready MCP servers for their platforms.

- <img height="12" width="12" src="https://www.21st.dev/favicon.ico" alt="21st.dev Logo" /> **[21st.dev Magic](https://github.com/21st-dev/magic-mcp)** - Create crafted UI components inspired by the best 21st.dev design engineers.
- <img height="12" width="12" src="https://framerusercontent.com/images/LpSK1tSZweomrAHOMAj9Gea96lA.svg" alt="Paragon Logo" /> **[ActionKit by Paragon](https://github.com/useparagon/paragon-mcp)** - Connect to 130+ SaaS integrations (e.g. Slack, Salesforce, Gmail) with Paragon’s [ActionKit](https://www.useparagon.com/actionkit) API.
- <img height="12" width="12" src="https://invoxx-public-bucket.s3.eu-central-1.amazonaws.com/frontend-resources/adfin-logo-small.svg" alt="Adfin Logo" /> **[Adfin](https://github.com/Adfin-Engineering/mcp-server-adfin)** - The only platform you need to get paid - all payments in one place, invoicing and accounting reconciliations with [Adfin](https://www.adfin.com/).
- <img height="12" width="12" src="https://www.agentql.com/favicon/favicon.png" alt="AgentQL Logo" /> **[AgentQL](https://github.com/tinyfish-io/agentql-mcp)** - Enable AI agents to get structured data from unstructured web with [AgentQL](https://www.agentql.com/).
- <img height="12" width="12" src="https://agentrpc.com/favicon.ico" alt="AgentRPC Logo" /> **[AgentRPC](https://github.com/agentrpc/agentrpc)** - Connect to any function, any language, across network boundaries using [AgentRPC](https://www.agentrpc.com/).
- **[Agentset](https://github.com/agentset-ai/mcp-server)** - RAG for your knowledge base connected to [Agentset](https://agentset.ai).
- <img height="12" width="12" src="https://aiven.io/favicon.ico" alt="Aiven Logo" /> **[Aiven](https://github.com/Aiven-Open/mcp-aiven)** - Navigate your [Aiven projects](https://go.aiven.io/mcp-server) and interact with the PostgreSQL®, Apache Kafka®, ClickHouse® and OpenSearch® services
- <img height="12" width="12" src="https://www.alation.com/resource-center/download/7p3vnbbznfiw/34FMtBTex5ppvs2hNYa9Fc/c877c37e88e5339878658697c46d2d58/Alation-Logo-Bug-Primary.svg" alt="Alation Logo" /> **[Alation](https://github.com/Alation/alation-ai-agent-sdk)** - Unlock the power of the enterprise Data Catalog by harnessing tools provided by the Alation MCP server.
- **[Algolia](https://github.com/algolia/mcp)** - Use AI agents to provision, configure, and query your [Algolia](https://algolia.com) search indices.
- <img height="12" width="12" src="https://img.alicdn.com/imgextra/i4/O1CN01epkXwH1WLAXkZfV6N_!!6000000002771-2-tps-200-200.png" alt="Alibaba Cloud AnalyticDB for MySQL Logo" /> **[Alibaba Cloud AnalyticDB for MySQL](https://github.com/aliyun/alibabacloud-adb-mysql-mcp-server)** - Connect to a [AnalyticDB for MySQL](https://www.alibabacloud.com/en/product/analyticdb-for-mysql) cluster for getting database or table metadata, querying and analyzing data.It will be supported to add the openapi for cluster operation in the future.
- <img height="12" width="12" src="https://github.com/aliyun/alibabacloud-adbpg-mcp-server/blob/master/images/AnalyticDB.png" alt="Alibaba Cloud AnalyticDB for PostgreSQL Logo" /> **[Alibaba Cloud AnalyticDB for PostgreSQL](https://github.com/aliyun/alibabacloud-adbpg-mcp-server)** - An MCP server to connect to [AnalyticDB for PostgreSQL](https://github.com/aliyun/alibabacloud-adbpg-mcp-server) instances, query and analyze data.
- <img height="12" width="12" src="https://img.alicdn.com/imgextra/i3/O1CN0101UWWF1UYn3rAe3HU_!!6000000002530-2-tps-32-32.png" alt="DataWorks Logo" /> **[Alibaba Cloud DataWorks](https://github.com/aliyun/alibabacloud-dataworks-mcp-server)** - A Model Context Protocol (MCP) server that provides tools for AI, allowing it to interact with the [DataWorks](https://www.alibabacloud.com/help/en/dataworks/) Open API through a standardized interface. This implementation is based on the Alibaba Cloud Open API and enables AI agents to perform cloud resources operations seamlessly.
- <img height="12" width="12" src="https://opensearch-shanghai.oss-cn-shanghai.aliyuncs.com/ouhuang/aliyun-icon.png" alt="Alibaba Cloud OpenSearch Logo" /> **[Alibaba Cloud OpenSearch](https://github.com/aliyun/alibabacloud-opensearch-mcp-server)** - This MCP server equips AI Agents with tools to interact with [OpenSearch](https://help.aliyun.com/zh/open-search/?spm=5176.7946605.J_5253785160.6.28098651AaYZXC) through a standardized and extensible interface.
- <img height="12" width="12" src="https://github.com/aliyun/alibaba-cloud-ops-mcp-server/blob/master/image/alibaba-cloud.png" alt="Alibaba Cloud OPS Logo" /> **[Alibaba Cloud OPS](https://github.com/aliyun/alibaba-cloud-ops-mcp-server)** - Manage the lifecycle of your Alibaba Cloud resources with [CloudOps Orchestration Service](https://www.alibabacloud.com/en/product/oos) and Alibaba Cloud OpenAPI.
- <img height="12" width="12" src="https://github.com/aliyun/alibabacloud-rds-openapi-mcp-server/blob/main/assets/alibabacloudrds.png" alt="Alibaba Cloud RDS MySQL Logo" /> **[Alibaba Cloud RDS](https://github.com/aliyun/alibabacloud-rds-openapi-mcp-server)** - An MCP server designed to interact with the Alibaba Cloud RDS OpenAPI, enabling programmatic management of RDS resources via an LLM.
- <img height="12" width="12" src="https://cdn.allvoicelab.com/resources/workbench/dist/icon-dark.ico" alt="AllVoiceLab Logo" /> **[AllVoiceLab](https://www.allvoicelab.com/mcp)** - An AI voice toolkit with TTS, voice cloning, and video translation, now available as an MCP server for smarter agent integration.
- <img height="12" width="12" src="https://files.alpaca.markets/webassets/favicon-32x32.png" alt="Alpaca Logo" /> **[Alpaca](https://github.com/alpacahq/alpaca-mcp-server)** – Alpaca's MCP server lets you trade stocks and options, analyze market data, and build strategies through [Alpaca's Trading API](https://alpaca.markets/)
- <img height="12" width="12" src="https://www.alphavantage.co/logo.png/" alt="AlphaVantage Logo" /> **[AlphaVantage](https://github.com/calvernaz/alphavantage)** - Connect to 100+ APIs for financial market data, including stock prices, fundamentals, and more from [AlphaVantage](https://www.alphavantage.co)
- <img height="12" width="12" src="https://doris.apache.org/images/favicon.ico" alt="Apache Doris Logo" /> **[Apache Doris](https://github.com/apache/doris-mcp-server)** - MCP Server For [Apache Doris](https://doris.apache.org/), an MPP-based real-time data warehouse.
- <img height="12" width="12" src="https://iotdb.apache.org/img/logo.svg" alt="Apache IoTDB Logo" /> **[Apache IoTDB](https://github.com/apache/iotdb-mcp-server)** - MCP Server for [Apache IoTDB](https://github.com/apache/iotdb) database and its tools
- <img height="12" width="12" src="https://apify.com/favicon.ico" alt="Apify Logo" /> **[Apify](https://github.com/apify/actors-mcp-server)** - [Actors MCP Server](https://apify.com/apify/actors-mcp-server): Use 3,000+ pre-built cloud tools to extract data from websites, e-commerce, social media, search engines, maps, and more
- <img height="12" width="12" src="https://2052727.fs1.hubspotusercontent-na1.net/hubfs/2052727/cropped-cropped-apimaticio-favicon-1-32x32.png" alt="APIMatic Logo" /> **[APIMatic MCP](https://github.com/apimatic/apimatic-validator-mcp)** - APIMatic MCP Server is used to validate OpenAPI specifications using [APIMatic](https://www.apimatic.io/). The server processes OpenAPI files and returns validation summaries by leveraging APIMatic's API.
- <img height="12" width="12" src="https://apollo-server-landing-page.cdn.apollographql.com/_latest/assets/favicon.png" alt="Apollo Graph Logo" /> **[Apollo MCP Server](https://github.com/apollographql/apollo-mcp-server/)** - Connect your GraphQL APIs to AI agents
- <img height="12" width="12" src="https://developer.aqara.com/favicon.ico" alt="Aqara Logo" /> **[Aqara MCP Server](https://github.com/aqara/aqara-mcp-server/)** - Control  [Aqara](https://www.aqara.com/) smart home devices, query status, execute scenes, and much more using natural language.
- <img height="12" width="12" src="https://media.licdn.com/dms/image/v2/C4D0BAQEeD7Dxbpadkw/company-logo_200_200/company-logo_200_200/0/1644692667545/archbee_logo?e=2147483647&v=beta&t=lTi9GRIoqzG6jN3kJC26uZWh0q3uiQelsH6mGoq_Wfw" alt="Archbee Logo" /> **[Archbee](https://www.npmjs.com/package/@archbee/mcp)** - Write and publish documentation that becomes the trusted source for instant answers with AI. Stop cobbling tools and use [Archbee](https://www.archbee.com/) — the first complete documentation platform.
- <img height="12" width="12" src="https://phoenix.arize.com/wp-content/uploads/2023/04/cropped-Favicon-32x32.png" alt="Arize-Phoenix Logo" /> **[Arize Phoenix](https://github.com/Arize-ai/phoenix/tree/main/js/packages/phoenix-mcp)** - Inspect traces, manage prompts, curate datasets, and run experiments using [Arize Phoenix](https://github.com/Arize-ai/phoenix), an open-source AI and LLM observability tool.
- <img height="12" width="12" src="https://731523176-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FaVUBXRZbpAgtjYf5HsvO%2Fuploads%2FaRRrVVocXCTr6GkepfCx%2Flogo_color.svg?alt=media&token=3ba24089-0ab2-421f-a9d9-41f2f94f954a" alt="Armor Logo" /> **[Armor Crypto MCP](https://github.com/armorwallet/armor-crypto-mcp)** - MCP to interface with multiple blockchains, staking, DeFi, swap, bridging, wallet management, DCA, Limit Orders, Coin Lookup, Tracking and more.
- <img height="12" width="12" src="https://console.asgardeo.io/app/libs/themes/wso2is/assets/images/branding/favicon.ico" alt="Asgardeo Logo" /> **[Asgardeo](https://github.com/asgardeo/asgardeo-mcp-server)** - MCP server to interact with your [Asgardeo](https://wso2.com/asgardeo) organization through LLM tools.
- <img height="12" width="12" src="https://www.datastax.com/favicon-32x32.png" alt="DataStax logo" /> **[Astra DB](https://github.com/datastax/astra-db-mcp)** - Comprehensive tools for managing collections and documents in a [DataStax Astra DB](https://www.datastax.com/products/datastax-astra) NoSQL database with a full range of operations such as create, update, delete, find, and associated bulk actions.
- <img height="12" width="12" src="https://cdn.prod.website-files.com/66598898fd13d51606c3215d/66ccbfef13bd8bc19d587578_favicon-32x32.png" alt="Atla Logo" /> **[Atla](https://github.com/atla-ai/atla-mcp-server)** - Enable AI agents to interact with the [Atla API](https://docs.atla-ai.com/) for state-of-the-art LLMJ evaluation.
- <img height="12" width="12" src="https://assets.atlan.com/assets/atlan-a-logo-blue-background.png" alt="Atlan Logo" /> **[Atlan](https://github.com/atlanhq/agent-toolkit/tree/main/modelcontextprotocol)** - The Atlan Model Context Protocol server allows you to interact with the [Atlan](https://www.atlan.com/) services through multiple tools.
- <img height="12" width="12" src="https://www.atlassian.com/favicon.ico" alt="Atlassian Logo" /> **[Atlassian](https://www.atlassian.com/platform/remote-mcp-server)** - Securely interact with Jira work items and Confluence pages, and search across both.
- <img height="12" width="12" src="https://res.oafimg.cn/-/737b3b3ffed9b19e/logo.png" alt="AtomGit Logo" /> **[AtomGit](https://atomgit.com/atomgit-open-source-ecosystem/atomgit-mcp-server)** - Official AtomGit server for integration with repository management, PRs, issues, branches, labels, and more.
- <img height="12" width="12" src="https://resources.audiense.com/hubfs/favicon-1.png" alt="Audiense Logo" /> **[Audiense Insights](https://github.com/AudienseCo/mcp-audiense-insights)** - Marketing insights and audience analysis from [Audiense](https://www.audiense.com/products/audiense-insights) reports, covering demographic, cultural, influencer, and content engagement analysis.
- <img height="12" width="12" src="https://cdn.auth0.com/website/website/favicons/auth0-favicon.svg" alt="Auth0 Logo" /> **[Auth0](https://github.com/auth0/auth0-mcp-server)** - MCP server for interacting with your Auth0 tenant, supporting creating and modifying actions, applications, forms, logs, resource servers, and more.
- <img height="12" width="12" src="https://firstorder.ai/favicon_auth.ico" alt="Authenticator App Logo" /> **[Authenticator App · 2FA](https://github.com/firstorderai/authenticator_mcp)** - A secure MCP (Model Context Protocol) server that enables AI agents to interact with the Authenticator App.
- <img height="12" width="12" src="https://a0.awsstatic.com/libra-css/images/site/fav/favicon.ico" alt="AWS Logo" /> **[AWS](https://github.com/awslabs/mcp)** -  Specialized MCP servers that bring AWS best practices directly to your development workflow.
- <img height="12" width="12" src="https://axiom.co/favicon.ico" alt="Axiom Logo" /> **[Axiom](https://github.com/axiomhq/mcp-server-axiom)** - Query and analyze your Axiom logs, traces, and all other event data in natural language
- <img height="12" width="12" src="https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/acom_social_icon_azure" alt="Microsoft Azure Logo" /> **[Azure](https://github.com/Azure/azure-mcp)** - The Azure MCP Server gives MCP Clients access to key Azure services and tools like Azure Storage, Cosmos DB, the Azure CLI, and more.
- <img height="12" width="12" src="https://mapopen-website-wiki.cdn.bcebos.com/LOGO/lbsyunlogo_icon.ico" alt="Baidu Map Logo" /> **[Baidu Map](https://github.com/baidu-maps/mcp)** - [Baidu Map MCP Server](https://lbsyun.baidu.com/faq/api?title=mcpserver/base) provides tools for AI agents to interact with Baidu Maps APIs, enabling location-based services and geospatial data analysis.
- <img height="12" width="12" src="https://www.bankless.com/favicon.ico" alt="Bankless Logo" /> **[Bankless Onchain](https://github.com/bankless/onchain-mcp)** - Query Onchain data, like ERC20 tokens, transaction history, smart contract state.
- <img height="12" width="12" src="https://bicscan.io/favicon.png" alt="BICScan Logo" /> **[BICScan](https://github.com/ahnlabio/bicscan-mcp)** - Risk score / asset holdings of EVM blockchain address (EOA, CA, ENS) and even domain names.
- <img height="12" width="12" src="https://web-cdn.bitrise.io/favicon.ico" alt="Bitrise Logo" /> **[Bitrise](https://github.com/bitrise-io/bitrise-mcp)** - Chat with your builds, CI, and [more](https://bitrise.io/blog/post/chat-with-your-builds-ci-and-more-introducing-the-bitrise-mcp-server).
- <img height="12" width="12" src="https://boldsign.com/favicon.ico" alt="BoldSign Logo" /> **[BoldSign](https://github.com/boldsign/boldsign-mcp)** - Search, request, and manage e-signature contracts effortlessly with [BoldSign](https://boldsign.com/).
- <img height="12" width="12" src="https://boost.space/favicon.ico" alt="Boost.space Logo" /> **[Boost.space](https://github.com/boostspace/boostspace-mcp-server)** - An MCP server integrating with [Boost.space](https://boost.space) for centralized, automated business data from 2000+ sources.
- <img height="12" width="12" src="https://www.box.com/favicon.ico" alt="Box Logo" /> **[Box](https://github.com/box-community/mcp-server-box)** - Interact with the Intelligent Content Management platform through Box AI.
- <img height="12" width="12" src="https://www.brightdata.com/favicon.ico" alt="BrightData Logo" /> **[BrightData](https://github.com/luminati-io/brightdata-mcp)** - Discover, extract, and interact with the web - one interface powering automated access across the public internet.
- <img height="12" width="12" src="https://browserbase.com/favicon.ico" alt="Browserbase Logo" /> **[Browserbase](https://github.com/browserbase/mcp-server-browserbase)** - Automate browser interactions in the cloud (e.g. web navigation, data extraction, form filling, and more)
- <img height="12" width="12" src="https://browserstack.wpenginepowered.com/wp-content/themes/browserstack/img/favicons/favicon.ico" alt="BrowserStack Logo" /> **[BrowserStack](https://github.com/browserstack/mcp-server)** - Access BrowserStack's [Test Platform](https://www.browserstack.com/test-platform) to debug, write and fix tests, do accessibility testing and more.
- <img height="12" width="12" src="https://cdn.prod.website-files.com/65c0b8763c04cd15daa89b20/671f9d1301ac85495013761d_Favicon-White.png" alt="Bucket" /> **[Bucket](https://github.com/bucketco/bucket-javascript-sdk/tree/main/packages/cli#model-context-protocol)** - Flag features, manage company data, and control feature access using [Bucket](https://bucket.co)
- <img height="12" width="12" src="https://builtwith.com/favicon.ico" alt="BuiltWith Logo" /> **[BuiltWith](https://github.com/builtwith/mcp)** - Identify the technology stack behind any website.
- <img height="12" width="12" src="https://portswigger.net/favicon.ico" alt="PortSwigger Logo" /> **[Burp Suite](https://github.com/PortSwigger/mcp-server)** - MCP Server extension allowing AI clients to connect to [Burp Suite](https://portswigger.net)
- <img height="12" width="12" src="https://campertunity.com/assets/icon/favicon.ico" alt="Campertunity Logo" /> **[Campertunity](https://github.com/campertunity/mcp-server)** - Search campgrounds around the world on campertunity, check availability, and provide booking links.
- <img height="12" width="12" src="https://play.cartesia.ai/icon.png" alt="Cartesia logo" /> **[Cartesia](https://github.com/cartesia-ai/cartesia-mcp)** - Connect to the [Cartesia](https://cartesia.ai/) voice platform to perform text-to-speech, voice cloning etc. 
- <img height="12" width="12" src="https://www.cashfree.com/favicon.ico" alt="Cashfree logo" /> **[Cashfree](https://github.com/cashfree/cashfree-mcp)** - [Cashfree Payments](https://www.cashfree.com/) official MCP server.
- **[CB Insights](https://github.com/cbinsights/cbi-mcp-server)** - Use the [CB Insights](https://www.cbinsights.com) MCP Server to connect to [ChatCBI](https://www.cbinsights.com/chatcbi/)
- <img height="12" width="12" src="https://www.chargebee.com/static/resources/brand/favicon.png" alt="Chargebee Logo" /> **[Chargebee](https://github.com/chargebee/agentkit/tree/main/modelcontextprotocol)** - MCP Server that connects AI agents to [Chargebee platform](https://www.chargebee.com).
- <img height="12" width="12" src="https://cheqd.io/wp-content/uploads/2023/03/logo_cheqd_favicon.png" alt="Cheqd Logo" /> **[Cheqd](https://github.com/cheqd/mcp-toolkit)** - Enable AI Agents to be trusted, verified, prevent fraud, protect your reputation, and more through [cheqd's](https://cheqd.io) Trust Registries and Credentials.
- <img height="12" width="12" src="https://cdn.chiki.studio/brand/logo.png" alt="Chiki StudIO Logo" /> **[Chiki StudIO](https://chiki.studio/galimybes/mcp/)** - Create your own configurable MCP servers purely via configuration (no code), with instructions, prompts, and tools support.
- <img height="12" width="12" src="https://trychroma.com/_next/static/media/chroma-logo.ae2d6e4b.svg" alt="Chroma Logo" /> **[Chroma](https://github.com/chroma-core/chroma-mcp)** - Embeddings, vector search, document storage, and full-text search with the open-source AI application database
- <img height="12" width="12" src="https://www.chronulus.com/favicon/chronulus-logo-blue-on-alpha-square-128x128.ico" alt="Chronulus AI Logo" /> **[Chronulus AI](https://github.com/ChronulusAI/chronulus-mcp)** - Predict anything with Chronulus AI forecasting and prediction agents.
- <img height="12" width="12" src="https://circleci.com/favicon.ico" alt="CircleCI Logo" /> **[CircleCI](https://github.com/CircleCI-Public/mcp-server-circleci)** - Enable AI Agents to fix build failures from CircleCI.
- <img height="12" width="12" src="https://clickhouse.com/favicon.ico" alt="ClickHouse Logo" /> **[ClickHouse](https://github.com/ClickHouse/mcp-clickhouse)** - Query your [ClickHouse](https://clickhouse.com/) database server.
- <img src="http://www.google.com/s2/favicons?domain=www.cloudera.com" alt="Cloudera Iceberg" width="12" height="12"> **[Cloudera Iceberg](https://github.com/cloudera/iceberg-mcp-server)** - enabling AI on the [Open Data Lakehouse](https://www.cloudera.com/products/open-data-lakehouse.html).
- <img height="12" width="12" src="https://cdn.simpleicons.org/cloudflare" /> **[Cloudflare](https://github.com/cloudflare/mcp-server-cloudflare)** - Deploy, configure & interrogate your resources on the Cloudflare developer platform (e.g. Workers/KV/R2/D1)
- <img src="https://cdn.prod.website-files.com/64d41aab8183c7c3324ddb29/67c0f1e272e51cf3c511c17c_Gyph.svg" alt="Cloudinary" width="12" height="12"> **[Cloudinary](https://github.com/cloudinary/mcp-servers)** - Exposes Cloudinary's media upload, transformation, AI analysis, management, optimization and delivery as tools usable by AI agents
- <img height="12" width="12" src="https://app.codacy.com/static/images/favicon-16x16.png" alt="Codacy Logo" /> **[Codacy](https://github.com/codacy/codacy-mcp-server/)** - Interact with [Codacy](https://www.codacy.com) API to query code quality issues, vulnerabilities, and coverage insights about your code.
- <img height="12" width="12" src="https://codelogic.com/wp-content/themes/codelogic/assets/img/favicon.png" alt="CodeLogic Logo" /> **[CodeLogic](https://github.com/CodeLogicIncEngineering/codelogic-mcp-server)** - Interact with [CodeLogic](https://codelogic.com), a Software Intelligence platform that graphs complex code and data architecture dependencies, to boost AI accuracy and insight.
- <img height="12" width="12" src="https://www.coingecko.com/favicon.ico" alt="CoinGecko Logo" /> **[CoinGecko](https://github.com/coingecko/coingecko-typescript/tree/main/packages/mcp-server)** - Official [CoinGecko API](https://www.coingecko.com/en/api) MCP Server for Crypto Price & Market Data, across 200+ Blockchain Networks and 8M+ Tokens.
- <img height="12" width="12" src="https://www.comet.com/favicon.ico" alt="Comet Logo" /> **[Comet Opik](https://github.com/comet-ml/opik-mcp)** - Query and analyze your [Opik](https://github.com/comet-ml/opik) logs, traces, prompts and all other telemtry data from your LLMs in natural language.
- <img height="12" width="12" src="https://cdn.prod.website-files.com/6572bd8c27ee5db3eb91f4b3/6572bd8d27ee5db3eb91f55e_favicon-dashflow-webflow-template.svg" alt="OSS Conductor Logo" /> <img height="12" width="12" src="https://orkes.io/icons/icon-48x48.png" alt="Orkes Conductor Logo" />**[Conductor](https://github.com/conductor-oss/conductor-mcp)** - Interact with Conductor (OSS and Orkes) REST APIs.
- <img height="12" width="12" src="https://www.confluent.io/favicon.ico" alt="Confluent Logo" /> **[Confluent](https://github.com/confluentinc/mcp-confluent)** - Interact with Confluent Kafka and Confluent Cloud REST APIs.
- <img src="https://contrastsecurity.com/favicon.ico" alt="Contrast Security" width="12" height="12"> **[Contrast Security](https://github.com/Contrast-Security-OSS/mcp-contrast)** - Brings Contrast's vulnerability and SCA data into your coding agent to quickly remediate vulnerabilities.
- <img height="12" width="12" src="https://www.convex.dev/favicon.ico" alt="Convex Logo" /> **[Convex](https://stack.convex.dev/convex-mcp-server)** - Introspect and query your apps deployed to Convex.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/605755?s=200&v=4" alt="Couchbase Logo" /> **[Couchbase](https://github.com/Couchbase-Ecosystem/mcp-server-couchbase)** - Interact with the data stored in Couchbase clusters.
- <img height="12" width="12" src="https://github.com/user-attachments/assets/b256f9fa-2020-4b37-9644-c77229ef182b" alt="CRIC 克而瑞 LOGO"> **[CRIC Wuye AI](https://github.com/wuye-ai/mcp-server-wuye-ai)** - Interact with capabilities of the CRIC Wuye AI platform, an intelligent assistant specifically for the property management industry.
- <img height="12" width="12" src="https://app.cycode.com/img/favicon.ico" alt="Cycode Logo" /> **[Cycode](https://github.com/cycodehq/cycode-cli#mcp-command-experiment)** - Boost security in your dev lifecycle via SAST, SCA, Secrets & IaC scanning with [Cycode](https://cycode.com/).
- <img height="12" width="12" src="http://app.itsdart.com/static/img/favicon.png" alt="Dart Logo" /> **[Dart](https://github.com/its-dart/dart-mcp-server)** - Interact with task, doc, and project data in [Dart](https://itsdart.com), an AI-native project management tool
- <img height="12" width="12" src="https://datahub.com/wp-content/uploads/2025/04/cropped-Artboard-1-32x32.png" alt="DataHub Logo" /> **[DataHub](https://github.com/acryldata/mcp-server-datahub)** - Search your data assets, traverse data lineage, write SQL queries, and more using [DataHub](https://datahub.com/) metadata.
- <img height="12" width="12" src="https://www.daytona.io/brand/social-daytona-icon.png" alt="Daytona Logo" /> **[Daytona](https://github.com/daytonaio/daytona/tree/main/apps/cli/mcp)** - Fast and secure execution of your AI generated code with [Daytona](https://daytona.io) sandboxes
- <img height="12" width="12" src="https://debugg.ai/favicon.svg" alt="Debugg AI Logo" /> **[Debugg.AI](https://github.com/debugg-ai/debugg-ai-mcp)** - Zero-Config, Fully AI-Managed End-to-End Testing for any code gen platform via [Debugg.AI](https://debugg.ai) remote browsing test agents.
- <img height="12" width="12" src="https://www.deepl.com/img/logo/deepl-logo-blue.svg" alt="DeepL Logo" /> **[DeepL](https://github.com/DeepLcom/deepl-mcp-server)** - Translate or rewrite text with [DeepL](https://deepl.com)'s very own AI models using [the DeepL API](https://developers.deepl.com/docs)
- <img height="12" width="12" src="https://defang.io/_next/static/media/defang-icon-dark-colour.25f95b77.svg" alt="Defang Logo" /> **[Defang](https://github.com/DefangLabs/defang/blob/main/src/pkg/mcp/README.md)** - Deploy your project to the cloud seamlessly with the [Defang](https://www.defang.io) platform without leaving your integrated development environment
- <img height="12" width="12" src="https://www.devhub.com/img/upload/favicon-196x196-dh.png" alt="DevHub Logo" /> **[DevHub](https://github.com/devhub/devhub-cms-mcp)** - Manage and utilize website content within the [DevHub](https://www.devhub.com) CMS platform
- <img height="12" width="12" src="https://devrev.ai/favicon.ico" alt="DevRev Logo" /> **[DevRev](https://github.com/devrev/mcp-server)** - An MCP server to integrate with DevRev APIs to search through your DevRev Knowledge Graph where objects can be imported from diff. Sources listed [here](https://devrev.ai/docs/import#available-sources).
- <img height="12" width="12" src="https://dexpaprika.com/favicon.ico" alt="DexPaprika Logo" /> **[DexPaprika (CoinPaprika)](https://github.com/coinpaprika/dexpaprika-mcp)** - Access real-time DEX data, liquidity pools, token information, and trading analytics across multiple blockchain networks with [DexPaprika](https://dexpaprika.com) by CoinPaprika.
- <img height="12" width="12" src="https://drata.com/images/favicon.ico" alt="Drata Logo" /> **[Drata](https://drata.com/mcp)** - Get hands-on with our experimental MCP server—bringing real-time compliance intelligence into your AI workflows.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/204530939?s=200&v=4" alt="Dumpling AI Logo" /> **[Dumpling AI](https://github.com/Dumpling-AI/mcp-server-dumplingai)** - Access data, web scraping, and document conversion APIs by [Dumpling AI](https://www.dumplingai.com/)
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/58178984" alt="Dynatrace Logo" /> **[Dynatrace](https://github.com/dynatrace-oss/dynatrace-mcp)** - Manage and interact with the [Dynatrace Platform ](https://www.dynatrace.com/platform) for real-time observability and monitoring.
- <img height="12" width="12" src="https://e2b.dev/favicon.ico" alt="E2B Logo" /> **[E2B](https://github.com/e2b-dev/mcp-server)** - Run code in secure sandboxes hosted by [E2B](https://e2b.dev)
- <img height="12" width="12" src="https://www.edgee.cloud/favicon.ico" alt="Edgee Logo" /> **[Edgee](https://github.com/edgee-cloud/mcp-server-edgee)** - Deploy and manage [Edgee](https://www.edgee.cloud) components and projects
- <img height="12" width="12" src="https://static.edubase.net/media/brand/favicon/favicon-32x32.png" alt="EduBase Logo" /> **[EduBase](https://github.com/EduBase/MCP)** - Interact with [EduBase](https://www.edubase.net), a comprehensive e-learning platform with advanced quizzing, exam management, and content organization capabilities
- <img height="12" width="12" src="https://www.elastic.co/favicon.ico" alt="Elasticsearch Logo" /> **[Elasticsearch](https://github.com/elastic/mcp-server-elasticsearch)** - Query your data in [Elasticsearch](https://www.elastic.co/elasticsearch)
- <img height="12" width="12" src="https://cdn.prod.website-files.com/656eaf5c6da3527caf362363/656ecc07555afac40df4c40e_Facicon.png" alt="Endor Labs Logo" /> **[Endor Labs](https://docs.endorlabs.com/deployment/ide/mcp/)** - Find and fix security risks in you code. Integrate [Endor Labs](https://endorlabs.com) to scan and secure your code from vulnerabilities and secret leaks.
- <img height="12" width="12" src="https://esignatures.com/favicon.ico" alt="eSignatures Logo" /> **[eSignatures](https://github.com/esignaturescom/mcp-server-esignatures)** - Contract and template management for drafting, reviewing, and sending binding contracts.
- <img height="12" width="12" src="https://exa.ai/images/favicon-32x32.png" alt="Exa Logo" /> **[Exa](https://github.com/exa-labs/exa-mcp-server)** - Search Engine made for AIs by [Exa](https://exa.ai)
- **[FalkorDB](https://github.com/FalkorDB/FalkorDB-MCPServer)** - FalkorDB graph database server get schema and read/write-cypher [FalkorDB](https://www.falkordb.com)
- <img height="12" width="12" src="https://fetchserp.com/icon.png" alt="fetchSERP Logo" /> **[fetchSERP](https://github.com/fetchSERP/fetchserp-mcp-server-node)** - All-in-One SEO & Web Intelligence Toolkit API [fetchSERP](https://www.fetchserp.com/)
- <img height="12" width="12" src="https://fewsats.com/favicon.svg" alt="Fewsats Logo" /> **[Fewsats](https://github.com/Fewsats/fewsats-mcp)** - Enable AI Agents to purchase anything in a secure way using [Fewsats](https://fewsats.com)
- <img height="12" width="12" src="https://fibery.io/favicon.svg" alt="Fibery Logo" /> **[Fibery](https://github.com/Fibery-inc/fibery-mcp-server)** - Perform queries and entity operations in your [Fibery](https://fibery.io) workspace.
- <img height="12" width="12" src="https://financialdatasets.ai/favicon.ico" alt="Financial Datasets Logo" /> **[Financial Datasets](https://github.com/financial-datasets/mcp-server)** - Stock market API made for AI agents
- <img height="12" width="12" src="https://www.gstatic.com/devrel-devsite/prod/v7aeef7f1393bb1d75a4489145c511cdd5aeaa8e13ad0a83ec1b5b03612e66330/firebase/images/favicon.png" alt="Firebase Logo" /> **[Firebase](https://github.com/firebase/firebase-tools/blob/master/src/mcp)** - Firebase's experimental [MCP Server](https://firebase.google.com/docs/cli/mcp-server) to power your AI Tools
- <img height="12" width="12" src="https://firecrawl.dev/favicon.ico" alt="Firecrawl Logo" /> **[Firecrawl](https://github.com/mendableai/firecrawl-mcp-server)** - Extract web data with [Firecrawl](https://firecrawl.dev)
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/100200663?s=200&v=4" alt="Firefly Logo" /> **[Firefly](https://github.com/gofireflyio/firefly-mcp)** - Integrates, discovers, manages, and codifies cloud resources with [Firefly](https://firefly.ai).
- <img height="12" width="12" src="https://fireproof.storage/favicon.ico" alt="Fireproof Logo" /> **[Fireproof](https://github.com/fireproof-storage/mcp-database-server)** - Immutable ledger database with live synchronization
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/52471808" alt="Fluid Attacks Logo" /> **[Fluid Attacks](https://github.com/fluidattacks/mcp)** - Interact with the [Fluid Attacks](https://fluidattacks.com/) API, enabling vulnerability management, organization insights, and GraphQL query execution.
- <img height="12" width="12" src="https://forevervm.com/icon.png" alt="ForeverVM Logo" /> **[ForeverVM](https://github.com/jamsocket/forevervm/tree/main/javascript/mcp-server)** - Run Python in a code sandbox.
- <img height="12" width="12" src="https://app.gibsonai.com/favicon.ico" alt="GibsonAI Logo" /> **[GibsonAI](https://github.com/GibsonAI/mcp)** - AI-Powered Cloud databases: Build, migrate, and deploy database instances with AI
- <img height="12" width="12" src="https://gitea.com/assets/img/favicon.svg" alt="Gitea Logo" /> **[Gitea](https://gitea.com/gitea/gitea-mcp)** - Interact with Gitea instances with MCP.
- <img height="12" width="12" src="https://gitee.com/favicon.ico" alt="Gitee Logo" /> **[Gitee](https://github.com/oschina/mcp-gitee)** - Gitee API integration, repository, issue, and pull request management, and more.
- <img height="12" width="12" src="https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png" alt="GitHub Logo" /> **[Github](https://github.com/github/github-mcp-server)** - GitHub's official MCP Server
- <img height="12" width="12" src="https://app.glean.com/images/favicon3-196x196.png" alt="Glean Logo" /> **[Glean](https://github.com/gleanwork/mcp-server)** - Enterprise search and chat using Glean's API.
- <img height="12" width="12" src="https://cdn.jsdelivr.net/gh/jsdelivr/globalping-media@refs/heads/master/icons/android-chrome-192x192.png" alt="Globalping Logo" /> **[Globalping](https://github.com/jsdelivr/globalping-mcp-server)** - Access a network of thousands of probes to run network commands like ping, traceroute, mtr, http and DNS resolve.
- <img height="12" width="12" src="https://gnucleus.ai/favicon.ico" alt="gNucleus Logo" /> **[gNucleus Text-To-CAD](https://github.com/gNucleus/text-to-cad-mcp)** - Generate CAD parts and assemblies from text using gNucleus AI models.
- <img height="12" width="12" src="https://www.gstatic.com/cgc/favicon.ico" alt="Google Cloud Logo" /> **[Google Cloud Run](https://github.com/GoogleCloudPlatform/cloud-run-mcp)** - Deploy code to Google Cloud Run
- <img height="12" width="12" src="https://cdn.prod.website-files.com/6605a2979ff17b2cd1939cd4/6605a460de47e7596ed84f06_icon256.png" alt="gotoHuman Logo" /> **[gotoHuman](https://github.com/gotohuman/gotohuman-mcp-server)** - Human-in-the-loop platform - Allow AI agents and automations to send requests for approval to your [gotoHuman](https://www.gotohuman.com) inbox.
- <img height="12" width="12" src="https://grafana.com/favicon.ico" alt="Grafana Logo" /> **[Grafana](https://github.com/grafana/mcp-grafana)** - Search dashboards, investigate incidents and query datasources in your Grafana instance
- <img height="12" width="12" src="https://grafbase.com/favicon.ico" alt="Grafbase Logo" /> **[Grafbase](https://github.com/grafbase/grafbase/tree/main/crates/mcp)** - Turn your GraphQL API into an efficient MCP server with schema intelligence in a single command.
- <img height="12" width="12" src="https://cdn.prod.website-files.com/5f5e90c17e7c9eb95c7acb17/61d3457a519242f2c75c725c_favicon.png" alt="Grain Logo" /> **[Grain](https://grain.com/release-note/06-18-2025)** - Add your Grain Meetings, Transcripts and Notes direction into  your Grain API into Claude and other AI Chat clients.
- <img height="12" width="12" src="https://framerusercontent.com/images/KCOWBYLKunDff1Dr452y6EfjiU.png" alt="Graphlit Logo" /> **[Graphlit](https://github.com/graphlit/graphlit-mcp-server)** - Ingest anything from Slack to Gmail to podcast feeds, in addition to web crawling, into a searchable [Graphlit](https://www.graphlit.com) project.
- <img height="12" width="12" src="https://greptime.com/favicon.ico" alt="Greptime Logo" /> **[GreptimeDB](https://github.com/GreptimeTeam/greptimedb-mcp-server)** - Provides AI assistants with a secure and structured way to explore and analyze data in [GreptimeDB](https://github.com/GreptimeTeam/greptimedb).
- <img height="12" width="12" src="https://growi.org/assets/images/favicon.ico" alt="GROWI Logo" /> **[GROWI](https://github.com/growilabs/growi-mcp-server)** - Official MCP Server to integrate with GROWI APIs.
- <img height="12" width="12" src="https://gyazo.com/favicon.ico" alt="Gyazo Logo" /> **[Gyazo](https://github.com/nota/gyazo-mcp-server)** - Search, fetch, upload, and interact with Gyazo images, including metadata and OCR data.
- <img height="12" width="12" src="https://cdn.prod.website-files.com/6374050260446c42f94dc90f/63d828be3e13d32ee6973f35_favicon-32x32.png" alt="Harper Logo" /> **[Harper](https://github.com/HarperDB/mcp-server)** - An MCP server providing an interface for MCP clients to access data within [Harper](https://www.harpersystems.dev/).
- <img height="12" width="12" src="https://www.herokucdn.com/favicons/favicon.ico" alt="Heroku Logo" /> **[Heroku](https://github.com/heroku/heroku-mcp-server)** - Interact with the Heroku Platform through LLM-driven tools for managing apps, add-ons, dynos, databases, and more.
- <img height="12" width="12" src="https://www.hiveflow.ai/favicon.ico" alt="Hiveflow Logo" /> **[Hiveflow](https://github.com/hiveflowai/hiveflow-mcp-server)** - Create, manage, and execute agentic AI workflows directly from your assistant.
- <img height="12" width="12" src="https://img.alicdn.com/imgextra/i3/O1CN01d9qrry1i6lTNa2BRa_!!6000000004364-2-tps-218-200.png" alt="Hologres Logo" /> **[Hologres](https://github.com/aliyun/alibabacloud-hologres-mcp-server)** - Connect to a [Hologres](https://www.alibabacloud.com/en/product/hologres) instance, get table metadata, query and analyze data.
- <img height="12" width="12" src="https://www.honeycomb.io/favicon.ico" alt="Honeycomb Logo" /> **[Honeycomb](https://github.com/honeycombio/honeycomb-mcp)** Allows [Honeycomb](https://www.honeycomb.io/) Enterprise customers to query and analyze their data, alerts, dashboards, and more; and cross-reference production behavior with the codebase.
- <img height="12" width="12" src="https://static.hsinfrastatic.net/StyleGuideUI/static-3.438/img/sprocket/favicon-32x32.png" alt="HubSpot Logo" /> **[HubSpot](https://developer.hubspot.com/mcp)** - Connect, manage, and interact with [HubSpot](https://www.hubspot.com/) CRM data
- <img height="12" width="12" src="https://huggingface.co/datasets/huggingface/brand-assets/resolve/main/hf-logo.svg" alt="HuggingFace Logo" /> **[Hugging Face](https://huggingface.co/settings/mcp)** - Connect to the Hugging Face Hub APIs programmatically: semantic search for spaces and papers, exploration of datasets and models, and access to all compatible MCP Gradio tool spaces!
- <img height="12" width="12" src="https://hunter.io/favicon.ico" alt="Hunter Logo" /> **[Hunter](https://github.com/hunter-io/hunter-mcp)** - Interact with the [Hunter API](https://hunter.io) to get B2B data using natural language.
- <img height="12" width="12" src="https://app.hyperbolic.xyz/hyperbolic-logo.svg" alt="Hyperbolic Labs Logo" /> **[Hyperbolic](https://github.com/HyperbolicLabs/hyperbolic-mcp)** - Interact with Hyperbolic's GPU cloud, enabling agents and LLMs to view and rent available GPUs, SSH into them, and run GPU-powered workloads for you.
- <img height="12" width="12" src="https://hyperbrowser-assets-bucket.s3.us-east-1.amazonaws.com/Hyperbrowser-logo.png" alt="Hyperbrowsers23 Logo" /> **[Hyperbrowser](https://github.com/hyperbrowserai/mcp)** - [Hyperbrowser](https://www.hyperbrowser.ai/) is the next-generation platform empowering AI agents and enabling effortless, scalable browser automation.
- **[IBM wxflows](https://github.com/IBM/wxflows/tree/main/examples/mcp/javascript)** - Tool platform by IBM to build, test and deploy tools for any data source
- <img height="12" width="12" src="https://www.getinboxzero.com/icon.png" alt="Inbox Zero Logo" /> **[Inbox Zero](https://github.com/elie222/inbox-zero/tree/main/apps/mcp-server)** - AI personal assistant for email [Inbox Zero](https://www.getinboxzero.com)
- <img height="12" width="12" src="https://www.inflectra.com/Favicon.ico" alt="Inflectra Logo" /> **[Inflectra Spira](https://github.com/Inflectra/mcp-server-spira)** - Connect to your instance of the SpiraTest, SpiraTeam or SpiraPlan application lifecycle management platform by [Inflectra](https://www.inflectra.com)
- <img height="12" width="12" src="https://inkeep.com/favicon.ico" alt="Inkeep Logo" /> **[Inkeep](https://github.com/inkeep/mcp-server-python)** - RAG Search over your content powered by [Inkeep](https://inkeep.com)
- <img height="12" width="12" src="https://integration.app/favicon.ico" alt="Integration App Icon" /> **[Integration App](https://github.com/integration-app/mcp-server)** - Interact with any other SaaS applications on behalf of your customers.
- <img height="12" width="12" src="https://www.ip2location.io/favicon.ico" alt="IP2Location.io Icon" /> **[IP2Location.io](https://github.com/ip2location/mcp-ip2location-io)** - Interact with IP2Location.io API to retrieve the geolocation information for an IP address.
- <img height="12" width="12" src="https://cdn.simpleicons.org/jetbrains" /> **[JetBrains](https://github.com/JetBrains/mcp-jetbrains)** – Work on your code with JetBrains IDEs
- <img height="12" width="12" src="https://speedmedia.jfrog.com/08612fe1-9391-4cf3-ac1a-6dd49c36b276/media.jfrog.com/wp-content/uploads/2019/04/20131046/Jfrog16-1.png" alt="JFrog Logo" /> **[JFrog](https://github.com/jfrog/mcp-jfrog)** - Model Context Protocol (MCP) Server for the [JFrog](https://jfrog.com/) Platform API, enabling repository management, build tracking, release lifecycle management, and more.
- <img height="12" width="12" src="https://kagi.com/favicon.ico" alt="Kagi Logo" /> **[Kagi Search](https://github.com/kagisearch/kagimcp)** - Search the web using Kagi's search API
- <img height="12" width="12" src="https://connection.keboola.com/favicon.ico" alt="Keboola Logo" /> **[Keboola](https://github.com/keboola/keboola-mcp-server)** - Build robust data workflows, integrations, and analytics on a single intuitive platform.
- <img height="12" width="12" src="https://keywordspeopleuse.com/favicon.ico" alt="KeywordsPeopleUse Logo" /> **[KeywordsPeopleUse.com](https://github.com/data-skunks/kpu-mcp)** - Find questions people ask online with [KeywordsPeopleUse](https://keywordspeopleuse.com).
- <img height="12" width="12" src="https://raw.githubusercontent.com/klavis-ai/klavis/main/static/klavis-ai.png" alt="Klavis Logo" /> **[Klavis ReportGen](https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/report_generation)** - Create professional reports from a simple user query.
- <img height="12" width="12" src="https://www.klaviyo.com/media/Favicon-16by16.png" alt="Klaviyo Logo" /> **[Klaviyo](https://developers.klaviyo.com/en/docs/klaviyo_mcp_server)** - Interact with your [Klaviyo](https://www.klaviyo.com/) marketing data.
- <img height="12" width="12" src="https://platform.kluster.ai/logo-light.svg" alt="kluster.ai Logo" /> **[kluster.ai](https://docs.kluster.ai/get-started/mcp/overview/)** - kluster.ai provides MCP servers that bring AI services directly into your development workflow, including guardrails like hallucination detection.
- <img height="12" width="12" src="https://cdn.prod.website-files.com/6347ea26001f0287c592ff91/649953ef7a9ffe1f3e492b5a_Knit%20Logo.svg" alt="Knit Logo" /> **[Knit MCP Server](https://developers.getknit.dev/docs/knit-mcp-server-getting-started)** - Production-ready remote MCP servers that enable you to connect with 10000+ tools across CRM, HRIS, Payroll, Accounting, ERP, Calendar, Expense Management, and Chat categories.
- <img height="12" width="12" src="https://knock.app/favicon/favicon-dark.svg" alt="Knock Logo" /> **[Knock MCP Server](https://github.com/knocklabs/agent-toolkit#model-context-protocol-mcp)** - Send product and customer messaging across email, in-app, push, SMS, Slack, MS Teams.
- <img height="12" width="12" src="https://www.kurrent.io/favicon.ico" alt="Kurrent Logo" /> **[KurrentDB](https://github.com/kurrent-io/mcp-server)** - This is a simple MCP server to help you explore data and prototype projections faster on top of KurrentDB.
- <img height="12" width="12" src="https://kuzudb.com/favicon.ico" alt="Kuzu Logo" /> **[Kuzu](https://github.com/kuzudb/kuzu-mcp-server)** - This server enables LLMs to inspect database schemas and execute queries on the provided Kuzu graph database. See [blog](https://blog.kuzudb.com/post/2025-03-23-kuzu-mcp-server/)) for a debugging use case.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/187484914" alt="KWDB Logo" /> **[KWDB](https://github.com/KWDB/kwdb-mcp-server)** - Reading, writing, querying, modifying data, and performing DDL operations with data in your KWDB Database.
- <img height="12" width="12" src="https://labelstud.io/favicon-16x16.png" alt="Label Studio Logo" /> **[Label Studio](https://github.com/HumanSignal/label-studio-mcp-server)** - Open Source data labeling platform.
- <img src="https://avatars.githubusercontent.com/u/188884511?s=48&v=4" alt="Lambda Capture" width="12" height="12"> **[Lambda Capture](https://github.com/lambda-capture/mcp-server)** - Macroeconomic Forecasts & Semantic Context from Federal Reserve, Bank of England, ECB.
- <img height="12" width="12" src="https://langfuse.com/favicon.ico" alt="Langfuse Logo" /> **[Langfuse Prompt Management](https://github.com/langfuse/mcp-server-langfuse)** - Open-source tool for collaborative editing, versioning, evaluating, and releasing prompts.
- <img height="12" width="12" src="https://laratranslate.com/favicon.ico" alt="Lara Translate Logo" /> **[Lara Translate](https://github.com/translated/lara-mcp)** - MCP Server for Lara Translate API, enabling powerful translation capabilities with support for language detection and context-aware translations.
- <img height="12" width="12" src="https://last9.io/favicon.png" alt="Last9 Logo" /> **[Last9](https://github.com/last9/last9-mcp-server)** - Seamlessly bring real-time production context—logs, metrics, and traces—into your local environment to auto-fix code faster.
- <img height="12" width="12" src="https://www.launchdarkly.com/favicon.ico" alt="LaunchDarkly Logo" /> **[LaunchDarkly](https://github.com/launchdarkly/mcp-server)** - LaunchDarkly is a continuous delivery platform that provides feature flags as a service and allows developers to iterate quickly and safely.
- <img height="12" width="12" src="https://www.line.me/favicon-32x32.png" alt="LINE Logo" /> **[LINE](https://github.com/line/line-bot-mcp-server)** - Integrates the LINE Messaging API to connect an AI Agent to the LINE Official Account.
- <img height="12" width="12" src="https://linear.app/favicon.ico" alt="Linear Logo" /> **[Linear](https://linear.app/docs/mcp)** - Search, create, and update Linear issues, projects, and comments.
- <img height="12" width="12" src="https://lingo.dev/favicon.ico" alt="Lingo.dev Logo" /> **[Lingo.dev](https://github.com/lingodotdev/lingo.dev/blob/main/mcp.md)** - Make your AI agent speak every language on the planet, using [Lingo.dev](https://lingo.dev) Localization Engine.
- <img height="12" width="12" src="https://ligo.ertiqah.com/favicon.avif" alt="LiGo Logo" /> **[LinkedIn MCP Runner](https://github.com/ertiqah/linkedin-mcp-runner)** - Write, edit, and schedule LinkedIn posts right from ChatGPT and Claude with [LiGo](https://ligo.ertiqah.com/).
- <img src="https://gornschool.com/favicon.ico" alt="Lisply" width="12" height="12"> **[Lisply](https://github.com/gornskew/lisply-mcp)** - Flexible frontend for compliant Lisp-speaking backends.
- <img height="12" width="12" src="https://litmus.io/favicon.ico" alt="Litmus.io Logo" /> **[Litmus.io](https://github.com/litmusautomation/litmus-mcp-server)** - Official MCP server for configuring [Litmus](https://litmus.io) Edge for Industrial Data Collection, Edge Analytics & Industrial AI.
- <img height="12" width="12" src="https://liveblocks.io/favicon.ico" alt="Liveblocks Logo" /> **[Liveblocks](https://github.com/liveblocks/liveblocks-mcp-server)** - Ready‑made features for AI & human collaboration—use this to develop your [Liveblocks](https://liveblocks.io) app quicker.
- <img height="12" width="12" src="https://logfire.pydantic.dev/favicon.ico" alt="Logfire Logo" /> **[Logfire](https://github.com/pydantic/logfire-mcp)** - Provides access to OpenTelemetry traces and metrics through Logfire.
- <img height="12" width="12" src="https://make.magicmealkits.com/favicon.ico" alt="Magic Meal Kits Logo" /> **[Magic Meal Kits](https://github.com/pureugong/mmk-mcp)** - Unleash Make's Full Potential by [Magic Meal Kits](https://make.magicmealkits.com/)
- <img height="12" width="12" src="https://www.mailgun.com/favicon.ico" alt="Mailgun Logo" /> **[Mailgun](https://github.com/mailgun/mailgun-mcp-server)** - Interact with Mailgun API.
- <img height="12" width="12" src="https://www.make.com/favicon.ico" alt="Make Logo" /> **[Make](https://github.com/integromat/make-mcp-server)** - Turn your [Make](https://www.make.com/) scenarios into callable tools for AI assistants.
- <img height="12" width="12" src="https://static-assets.mapbox.com/branding/favicon/v1/favicon.ico" alt="Mapbox Logo" /> **[Mapbox](https://github.com/mapbox/mcp-server)** - Unlock geospatial intelligence through Mapbox APIs like geocoding, POI search, directions, isochrones and more.
- <img height="12" width="12" src="https://www.mariadb.com/favicon.ico" alt="MariaDB Logo" /> **[MariaDB](https://github.com/mariadb/mcp)** - A standard interface for managing and querying MariaDB databases, supporting both standard SQL operations and advanced vector/embedding-based search.
- <img height="14" width="14" src="https://raw.githubusercontent.com/rust-mcp-stack/mcp-discovery/refs/heads/main/docs/_media/mcp-discovery-logo.png" alt="mcp-discovery logo" /> **[MCP Discovery](https://github.com/rust-mcp-stack/mcp-discovery)** - A lightweight CLI tool built in Rust for discovering MCP server capabilities.
- <img height="12" width="12" src="https://googleapis.github.io/genai-toolbox/favicons/favicon.ico" alt="MCP Toolbox for Databases Logo" /> **[MCP Toolbox for Databases](https://github.com/googleapis/genai-toolbox)** - Open source MCP server specializing in easy, fast, and secure tools for Databases. Supports  AlloyDB, BigQuery, Bigtable, Cloud SQL, Dgraph, MySQL, Neo4j, Postgres, Spanner, and more.
- <img height="12" width="12" src="https://www.meilisearch.com/favicon.ico" alt="Meilisearch Logo" /> **[Meilisearch](https://github.com/meilisearch/meilisearch-mcp)** - Interact & query with Meilisearch (Full-text & semantic search API)
- <img height="12" width="12" src="https://memgraph.com/favicon.png" alt="Memgraph Logo" /> **[Memgraph](https://github.com/memgraph/mcp-memgraph)** - Query your data in [Memgraph](https://memgraph.com/) graph database.
- <img height="12" width="12" src="https://memgraph.com/favicon.png" alt="Memgraph Logo" /> **[Memgraph](https://github.com/memgraph/ai-toolkit/tree/main/integrations/mcp-memgraph)** - Query your data in [Memgraph](https://memgraph.com/) graph database.
- <img height="12" width="12" src="https://www.mercadopago.com/favicon.ico" alt="MercadoPago Logo" /> **[Mercado Pago](https://mcp.mercadopago.com/)** - Mercado Pago's official MCP server.
- <img height="12" width="12" src="https://metoro.io/static/images/logos/MetoroLogo.png" alt="Metoro Logo" /> **[Metoro](https://github.com/metoro-io/metoro-mcp-server)** - Query and interact with kubernetes environments monitored by Metoro
- <img height="12" width="12" src="https://claritystatic.azureedge.net/images/logo.ico" alt="Microsoft Clarity Logo"/> **[Microsoft Clarity](https://github.com/microsoft/clarity-mcp-server)** - Official MCP Server to get your behavioral analytics data and insights from [Clarity](https://clarity.microsoft.com)
- <img height="12" width="12" src="https://conn-afd-prod-endpoint-bmc9bqahasf3grgk.b01.azurefd.net/releases/v1.0.1735/1.0.1735.4099/commondataserviceforapps/icon.png" alt="Microsoft Dataverse Logo" /> **[Microsoft Dataverse](https://go.microsoft.com/fwlink/?linkid=2320176)** - Chat over your business data using NL - Discover tables, run queries, retrieve data, insert or update records, and execute custom prompts grounded in business knowledge and context.
- <img height="12" width="12" src="https://www.microsoft.com/favicon.ico" alt="microsoft.com favicon" /> **[Microsoft Learn Docs](https://github.com/microsoftdocs/mcp)** - An MCP server that provides structured access to Microsoft’s official documentation. Retrieves accurate, authoritative, and context-aware technical content for code generation, question answering, and workflow grounding.
- <img height="12" width="12" src="https://milvus.io/favicon-32x32.png" /> **[Milvus](https://github.com/zilliztech/mcp-server-milvus)** - Search, Query and interact with data in your Milvus Vector Database.
- <img src="https://avatars.githubusercontent.com/u/94089762?s=48&v=4" alt="Mobb" width="12" height="12"> **[Mobb](https://github.com/mobb-dev/bugsy?tab=readme-ov-file#model-context-protocol-mcp-server)** - The [Mobb Vibe Shield](https://vibe.mobb.ai/) MCP server identifies and remediates vulnerabilities in both human and AI-written code, ensuring your applications remain secure without slowing development.
- <img height="12" width="12" src="https://console.gomomento.com/favicon.ico" /> **[Momento](https://github.com/momentohq/mcp-momento)** - Momento Cache lets you quickly improve your performance, reduce costs, and handle load at any scale.
- <img height="12" width="12" src="https://www.mongodb.com/favicon.ico" /> **[MongoDB](https://github.com/mongodb-js/mongodb-mcp-server)** - Both MongoDB Community Server and MongoDB Atlas are supported.
- <img height="12" width="12" src="https://www.motherduck.com/favicon.ico" alt="MotherDuck Logo" /> **[MotherDuck](https://github.com/motherduckdb/mcp-server-motherduck)** - Query and analyze data with MotherDuck and local DuckDB
- <img height="12" width="12" src="https://docs.mulesoft.com/_/img/favicon.ico" alt="Mulesoft Logo" /> **[Mulesoft](https://www.npmjs.com/package/@mulesoft/mcp-server)** - Build, deploy, and manage MuleSoft applications with natural language, directly inside any compatible IDE.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/38020270" alt="NanoVMs Logo" /> **[NanoVMs](https://github.com/nanovms/ops-mcp)** - Easily Build and Deploy unikernels to any cloud.
- <img height="12" width="12" src="https://needle-ai.com/images/needle-logo-orange-2-rounded.png" alt="Needle AI Logo" /> **[Needle](https://github.com/needle-ai/needle-mcp)** - Production-ready RAG out of the box to search and retrieve data from your own documents.
- <img height="12" width="12" src="https://neo4j.com/favicon.ico" alt="Neo4j Logo" /> **[Neo4j](https://github.com/neo4j-contrib/mcp-neo4j/)** - Neo4j graph database server (schema + read/write-cypher) and separate graph database backed memory
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/183852044?s=48&v=4" alt="Neon Logo" /> **[Neon](https://github.com/neondatabase/mcp-server-neon)** - Interact with the Neon serverless Postgres platform
- <img height="12" width="12" src="https://app.usenerve.com/favicon.ico" alt="Nerve Logo" /> **[Nerve](https://github.com/nerve-hq/nerve-mcp-server)** - Search and Act on all your company data across all your SaaS apps via [Nerve](https://www.usenerve.com/)
- <img height="12" width="12" src="https://www.netdata.cloud/favicon-32x32.png" alt="Netdata Logo" /> **[Netdata](https://github.com/netdata/netdata/blob/master/src/web/mcp/README.md)** - Discovery, exploration, reporting and root cause analysis using all observability data, including metrics, logs, systems, containers, processes, and network connections
- <img height="12" width="12" src="https://www.netlify.com/favicon/icon.svg" alt="Netlify Logo" /> **[Netlify](https://docs.netlify.com/welcome/build-with-ai/netlify-mcp-server/)** - Create, build, deploy, and manage your websites with Netlify web platform.
- <img height="12" width="12" src="https://www.thenile.dev/favicon.ico" alt="Nile Logo" /> **[Nile](https://github.com/niledatabase/nile-mcp-server)** - An MCP server that talks to Nile - Postgres re-engineered for B2B apps. Manage and query databases, tenants, users, auth using LLMs
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/208441832?s=400&v=4" alt="Nodit Logo" /> **[Nodit](https://github.com/noditlabs/nodit-mcp-server)** - Official Nodit MCP Server enabling access to multi-chain RPC Nodes and Data APIs for blockchain data.
- <img height="12" width="12" src="https://app.norman.finance/favicons/favicon-32x32.png" alt="Norman Logo" /> **[Norman Finance](https://github.com/norman-finance/norman-mcp-server)** - MCP server for managing accounting and taxes with Norman Finance.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/4792552?s=200&v=4" alt="Notion Logo" /> **[Notion](https://github.com/makenotion/notion-mcp-server#readme)** - This project implements an MCP server for the Notion API.
- <img height="12" width="12" src="https://www.nutrient.io/assets/images/logos/nutrient.svg" alt="Nutrient Logo" /> **[Nutrient](https://github.com/PSPDFKit/nutrient-dws-mcp-server)** - Create, Edit, Sign, Extract Documents using Natural Language
- <img height="12" width="12" src="https://nx.dev/favicon/favicon.svg" alt="Nx Logo" /> **[Nx](https://github.com/nrwl/nx-console/blob/master/apps/nx-mcp)** - Makes [Nx's understanding](https://nx.dev/features/enhance-AI) of your codebase accessible to LLMs, providing insights into the codebase architecture, project relationships and runnable tasks thus allowing AI to make precise code suggestions.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/82347605?s=48&v=4" alt="OceanBase Logo" /> **[OceanBase](https://github.com/oceanbase/mcp-oceanbase)** - MCP Server for OceanBase database and its tools
- <img height="12" width="12" src="https://docs.octagonagents.com/logo.svg" alt="Octagon Logo" /> **[Octagon](https://github.com/OctagonAI/octagon-mcp-server)** - Deliver real-time investment research with extensive private and public market data.
- <img height="12" width="12" src="https://octoeverywhere.com/img/logo.png" alt="OctoEverywhere Logo" /> **[OctoEverywhere](https://github.com/OctoEverywhere/mcp)** - A 3D Printing MCP server that allows for querying for live state, webcam snapshots, and 3D printer control.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/211697972" alt="Offorte Logo" /> **[Offorte](https://github.com/offorte/offorte-mcp-server#readme)** - Offorte Proposal Software official MCP server enables creation and sending of business proposals.
- <img height="12" width="12" src="https://maps.olakrutrim.com/favicon.ico" alt="Ola Maps" /> **[OlaMaps](https://pypi.org/project/ola-maps-mcp-server)** - Official Ola Maps MCP Server for services like geocode, directions, place details and many more.
- <img height="12" width="12" src="https://static.onlyoffice.com/images/favicon.ico" alt="ONLYOFFICE DocSpace" /> **[ONLYOFFICE DocSpace](https://github.com/ONLYOFFICE/docspace-mcp)** - Interact with [ONLYOFFICE DocSpace](https://www.onlyoffice.com/docspace.aspx) API to create rooms, manage files and folders.
- <img height="12" width="12" src="https://op.gg/favicon.ico" alt="OP.GG Logo" /> **[OP.GG](https://github.com/opgginc/opgg-mcp)** - Access real-time gaming data across popular titles like League of Legends, TFT, and Valorant, offering champion analytics, esports schedules, meta compositions, and character statistics.
- <img height="12" width="12" src="https://opensearch.org/wp-content/uploads/2025/01/opensearch_mark_default.svg" alt="OpenSearch Logo" /> **[OpenSearch](https://github.com/opensearch-project/opensearch-mcp-server-py)** -  MCP server that enables AI agents to perform search and analytics use cases on data stored in [OpenSearch](https://opensearch.org/).
- <img height="12" width="12" src="https://app.opslevel.com/favicon.ico" alt="OpsLevel" /> **[OpsLevel](https://github.com/opslevel/opslevel-mcp)** - Official MCP Server for [OpsLevel](https://www.opslevel.com).
- <img height="12" width="12" src="https://optuna.org/assets/img/favicon.ico" alt="Optuna Logo" /> **[Optuna](https://github.com/optuna/optuna-mcp)** - Official MCP server enabling seamless orchestration of hyperparameter search and other optimization tasks with [Optuna](https://optuna.org/).
- <img height="12" width="12" src="https://oxylabs.io/favicon.ico" alt="Oxylabs Logo" /> **[Oxylabs](https://github.com/oxylabs/oxylabs-mcp)** - Scrape websites with Oxylabs Web API, supporting dynamic rendering and parsing for structured data extraction.
- <img height="12" width="12" src="https://developer.paddle.com/favicon.svg" alt="Paddle Logo" /> **[Paddle](https://github.com/PaddleHQ/paddle-mcp-server)** - Interact with the Paddle API. Manage product catalog, billing and subscriptions, and reports.
- **[Pagos](https://github.com/pagos-ai/pagos-mcp)** - Interact with the Pagos API. Query Credit Card BIN Data with more to come.
- <img height="12" width="12" src="https://paiml.com/favicon.ico" alt="PAIML Logo" /> **[PAIML MCP Agent Toolkit](https://github.com/paiml/paiml-mcp-agent-toolkit)** - Professional project scaffolding toolkit with zero-configuration AI context generation, template generation for Rust/Deno/Python projects, and hybrid neuro-symbolic code analysis.
- <img height="12" width="12" src="https://app.paperinvest.io/favicon.svg" alt="Paper Logo" /> **[Paper](https://github.com/paperinvest/mcp-server)** - Realistic paper trading platform with market simulation, 22 broker emulations, and professional tools for risk-free trading practice. First trading platform with MCP integration.
- **[Patronus AI](https://github.com/patronus-ai/patronus-mcp-server)** - Test, evaluate, and optimize AI agents and RAG apps
- <img height="12" width="12" src="https://www.paypalobjects.com/webstatic/icon/favicon.ico" alt="PayPal Logo" /> **[PayPal](https://mcp.paypal.com)** - PayPal's official MCP server.
- <img height="12" width="12" src="https://ww2-secure.pearl.com/static/pearl/pearl-logo.svg" alt="Pearl Logo" /> **[Pearl](https://github.com/Pearl-com/pearl_mcp_server)** - Official MCP Server to interact with Pearl API. Connect your AI Agents with 12,000+ certified experts instantly.
- <img height="12" width="12" src="https://www.perplexity.ai/favicon.ico" alt="Perplexity Logo" /> **[Perplexity](https://github.com/ppl-ai/modelcontextprotocol)** - An MCP server that connects to Perplexity's Sonar API, enabling real-time web-wide research in conversational AI.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/54333248" /> **[Pinecone](https://github.com/pinecone-io/pinecone-mcp)** - [Pinecone](https://docs.pinecone.io/guides/operations/mcp-server)'s developer MCP Server assist developers in searching documentation and managing data within their development environment.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/54333248" /> **[Pinecone Assistant](https://github.com/pinecone-io/assistant-mcp)** - Retrieves context from your [Pinecone Assistant](https://docs.pinecone.io/guides/assistant/mcp-server) knowledge base.
- <img height="12" width="12" src="https://pipedream.com/favicon.ico" alt="Pipedream Logo" /> **[Pipedream](https://github.com/PipedreamHQ/pipedream/tree/master/modelcontextprotocol)** - Connect with 2,500 APIs with 8,000+ prebuilt tools.
- <img height="12" width="12" src="https://playcanvas.com/static-assets/images/icons/favicon.png" alt="PlayCanvas Logo" /> **[PlayCanvas](https://github.com/playcanvas/editor-mcp-server)** - Create interactive 3D web apps with the PlayCanvas Editor.
- <img height="12" width="12" src="https://www.plugged.in/favicon.ico" alt="Plugged.in Logo" /> **[Plugged.in](https://github.com/VeriTeknik/pluggedin-mcp)** - A comprehensive proxy that combines multiple MCP servers into a single MCP. It provides discovery and management of tools, prompts, resources, and templates across servers, plus a playground for debugging when building MCP servers.
- <img height="12" width="12" src="https://github.com/port-labs/port-mcp-server/blob/main/assets/port_symbol_white.svg" alt="Port Logo" /> **[Port IO](https://github.com/port-labs/port-mcp-server)** - Access and manage your software catalog to improve service quality and compliance.
- **[PostHog](https://github.com/posthog/mcp)** - Interact with PostHog analytics, feature flags, error tracking and more with the official PostHog MCP server.
- **[Postman API](https://github.com/postmanlabs/postman-api-mcp)** - Manage your Postman resources using the [Postman API](https://www.postman.com/postman/postman-public-workspace/collection/i2uqzpp/postman-api).
- <img height="12" width="12" src="https://powerdrill.ai/_next/static/media/powerdrill.0fa27d00.webp" alt="Powerdrill Logo" /> **[Powerdrill](https://github.com/powerdrillai/powerdrill-mcp)** - An MCP server that provides tools to interact with Powerdrill datasets, enabling smart AI data analysis and insights.
- <img height="12" width="12" src="https://www.prisma.io/images/favicon-32x32.png" alt="Prisma Logo" /> **[Prisma](https://www.prisma.io/docs/postgres/mcp-server)** - Create and manage Prisma Postgres databases
- <img height="12" width="12" src="https://docs.speedscale.com/img/favicon.ico" alt="proxymock Logo" /> **[proxymock](https://docs.speedscale.com/proxymock/reference/mcp/)** - An MCP server that automatically generates tests and mocks by recording a live app.
- <img src="https://www.pubnub.com/favicon/favicon-32x32.png" alt="PubNub" width="12" height="12"> **[PubNub](https://github.com/pubnub/pubnub-mcp-server)** - Retrieves context for developing with PubNub SDKs and calling APIs.
- <img height="12" width="12" src="https://www.pulumi.com/images/favicon.ico" alt="Pulumi Logo" /> **[Pulumi](https://github.com/pulumi/mcp-server)** - Deploy and manage cloud infrastructure using [Pulumi](https://pulumi.com).
- <img height="12" width="12" src="https://pure.md/favicon.png" alt="Pure.md Logo" /> **[Pure.md](https://github.com/puremd/puremd-mcp)** - Reliably access web content in markdown format with [pure.md](https://pure.md) (bot detection avoidance, proxy rotation, and headless JS rendering built in).
- <img height="12" width="12" src="https://put.io/images/favicon.ico" alt="Put.io Logo" /> **[Put.io](https://github.com/putdotio/putio-mcp-server)** - Interact with your Put.io account to download torrents.
- <img height="12" width="12" src="https://qdrant.tech/img/brand-resources-logos/logomark.svg" /> **[Qdrant](https://github.com/qdrant/mcp-server-qdrant/)** - Implement semantic memory layer on top of the Qdrant vector search engine
- **[Quickchat AI](https://github.com/incentivai/quickchat-ai-mcp)** - Launch your conversational [Quickchat AI](https://quickchat.ai) agent as an MCP to give AI apps real-time access to its Knowledge Base and conversational capabilities
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/165178062" alt="Ragie Logo" /> **[Ragie](https://github.com/ragieai/ragie-mcp-server/)** - Retrieve context from your [Ragie](https://www.ragie.ai) (RAG) knowledge base connected to integrations like Google Drive, Notion, JIRA and more.
- <img height="12" width="12" src="https://www.ramp.com/favicon.ico" /> **[Ramp](https://github.com/ramp-public/ramp-mcp)** - Interact with [Ramp](https://ramp.com)'s Developer API to run analysis on your spend and gain insights leveraging LLMs
- **[Raygun](https://github.com/MindscapeHQ/mcp-server-raygun)** - Interact with your crash reporting and real using monitoring data on your Raygun account
- <img height="12" width="12" src="https://framerusercontent.com/images/CU1m0xFonUl76ZeaW0IdkQ0M.png" alt="Razorpay Logo" /> **[Razorpay](https://github.com/razorpay/razorpay-mcp-server)** - Razorpay's official MCP server
- <img height="12" width="12" src="https://www.recraft.ai/favicons/icon.svg" alt="Recraft Logo" /> **[Recraft](https://github.com/recraft-ai/mcp-recraft-server)** - Generate raster and vector (SVG) images using [Recraft](https://recraft.ai). Also you can edit, upscale images, create your own styles, and vectorize raster images
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/1529926" alt="Redis Logo" /> **[Redis](https://github.com/redis/mcp-redis/)** - The Redis official MCP Server offers an interface to manage and search data in Redis.
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/1529926" alt="Redis Logo" /> **[Redis Cloud API](https://github.com/redis/mcp-redis-cloud/)** - The Redis Cloud API MCP Server allows you to manage your Redis Cloud resources using natural language.
- <img src="https://avatars.githubusercontent.com/u/149024635" alt="Reexpress" width="12" height="12"> **[Reexpress](https://github.com/ReexpressAI/reexpress_mcp_server)** - Enable Similarity-Distance-Magnitude statistical verification for your search, software, and data science workflows
- <img height="12" width="12" src="https://www.rember.com/favicon.ico" alt="Rember Logo" /> **[Rember](https://github.com/rember/rember-mcp)** - Create spaced repetition flashcards in [Rember](https://rember.com) to remember anything you learn in your chats
- <img height="12" width="12" src="http://nonica.io/Nonica-logo.ico" alt="Nonica Logo" /> **[Revit](https://github.com/NonicaTeam/AI-Connector-for-Revit)** - Connect and interact with your Revit models live.
- <img height="12" width="12" src="https://ui.rilldata.com/favicon.png" alt="Rill Data Logo" /> **[Rill Data](https://docs.rilldata.com/explore/mcp)** - Interact with Rill Data to query and analyze your data.
- <img height="12" width="12" src="https://riza.io/favicon.ico" alt="Riza logo" /> **[Riza](https://github.com/riza-io/riza-mcp)** - Arbitrary code execution and tool-use platform for LLMs by [Riza](https://riza.io)
- <img height="12" width="12" src="https://cdn.foundation.roblox.com/current/RobloxStudio.ico" alt="Roblox Studio" /> **[Roblox Studio](https://github.com/Roblox/studio-rust-mcp-server)** - Roblox Studio MCP Server, create and manipulate scenes, scripts in Roblox Studio
- <img src="https://hyper3d.ai/favicon.ico" alt="Rodin" width="12" height="12"> **[Rodin](https://github.com/DeemosTech/rodin-api-mcp)** - Generate 3D Models with [Hyper3D Rodin](https://hyper3d.ai)
- <img height="12" width="12" src="https://cdn.prod.website-files.com/66b7de6a233c04f4dac200a6/66bed52680d689629483c18b_faviconV2%20(2).png" alt="Root Signals Logo" /> **[Root Signals](https://github.com/root-signals/root-signals-mcp)** - Improve and quality control your outputs with evaluations using LLM-as-Judge
- **[Routine](https://github.com/routineco/mcp-server)** - MCP server to interact with [Routine](https://routine.co/): calendars, tasks, notes, etc.
- <img height="12" width="12" src="https://raw.githubusercontent.com/safedep/.github/refs/heads/main/assets/logo/1.png" alt="SafeDep Logo" /> **[SafeDep](https://github.com/safedep/vet/blob/main/docs/mcp.md)** - SafeDep `vet-mcp` helps in  vetting open source packages for security risks—such as vulnerabilities and malicious code—before they're used in your project, especially with AI-generated code suggestions.
- <img height="12" width="12" src="https://waf-ce.chaitin.cn/favicon.ico" alt="SafeLine Logo" /> **[SafeLine](https://github.com/chaitin/SafeLine/tree/main/mcp_server)** - [SafeLine](https://safepoint.cloud/landing/safeline) is a self-hosted WAF(Web Application Firewall) to protect your web apps from attacks and exploits.
- <img height="12" width="12" src="https://scrapi.tech/favicon.ico" alt="ScrAPI Logo" /> **[ScrAPI](https://github.com/DevEnterpriseSoftware/scrapi-mcp)** - Web scraping using [ScrAPI](https://scrapi.tech). Extract website content that is difficult to access because of bot detection, captchas or even geolocation restrictions.
- <img height="12" width="12" src="https://screenshotone.com/favicon.ico" alt="ScreenshotOne Logo" /> **[ScreenshotOne](https://github.com/screenshotone/mcp/)** - Render website screenshots with [ScreenshotOne](https://screenshotone.com/)
- <img height="12" width="12" src="https://pics.fatwang2.com/56912e614b35093426c515860f9f2234.svg" alt="Search1API Logo" /> **[Search1API](https://github.com/fatwang2/search1api-mcp)** - One API for Search, Crawling, and Sitemaps
- <img height="12" width="12" src="https://semgrep.dev/favicon.ico" alt="Semgrep Logo" /> **[Semgrep](https://github.com/semgrep/mcp)** - Enable AI agents to secure code with [Semgrep](https://semgrep.dev/).
- <img height="12" width="12" src="https://cdn.prod.website-files.com/6372338e5477e047032b37a5/64f85e6388a2a5c8c9525b4d_favLogo.png" alt="Shortcut Logo" /> **[Shortcut](https://github.com/useshortcut/mcp-server-shortcut)** - Access and implement all of your projects and tasks (Stories) from [Shortcut](https://shortcut.com/).
- <img height="12" width="12" src="https://www.singlestore.com/favicon-32x32.png?v=277b9cbbe31e8bc416504cf3b902d430"/> **[SingleStore](https://github.com/singlestore-labs/mcp-server-singlestore)** - Interact with the SingleStore database platform
- <img src="https://smooth-operator.online/logo48.png" alt="Smooth Operator" width="12" height="12"> **[Smooth Operator](https://smooth-operator.online/agent-tools-api-docs/toolserverdocs)** - Tools to automate Windows via AI Vision, Mouse, Keyboard, Automation Trees, Webbrowser
- <img height="12" width="12" src="https://app.snyk.io/bundle/favicon-faj49uD9.png" alt="Snyk Logo" /> **[Snyk](https://github.com/snyk/snyk-ls/blob/main/mcp_extension/README.md)** - Enhance security posture by embedding [Snyk](https://snyk.io/) vulnerability scanning directly into agentic workflows.
- <img height="12" width="12" src="https://www.sonarsource.com/favicon.ico" alt="SonarQube Logo" /> **[SonarQube](https://github.com/SonarSource/sonarqube-mcp-server)** - Enables seamless integration with [SonarQube](https://www.sonarsource.com/) Server or Cloud and allows for code snippet analysis within the agent context.
- <img src="https://sophtron.com/favicon.ico" alt="Sophtron" width="12" height="12"> **[Sophtron](https://github.com/sophtron/Sophtron-Integration/tree/main/modelcontextprotocol)** - Connect to your bank, credit card, utilities accounts to retrieve account balances and transactions with [Sophtron Bank Integration](https://sophtron.com).
- <img height="12" width="12" src="https://www.starrocks.io/favicon.ico" alt="StarRocks Logo" /> **[StarRocks](https://github.com/StarRocks/mcp-server-starrocks)** - Interact with [StarRocks](https://www.starrocks.io/)
- <img height="12" width="12" src="https://downloads.steadybit.com/logomark.svg" alt="Steadybit Logo" /> **[Steadybit](https://github.com/steadybit/mcp)** - Interact with [Steadybit](https://www.steadybit.com/)
- <img height="12" width="12" src="https://stripe.com/favicon.ico" alt="Stripe Logo" /> **[Stripe](https://github.com/stripe/agent-toolkit)** - Interact with Stripe API
- <img height="12" width="12" src="https://supabase.com/favicon/favicon.ico" alt="Supabase Logo" /> **[Supabase](https://github.com/supabase-community/supabase-mcp)** - Interact with Supabase: Create tables, query data, deploy edge functions, and more.
- <img height="12" width="12" src="https://d12w4pyrrczi5e.cloudfront.net/archive/50eb154ab859c63a8f1c850f9fe094e25d35e929/images/favicon.ico" alt="Tako Logo" /> **[Tako](https://github.com/TakoData/tako-mcp)** - Use natural language to search [Tako](https://trytako.com) for real-time financial, sports, weather, and public data with visualization
- <img height="12" width="12" src="https://tavily.com/favicon.ico" alt="Tavily Logo" /> **[Tavily](https://github.com/tavily-ai/tavily-mcp)** - Search engine for AI agents (search + extract) powered by [Tavily](https://tavily.com/)
- <img height="12" width="12" src="https://raw.githubusercontent.com/hashicorp/terraform-mcp-server/main/public/images/Terraform-LogoMark_onDark.svg" alt="Terraform Logo" /> **[Terraform](https://github.com/hashicorp/terraform-mcp-server)** - Seamlessly integrate with Terraform ecosystem, enabling advanced automation and interaction capabilities for Infrastructure as Code (IaC) development powered by [Terraform](https://www.hashicorp.com/en/products/terraform)
- <img height="12" width="12" src="https://www.textin.com/favicon.png" alt="TextIn Logo" /> **[TextIn](https://github.com/intsig-textin/textin-mcp)** - An MCP server for the [TextIn](https://www.textin.com/?from=github_mcp) API, is a tool for extracting text and performing OCR on documents, it also supports converting documents into Markdown
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/106156665?s=200" alt="Thena Logo" /> **[Thena](https://mcp.thena.ai)** - Thena's MCP server for enabling users and AI agents to interact with Thena's services and manage customers across different channels such as Slack, Email, Web, Discord etc.
- <img height="12" width="12" src="https://thirdweb.com/favicon.ico" alt="Thirdweb Logo" /> **[Thirdweb](https://github.com/thirdweb-dev/ai/tree/main/python/thirdweb-mcp)** - Read/write to over 2k blockchains, enabling data querying, contract analysis/deployment, and transaction execution, powered by [Thirdweb](https://thirdweb.com/)
- <img height="12" width="12" src="https://www.thoughtspot.com/favicon-16x16.png" alt="ThoughtSpot Logo" /> **[ThoughtSpot](https://github.com/thoughtspot/mcp-server)** - AI is the new BI. A dedicated data analyst for everyone on your team. Bring [ThoughtSpot](https://thoughtspot.com) powers into Claude or any MCP host.
- <img height="12" width="12" src="https://tianji.msgbyte.com/img/dark-brand.svg" alt="Tianji Logo" /> **[Tianji](https://github.com/msgbyte/tianji/tree/master/apps/mcp-server)** - Interact with Tianji platform whatever selfhosted or cloud platform, powered by [Tianji](https://tianji.msgbyte.com/).
- <img height="12" width="12" src="https://www.pingcap.com/favicon.ico" alt="TiDB Logo" /> **[TiDB](https://github.com/pingcap/pytidb)** - MCP Server to interact with TiDB database platform.
- <img height="12" width="12" src="https://www.tinybird.co/favicon.ico" alt="Tinybird Logo" /> **[Tinybird](https://github.com/tinybirdco/mcp-tinybird)** - Interact with Tinybird serverless ClickHouse platform
- <img height="12" width="12" src="https://b2729162.smushcdn.com/2729162/wp-content/uploads/2023/10/cropped-Favicon-1-192x192.png?lossy=1&strip=1&webp=1" alt="Tldv Logo" /> **[Tldv](https://gitlab.com/tldv/tldv-mcp-server)** - Connect your AI agents to Google-Meet, Zoom & Microsoft Teams through [tl;dv](https://tldv.io)
- <img height="12" width="12" src="https://cdn.tokenmetrics.com/logo.svg" alt="Token Metrics Logo" /> **[Token Metrics](https://github.com/token-metrics/mcp)** - [Token Metrics](https://www.tokenmetrics.com/) integration for fetching real-time crypto market data, trading signals, price predictions, and advanced analytics.
- <img height="12" width="12" src="https://images.thetradeagent.ai/trade_agent/logo.svg" alt="Trade Agent Logo" /> **[Trade Agent](https://github.com/Trade-Agent/trade-agent-mcp)** - Execute stock and crypto trades on your brokerage via [Trade Agent](https://thetradeagent.ai)
- <img height="12" width="12" src="https://www.twilio.com/content/dam/twilio-com/core-assets/social/favicon-16x16.png" alt="Twilio Logo" /> **[Twilio](https://github.com/twilio-labs/mcp)** - Interact with [Twilio](https://www.twilio.com/en-us) APIs to send SMS messages, manage phone numbers, configure your account, and more.
- <img height="12" width="12" src="https://unifai.network/favicon.ico" alt="UnifAI Logo" /> **[UnifAI](https://github.com/unifai-network/unifai-mcp-server)** - Dynamically search and call tools using [UnifAI Network](https://unifai.network)
- <img height="12" width="12" src="https://framerusercontent.com/images/plcQevjrOYnyriuGw90NfQBPoQ.jpg" alt="Unstructured Logo" /> **[Unstructured](https://github.com/Unstructured-IO/UNS-MCP)** - Set up and interact with your unstructured data processing workflows in [Unstructured Platform](https://unstructured.io)
- <img height="12" width="12" src="https://upstash.com/icons/favicon-32x32.png" alt="Upstash Logo" /> **[Upstash](https://github.com/upstash/mcp-server)** - Manage Redis databases and run Redis commands on [Upstash](https://upstash.com/) with natural language.
- <img src="https://www.vantage.sh/favicon.ico" alt="Vantage" width="12" height="12"> **[Vantage](https://github.com/vantage-sh/vantage-mcp-server)** - Interact with your organization's cloud cost spend.
- <img height="12" width="12" src="https://mcp.variflight.com/favicon.ico" alt="VariFlight Logo" /> **[VariFlight](https://github.com/variflight/variflight-mcp)** - VariFlight's official MCP server provides tools to query flight information, weather data, comfort metrics, the lowest available fares, and other civil aviation-related data.
- <img height="12" width="12" src="https://docs.octagonagents.com/logo.svg" alt="Octagon Logo" /> **[VCAgents](https://github.com/OctagonAI/octagon-vc-agents)** - Interact with investor agents—think Wilson or Thiel—continuously updated with market intel.
- **[Vectorize](https://github.com/vectorize-io/vectorize-mcp-server/)** - [Vectorize](https://vectorize.io) MCP server for advanced retrieval, Private Deep Research, Anything-to-Markdown file extraction and text chunking.
- <img height="12" width="12" src="https://static.verbwire.com/favicon-16x16.png" alt="Verbwire Logo" /> **[Verbwire](https://github.com/verbwire/verbwire-mcp-server)** - Deploy smart contracts, mint NFTs, manage IPFS storage, and more through the Verbwire API
- <img height="12" width="12" src="https://verodat.io/assets/favicon-16x16.png" alt="Verodat Logo" /> **[Verodat](https://github.com/Verodat/verodat-mcp-server)** - Interact with Verodat AI Ready Data platform
- <img height="12" width="12" src="https://www.veyrax.com/favicon.ico" alt="VeyraX Logo" /> **[VeyraX](https://github.com/VeyraX/veyrax-mcp)** - Single tool to control all 100+ API integrations, and UI components
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/174736222?s=200&v=4" alt="VictoriaMetrics Logo" /> **[VictoriaMetrics](https://github.com/VictoriaMetrics-Community/mcp-victoriametrics)** - Comprehensive integration with [VictoriaMetrics APIs](https://docs.victoriametrics.com/victoriametrics/url-examples/) and [documentation](https://docs.victoriametrics.com/) for monitoring, observability, and debugging tasks related to your VictoriaMetrics instances.
- <img height="12" width="12" src="https://framerusercontent.com/images/ijlYG00LOcMD6zR1XLMxHbAwZkM.png" alt="VideoDB Director" /> **[VideoDB Director](https://github.com/video-db/agent-toolkit/tree/main/modelcontextprotocol)** - Create AI-powered video workflows including automatic editing, content moderation, voice cloning, highlight generation, and searchable video moments—all accessible via simple APIs and intuitive chat-based interfaces.
- <img height="12" width="12" src="https://landing.ai/wp-content/uploads/2024/04/cropped-favicon-192x192.png" alt="LandingAI VisionAgent" /> **[VisionAgent MCP](https://github.com/landing-ai/vision-agent-mcp)** - A simple MCP server that enables your LLM to better reason over images, video and documents.
- <img height="12" width="12" src="https://raw.githubusercontent.com/mckinsey/vizro/main/vizro-core/docs/assets/images/favicon.png" alt="Vizro Logo" /> **[Vizro](https://github.com/mckinsey/vizro/tree/main/vizro-mcp)** - Tools and templates to create validated and maintainable data charts and dashboards
- <img height="12" width="12" src="https://wavespeed.ai/logo.webp" alt="WaveSpeed Logo" /> **[WaveSpeed](https://github.com/WaveSpeedAI/mcp-server)** - WaveSpeed MCP server providing AI agents with image and video generation capabilities.
- <img height="12" width="12" src="https://waystation.ai/images/logo.svg" alt="WayStation Logo" /> **[WayStation](https://github.com/waystation-ai/mcp)** - Universal MCP server to connect to popular productivity tools such as Notion, Monday, AirTable, and many more
- <img height="12" width="12" src="https://www.webflow.com/favicon.ico" alt="Webflow Logo"> **[Webflow](https://github.com/webflow/mcp-server)** - Interact with Webflow sites, pages, and collections
- <img height="12" width="12" src="https://webscraping.ai/favicon.ico" alt="WebScraping.AI Logo" /> **[WebScraping.AI](https://github.com/webscraping-ai/webscraping-ai-mcp-server)** - Interact with **[WebScraping.AI](https://WebScraping.AI)** for web data extraction and scraping
- <img height="12" width="12" src="https://www.xero.com/favicon.ico" alt="Xero Logo" /> **[Xero](https://github.com/XeroAPI/xero-mcp-server)** - Interact with the accounting data in your business using our official MCP server
- <img height="12" width="12" src="https://storage.yandexcloud.net/ydb-www-prod-site-assets/favicon-202305/favicon.ico" alt="YDB Logo" /> **[YDB](https://github.com/ydb-platform/ydb-mcp)** - Query [YDB](https://ydb.tech/) databases
- <img height="12" width="12" src="https://cdn.prod.website-files.com/632cd328ed2b485519c3f689/6334977a5d1a542102d4b9b5_favicon-32x32.png" alt="YepCode Logo" /> **[YepCode](https://github.com/yepcode/mcp-server-js)** - Run code in a secure, scalable sandbox environment with full support for dependencies, secrets, logs, and access to APIs or databases. Powered by [YepCode](https://yepcode.io)
- <img height="12" width="12" src="https://www.yugabyte.com/favicon-16x16.png" alt="YugabyteDB Logo" /> **[YugabyteDB](https://github.com/yugabyte/yugabytedb-mcp-server)** -  MCP Server to interact with your [YugabyteDB](https://www.yugabyte.com/) database
- <img height="12" width="12" src="https://avatars.githubusercontent.com/u/14069894" alt="Yunxin Logo" /> **[Yunxin](https://github.com/netease-im/yunxin-mcp-server)** - An MCP server that connects to Yunxin's IM/RTC/DATA Open-API
- <img height="12" width="12" src="https://cdn.zapier.com/zapier/images/favicon.ico" alt="Zapier Logo" /> **[Zapier](https://zapier.com/mcp)** - Connect your AI Agents to 8,000 apps instantly.
- **[ZenML](https://github.com/zenml-io/mcp-zenml)** - Interact with your MLOps and LLMOps pipelines through your [ZenML](https://www.zenml.io) MCP server
- <img height="12" width="12" src="https://zizai.work/images/logo.jpg" alt="ZIZAI Logo" /> **[ZIZAI Recruitment](https://github.com/zaiwork/mcp)** - Interact with the next-generation intelligent recruitment platform for employees and employers, powered by [ZIZAI Recruitment](https://zizai.work).

### 🌎 Community Servers

A growing set of community-developed and maintained servers demonstrates various applications of MCP across different domains.

> **Note:** Community servers are **untested** and should be used at **your own risk**. They are not affiliated with or endorsed by Anthropic.
- **[1Panel](https://github.com/1Panel-dev/mcp-1panel)** - MCP server implementation that provides 1Panel interaction.
- **[A2A](https://github.com/GongRzhe/A2A-MCP-Server)** - An MCP server that bridges the Model Context Protocol (MCP) with the Agent-to-Agent (A2A) protocol, enabling MCP-compatible AI assistants (like Claude) to seamlessly interact with A2A agents.
- **[Ableton Live](https://github.com/Simon-Kansara/ableton-live-mcp-server)** - an MCP server to control Ableton Live.
- **[Ableton Live](https://github.com/ahujasid/ableton-mcp)** (by ahujasid) - Ableton integration allowing prompt enabled music creation.
- **[Actor Critic Thinking](https://github.com/aquarius-wing/actor-critic-thinking-mcp)** - Actor-critic thinking for performance evaluation
- **[AgentBay](https://github.com/Michael98671/agentbay)** - An MCP server for providing serverless cloud infrastructure for AI agents.
- **[Ahrefs](https://github.com/universal-mcp/ahrefs)** - Ahrefs MCP server from **[agentr](https://agentr.dev/)** that provides programmatic access to SEO data, including backlinks, keywords, and site audit information.
- **[AI Agent Marketplace Index](https://github.com/AI-Agent-Hub/ai-agent-marketplace-index-mcp)** - MCP server to search more than 5000+ AI agents and tools of various categories from [AI Agent Marketplace Index](http://www.deepnlp.org/store/ai-agent) and monitor traffic of AI Agents.
- **[AI Tasks](https://github.com/jbrinkman/valkey-ai-tasks)** - Let the AI manage complex plans with integrated task management and tracking tools. Supports STDIO, SSE and Streamable HTTP transports.
- **[ai-Bible](https://github.com/AdbC99/ai-bible)** - Search the bible reliably and repeatably [ai-Bible Labs](https://ai-bible.com)
- **[Airbnb](https://github.com/openbnb-org/mcp-server-airbnb)** - Provides tools to search Airbnb and get listing details.
- **[Airflow](https://github.com/yangkyeongmo/mcp-server-apache-airflow)** - A MCP Server that connects to [Apache Airflow](https://airflow.apache.org/) using official python client.
- **[Airtable](https://github.com/domdomegg/airtable-mcp-server)** - Read and write access to [Airtable](https://airtable.com/) databases, with schema inspection.
- **[Airtable](https://github.com/felores/airtable-mcp)** - Airtable Model Context Protocol Server.
- **[Algorand](https://github.com/GoPlausible/algorand-mcp)** - A comprehensive MCP server for tooling interactions (40+) and resource accessibility (60+) plus many useful prompts for interacting with the Algorand blockchain.
- **[Amadeus](https://github.com/donghyun-chae/mcp-amadeus)** (by donghyun-chae) - An MCP server to access, explore, and interact with Amadeus Flight Offers Search API for retrieving detailed flight options, including airline, times, duration, and pricing data.
- **[Amazon Ads](https://github.com/MarketplaceAdPros/amazon-ads-mcp-server)** - MCP Server that provides interaction capabilities with Amazon Advertising through [MarketplaceAdPros](https://marketplaceadpros.com)/
- **[Anki](https://github.com/scorzeth/anki-mcp-server)** - An MCP server for interacting with your [Anki](https://apps.ankiweb.net) decks and cards.
- **[AntV Chart](https://github.com/antvis/mcp-server-chart)** - A Model Context Protocol server for generating 15+ visual charts using [AntV](https://github.com/antvis).
- **[Any Chat Completions](https://github.com/pyroprompts/any-chat-completions-mcp)** - Interact with any OpenAI SDK Compatible Chat Completions API like OpenAI, Perplexity, Groq, xAI and many more.
- **[Apache Gravitino(incubating)](https://github.com/datastrato/mcp-server-gravitino)** - Allow LLMs to explore metadata of structured data and unstructured data with Gravitino, and perform data governance tasks including tagging/classification.
- **[APIWeaver](https://github.com/GongRzhe/APIWeaver)** - An MCP server that dynamically creates MCP  servers from web API configurations. This allows you to easily integrate any REST API, GraphQL endpoint, or web service into an MCP-compatible tool that can be used by AI assistants like Claude.
- **[Apple Books](https://github.com/vgnshiyer/apple-books-mcp)** - Interact with your library on Apple Books, manage your book collection, summarize highlights, notes, and much more.
- **[Apple Calendar](https://github.com/Omar-v2/mcp-ical)** - An MCP server that allows you to interact with your MacOS Calendar through natural language, including features such as event creation, modification, schedule listing, finding free time slots etc.
- **[Apple Script](https://github.com/peakmojo/applescript-mcp)** - MCP server that lets LLM run AppleScript code to to fully control anything on Mac, no setup needed.
- **[APT MCP](https://github.com/GdMacmillan/apt-mcp-server)** - MCP server which runs debian package manager (apt) commands for you using ai agents.
- **[Aranet4](https://github.com/diegobit/aranet4-mcp-server)** - MCP Server to manage your Aranet4 CO2 sensor. Fetch data and store in a local SQLite. Ask questions about historical data.
- **[ArangoDB](https://github.com/ravenwits/mcp-server-arangodb)** - MCP Server that provides database interaction capabilities through [ArangoDB](https://arangodb.com/).
- **[Arduino](https://github.com/vishalmysore/choturobo)** - MCP Server that enables AI-powered robotics using Claude AI and Arduino (ESP32) for real-world automation and interaction with robots.
- **[arXiv API](https://github.com/prashalruchiranga/arxiv-mcp-server)** - An MCP server that enables interacting with the arXiv API using natural language.
- **[arxiv-latex-mcp](https://github.com/takashiishida/arxiv-latex-mcp)** - MCP server that fetches and processes arXiv LaTeX sources for precise interpretation of mathematical expressions in papers.
- **[Asana](https://github.com/universal-mcp/asana)** - Asana MCP server from **[agentr](https://agentr.dev/)** that provides support for managing tasks, projects, and work in Asana.
- **[Atlassian](https://github.com/sooperset/mcp-atlassian)** - Interact with Atlassian Cloud products (Confluence and Jira) including searching/reading Confluence spaces/pages, accessing Jira issues, and project metadata.
- **[Atlassian Server (by phuc-nt)](https://github.com/phuc-nt/mcp-atlassian-server)** - An MCP server that connects AI agents (Cline, Claude Desktop, Cursor, etc.) to Atlassian Jira & Confluence, enabling data queries and actions through the Model Context Protocol.
- **[Attestable MCP](https://github.com/co-browser/attestable-mcp-server)** - An MCP server running inside a trusted execution environment (TEE) via Gramine, showcasing remote attestation using [RA-TLS](https://gramine.readthedocs.io/en/stable/attestation.html). This allows an MCP client to verify the server before conencting.
- **[Audius](https://github.com/glassBead-tc/audius-mcp-atris)** - Audius + AI = Atris. Interact with fans, stream music, tip your favorite artists, and more on Audius: all through Claude.
- **[AWS](https://github.com/rishikavikondala/mcp-server-aws)** - Perform operations on your AWS resources using an LLM.
- **[AWS Athena](https://github.com/lishenxydlgzs/aws-athena-mcp)** - A MCP server for AWS Athena to run SQL queries on Glue Catalog.
- **[AWS Cognito](https://github.com/gitCarrot/mcp-server-aws-cognito)** - A MCP server that connects to AWS Cognito for authentication and user management.
- **[AWS Cost Explorer](https://github.com/aarora79/aws-cost-explorer-mcp-server)** - Optimize your AWS spend (including Amazon Bedrock spend) with this MCP server by examining spend across regions, services, instance types and foundation models ([demo video](https://www.youtube.com/watch?v=WuVOmYLRFmI&feature=youtu.be)).
- **[AWS Resources Operations](https://github.com/baryhuang/mcp-server-aws-resources-python)** - Run generated python code to securely query or modify any AWS resources supported by boto3.
- **[AWS S3](https://github.com/aws-samples/sample-mcp-server-s3)** - A sample MCP server for AWS S3 that flexibly fetches objects from S3 such as PDF documents.
- **[Azure ADX](https://github.com/pab1it0/adx-mcp-server)** - Query and analyze Azure Data Explorer databases.
- **[Azure DevOps](https://github.com/Vortiago/mcp-azure-devops)** - An MCP server that provides a bridge to Azure DevOps services, enabling AI assistants to query and manage work items.
- **[Azure MCP Hub](https://github.com/Azure-Samples/mcp)** - A curated list of all MCP servers and related resources for Azure developers by **[Arun Sekhar](https://github.com/achandmsft)**
- **[Azure OpenAI DALL-E 3 MCP Server](https://github.com/jacwu/mcp-server-aoai-dalle3)** - A MCP server for Azure OpenAI DALL-E 3 service to generate image from text.
- **[Azure Wiki Search](https://github.com/coder-linping/azure-wiki-search-server)** - An MCP that enables AI to query the wiki hosted on Azure Devops Wiki.
- **[Baidu AI Search](https://github.com/baidubce/app-builder/tree/master/python/mcp_server/ai_search)** - Web search with Baidu Cloud's AI Search
- **[BambooHR MCP](https://github.com/encoreshao/bamboohr-mcp)** - An MCP server that interfaces with the BambooHR APIs, providing access to employee data, time tracking, and HR management features.
- **[Base Free USDC Transfer](https://github.com/magnetai/mcp-free-usdc-transfer)** - Send USDC on [Base](https://base.org) for free using Claude AI! Built with [Coinbase CDP](https://docs.cdp.coinbase.com/mpc-wallet/docs/welcome).
- **[Basic Memory](https://github.com/basicmachines-co/basic-memory)** - Local-first knowledge management system that builds a semantic graph from Markdown files, enabling persistent memory across conversations with LLMs.
- **[BigQuery](https://github.com/LucasHild/mcp-server-bigquery)** (by LucasHild) - This server enables LLMs to inspect database schemas and execute queries on BigQuery.
- **[BigQuery](https://github.com/ergut/mcp-bigquery-server)** (by ergut) - Server implementation for Google BigQuery integration that enables direct BigQuery database access and querying capabilities
- **[Bilibili](https://github.com/wangshunnn/bilibili-mcp-server)** - This MCP server provides tools to fetch Bilibili user profiles, video metadata, search videos, and more.
- **[Bing Web Search API](https://github.com/leehanchung/bing-search-mcp)** (by hanchunglee) - Server implementation for Microsoft Bing Web Search API.
- **[Bitable MCP](https://github.com/lloydzhou/bitable-mcp)** (by lloydzhou) - MCP server provides access to Lark Bitable through the Model Context Protocol. It allows users to interact with Bitable tables using predefined tools.
- **[Blender](https://github.com/ahujasid/blender-mcp)** (by ahujasid) - Blender integration allowing prompt enabled 3D scene creation, modeling and manipulation.
- **[BNBChain MCP](https://github.com/bnb-chain/bnbchain-mcp)** - An MCP server for interacting with BSC, opBNB, and the Greenfield blockchain.
- **[Braze](https://github.com/universal-mcp/braze)** - Braze MCP server from **[agentr](https://agentr.dev/)** that provides support for managing customer engagement, user profiles, and messaging campaigns.
- **[BreakoutRoom](https://github.com/agree-able/room-mcp)** - Agents accomplishing goals together in p2p rooms 
- **[browser-use](https://github.com/co-browser/browser-use-mcp-server)** (by co-browser) - browser-use MCP server with dockerized playwright + chromium + vnc. supports stdio & resumable http.
- **[BrowserLoop](https://github.com/mattiasw/browserloop)** - An MCP server for taking screenshots of web pages using Playwright. Supports high-quality capture with configurable formats, viewport sizes, cookie-based authentication, and both full page and element-specific screenshots.
- **[Bsc-mcp](https://github.com/TermiX-official/bsc-mcp)** The first MCP server that serves as the bridge between AI and BNB Chain, enabling AI agents to execute complex on-chain operations through seamless integration with the BNB Chain, including transfer, swap, launch, security check on any token and even more.
- **[BVG MCP Server - (Unofficial) ](https://github.com/svkaizoku/mcp-bvg)** - Unofficial MCP server for Berliner Verkehrsbetriebe Api. 
- **[Calculator](https://github.com/githejie/mcp-server-calculator)** - This server enables LLMs to use calculator for precise numerical calculations.
- **[CalDAV MCP](https://github.com/dominik1001/caldav-mcp)** - A CalDAV MCP server to expose calendar operations as tools for AI assistants.
- **[Calendly](https://github.com/universal-mcp/calendly)** - Calendly MCP server from **[agentr](https://agentr.dev/)** that provides support for managing events and scheduling via Calendly.
- **[Canva](https://github.com/universal-mcp/canva)** - Canva MCP server from **[agentr](https://agentr.dev/)** that provides support for managing tools of Canva App.
- **[CCTV VMS MCP](https://github.com/jyjune/mcp_vms)** - A Model Context Protocol (MCP) server designed to connect to a CCTV recording program (VMS) to retrieve recorded and live video streams. It also provides tools to control the VMS software, such as showing live or playback dialogs for specific channels at specified times.
- **[CFBD API](https://github.com/lenwood/cfbd-mcp-server)** - An MCP server for the [College Football Data API](https://collegefootballdata.com/).
- **[ChatMCP](https://github.com/AI-QL/chat-mcp)** – An Open Source Cross-platform GUI Desktop application compatible with Linux, macOS, and Windows, enabling seamless interaction with MCP servers across dynamically selectable LLMs, by **[AIQL](https://github.com/AI-QL)**
- **[ChatSum](https://github.com/mcpso/mcp-server-chatsum)** - Query and Summarize chat messages with LLM. by [mcpso](https://mcp.so)
- **[Chess.com](https://github.com/pab1it0/chess-mcp)** - Access Chess.com player data, game records, and other public information through standardized MCP interfaces, allowing AI assistants to search and analyze chess information.
- **[ChessPal Chess Engine (stockfish)](https://github.com/wilson-urdaneta/chesspal-mcp-engine)** - A Stockfish-powered chess engine exposed as an MCP server. Calculates best moves and supports both HTTP/SSE and stdio transports.
- **[Chroma](https://github.com/privetin/chroma)** - Vector database server for semantic document search and metadata filtering, built on Chroma
- **[CipherTrust Manager](https://github.com/sanyambassi/ciphertrust-manager-mcp-server)** - MCP server for Thales CipherTrust Manager integration, enabling secure key management and cryptographic operations.
- **[Claude Thread Continuity](https://github.com/peless/claude-thread-continuity)** - Persistent memory system enabling Claude Desktop conversations to resume with full context across sessions. Maintains conversation history, project states, and user preferences for seamless multi-session workflows.
- **[ClaudePost](https://github.com/ZilongXue/claude-post)** - ClaudePost enables seamless email management for Gmail, offering secure features like email search, reading, and sending.
- **[ClickUp](https://github.com/TaazKareem/clickup-mcp-server)** - MCP server for ClickUp task management, supporting task creation, updates, bulk operations, and markdown descriptions.
- **[Cloudinary](https://github.com/felores/cloudinary-mcp-server)** - Cloudinary Model Context Protocol Server to upload media to Cloudinary and get back the media link and details.
- **[Coda](https://github.com/universal-mcp/coda)** - Coda.io MCP server from **[agentr](https://agentr.dev/)** that provides support for reading and writing data to Coda docs and tables.
- **[code-assistant](https://github.com/stippi/code-assistant)** - A coding assistant MCP server that allows to explore a code-base and make changes to code. Should be used with trusted repos only (insufficient protection against prompt injections).
- **[code-executor](https://github.com/bazinga012/mcp_code_executor)** - An MCP server that allows LLMs to execute Python code within a specified Conda environment.
- **[code-sandbox-mcp](https://github.com/Automata-Labs-team/code-sandbox-mcp)** - An MCP server to create secure code sandbox environment for executing code within Docker containers.
- **[cognee-mcp](https://github.com/topoteretes/cognee/tree/main/cognee-mcp)** - GraphRAG memory server with customizable ingestion, data processing and search
- **[coin_api_mcp](https://github.com/longmans/coin_api_mcp)** - Provides access to [coinmarketcap](https://coinmarketcap.com/) cryptocurrency data.
- **[CoinMarketCap](https://github.com/shinzo-labs/coinmarketcap-mcp)** - Implements the complete [CoinMarketCap](https://coinmarketcap.com/) API for accessing cryptocurrency market data, exchange information, and other blockchain-related metrics.
- **[commands](https://github.com/g0t4/mcp-server-commands)** - Run commands and scripts. Just like in a terminal.
- **[Computer-Use - Remote MacOS Use](https://github.com/baryhuang/mcp-remote-macos-use)** - Open-source out-of-the-box alternative to OpenAI Operator, providing a full desktop experience and optimized for using remote macOS machines as autonomous AI agents.
- **[Congress.gov API](https://github.com/AshwinSundar/congress_gov_mcp)** - An MCP server to interact with real-time data from the Congress.gov API, which is the official API for the United States Congress.
- **[consul-mcp](https://github.com/kocierik/consul-mcp-server)** - A consul MCP server for service management, health check and Key-Value Store
- **[consult7](https://github.com/szeider/consult7)** - Analyze large codebases and document collections using high-context models via OpenRouter, OpenAI, or Google AI -- very useful, e.g., with Claude Code
- **[Contentful-mcp](https://github.com/ivo-toby/contentful-mcp)** - Read, update, delete, publish content in your [Contentful](https://contentful.com) space(s) from this MCP Server.
- **[context-portal](https://github.com/GreatScottyMac/context-portal)** - Context Portal (ConPort) is a memory bank database system that effectively builds a project-specific knowledge graph, capturing entities like decisions, progress, and architecture, along with their relationships. This serves as a powerful backend for Retrieval Augmented Generation (RAG), enabling AI assistants to access precise, up-to-date project information.
- **[CreateveAI Nexus](https://github.com/spgoodman/createveai-nexus-server)** - Open-Source Bridge Between AI Agents and Enterprise Systems, with simple custom API plug-in capabilities (including close compatibility with ComfyUI nodes), support for Copilot Studio's MCP agent integations, and support for Azure deployment in secure environments with secrets stored in Azure Key Vault, as well as straightforward on-premises deployment.
- **[Creatify](https://github.com/TSavo/creatify-mcp)** - MCP Server that exposes Creatify AI API capabilities for AI video generation, including avatar videos, URL-to-video conversion, text-to-speech, and AI-powered editing tools.
- **[Cronlytic](https://github.com/Cronlytic/cronlytic-mcp-server)** - Create CRUD operations for serverless cron jobs through [Cronlytic](https://cronlytic.com) MCP Server
- **[crypto-feargreed-mcp](https://github.com/kukapay/crypto-feargreed-mcp)**  -  Providing real-time and historical Crypto Fear & Greed Index data.
- **[crypto-indicators-mcp](https://github.com/kukapay/crypto-indicators-mcp)**  -  An MCP server providing a range of cryptocurrency technical analysis indicators and strategies.
- **[crypto-sentiment-mcp](https://github.com/kukapay/crypto-sentiment-mcp)**  -  An MCP server that delivers cryptocurrency sentiment analysis to AI agents.
- **[cryptopanic-mcp-server](https://github.com/kukapay/cryptopanic-mcp-server)** - Providing latest cryptocurrency news to AI agents, powered by CryptoPanic.
- **[Cursor MCP Installer](https://github.com/matthewdcage/cursor-mcp-installer)** - A tool to easily install and configure other MCP servers within Cursor IDE, with support for npm packages, local directories, and Git repositories.
- **[Dappier](https://github.com/DappierAI/dappier-mcp)** - Connect LLMs to real-time, rights-cleared, proprietary data from trusted sources. Access specialized models for Real-Time Web Search, News, Sports, Financial Data, Crypto, and premium publisher content. Explore data models at [marketplace.dappier.com](https://marketplace.dappier.com/marketplace).
- **[Data Exploration](https://github.com/reading-plus-ai/mcp-server-data-exploration)** - MCP server for autonomous data exploration on .csv-based datasets, providing intelligent insights with minimal effort. NOTE: Will execute arbitrary Python code on your machine, please use with caution!
- **[Databricks](https://github.com/JordiNeil/mcp-databricks-server)** - Allows LLMs to run SQL queries, list and get details of jobs executions in a Databricks account.
- **[Databricks Genie](https://github.com/yashshingvi/databricks-genie-MCP)** - A server that connects to the Databricks Genie, allowing LLMs to ask natural language questions, run SQL queries, and interact with Databricks conversational agents.
- **[Databricks Smart SQL](https://github.com/RafaelCartenet/mcp-databricks-server)** - Leveraging Databricks Unity Catalog metadata, perform smart efficient SQL queries to solve Ad-hoc queries and explore data.
- **[Datadog](https://github.com/GeLi2001/datadog-mcp-server)** - Datadog MCP Server for application tracing, monitoring, dashboard, incidents queries built on official datadog api.
- **[Dataset Viewer](https://github.com/privetin/dataset-viewer)** - Browse and analyze Hugging Face datasets with features like search, filtering, statistics, and data export
- **[DaVinci Resolve](https://github.com/samuelgursky/davinci-resolve-mcp)** - MCP server integration for DaVinci Resolve providing powerful tools for video editing, color grading, media management, and project control.
- **[DBHub](https://github.com/bytebase/dbhub/)** - Universal database MCP server connecting to MySQL, MariaDB, PostgreSQL, and SQL Server.
- **[Deebo](https://github.com/snagasuri/deebo-prototype)** – Agentic debugging MCP server that helps AI coding agents delegate and fix hard bugs through isolated multi-agent hypothesis testing.
- **[Deep Research](https://github.com/reading-plus-ai/mcp-server-deep-research)** - Lightweight MCP server offering Grok/OpenAI/Gemini/Perplexity-style automated deep research exploration and structured reporting.
- **[DeepSeek MCP Server](https://github.com/DMontgomery40/deepseek-mcp-server)** - Model Context Protocol server integrating DeepSeek's advanced language models, in addition to [other useful API endpoints](https://github.com/DMontgomery40/deepseek-mcp-server?tab=readme-ov-file#features)
- **[deepseek-thinker-mcp](https://github.com/ruixingshi/deepseek-thinker-mcp)** - A MCP (Model Context Protocol) provider Deepseek reasoning content to MCP-enabled AI Clients, like Claude Desktop. Supports access to Deepseek's thought processes from the Deepseek API service or from a local Ollama server.
- **[Deepseek_R1](https://github.com/66julienmartin/MCP-server-Deepseek_R1)** - A Model Context Protocol (MCP) server implementation connecting Claude Desktop with DeepSeek's language models (R1/V3)
- **[Descope](https://github.com/descope-sample-apps/descope-mcp-server)** - An MCP server to integrate with [Descope](https://descope.com) to search audit logs, manage users, and more.
- **[DesktopCommander](https://github.com/wonderwhy-er/DesktopCommanderMCP)** - Let AI edit and manage files on your computer, run terminal commands, and connect to remote servers via SSH - all powered by one of the most popular local MCP servers.
- **[DevDb](https://github.com/damms005/devdb-vscode?tab=readme-ov-file#mcp-configuration)** - An MCP server that runs right inside the IDE, for connecting to MySQL, Postgres, SQLite, and MSSQL databases.
- **[Dicom](https://github.com/ChristianHinge/dicom-mcp)** - An MCP server to query and retrieve medical images and for parsing and reading dicom-encapsulated documents (pdf etc.). 
- **[Dify](https://github.com/YanxingLiu/dify-mcp-server)** - A simple implementation of an MCP server for dify workflows.
- **[DigitalOcean](https://github.com/universal-mcp/digitalocean)** - DigitalOcean MCP server from **[agentr](https://agentr.dev/)** that provides support for managing cloud resources like Droplets, apps, and databases.
- **[Discogs](https://github.com/cswkim/discogs-mcp-server)** - A MCP server that connects to the Discogs API for interacting with your music collection.
- **[Discord](https://github.com/v-3/discordmcp)** - A MCP server to connect to Discord guilds through a bot and read and write messages in channels
- **[Discord](https://github.com/SaseQ/discord-mcp)** - A MCP server, which connects to Discord through a bot, and provides comprehensive integration with Discord.
- **[Discord](https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/discord)** - For Discord API integration by Klavis AI
- **[Discourse](https://github.com/AshDevFr/discourse-mcp-server)** - A MCP server to search Discourse posts on a Discourse forum.
- **[Docker](https://github.com/ckreiling/mcp-server-docker)** - Integrate with Docker to manage containers, images, volumes, and networks.
- **[Docs](https://github.com/da1z/docsmcp)** - Enable documentation access for the AI agent, supporting llms.txt and other remote or local files.
- **[Dodo Payments](https://github.com/dodopayments/dodopayments-node/tree/main/packages/mcp-server)** - Enables AI agents to securely perform payment operations via a lightweight, serverless-compatible interface to the [Dodo Payments](https://dodopayments.com) API.
- **[DPLP](https://github.com/szeider/mcp-dblp)**  - Searches the [DBLP](https://dblp.org) computer science bibliography database.
- **[Drupal](https://github.com/Omedia/mcp-server-drupal)** - Server for interacting with [Drupal](https://www.drupal.org/project/mcp) using STDIO transport layer.
- **[dune-analytics-mcp](https://github.com/kukapay/dune-analytics-mcp)** -  A mcp server that bridges Dune Analytics data to AI agents.
- **[DynamoDB-Toolbox](https://www.dynamodbtoolbox.com/docs/databases/actions/mcp-toolkit)** - Leverages your Schemas and Access Patterns to interact with your [DynamoDB](https://aws.amazon.com/dynamodb) Database using natural language.
- **[eBook-mcp](https://github.com/onebirdrocks/ebook-mcp)** - A lightweight MCP server that allows LLMs to read and interact with your personal PDF and EPUB ebooks. Ideal for building AI reading assistants or chat-based ebook interfaces.
- **[EdgeOne Pages MCP](https://github.com/TencentEdgeOne/edgeone-pages-mcp)** - An MCP service for deploying HTML content to EdgeOne Pages and obtaining a publicly accessible URL.
- **[Edwin](https://github.com/edwin-finance/edwin/tree/main/examples/mcp-server)** - MCP server for edwin SDK - enabling AI agents to interact with DeFi protocols across EVM, Solana and other blockchains.
- **[eechat](https://github.com/Lucassssss/eechat)** - An open-source, cross-platform desktop application that seamlessly connects with MCP servers, across Linux, macOS, and Windows.
- **[Elasticsearch](https://github.com/cr7258/elasticsearch-mcp-server)** - MCP server implementation that provides Elasticsearch interaction.
- **[ElevenLabs](https://github.com/mamertofabian/elevenlabs-mcp-server)** - A server that integrates with ElevenLabs text-to-speech API capable of generating full voiceovers with multiple voices.
- **[Email](https://github.com/Shy2593666979/mcp-server-email)** - This server enables users to send emails through various email providers, including Gmail, Outlook, Yahoo, Sina, Sohu, 126, 163, and QQ Mail. It also supports attaching files from specified directories, making it easy to upload attachments along with the email content.
- **[Email SMTP](https://github.com/egyptianego17/email-mcp-server)** - A simple MCP server that lets your AI agent send emails and attach files through SMTP.
- **[Enhance Prompt](https://github.com/FelixFoster/mcp-enhance-prompt)** - An MCP service for enhance you prompt.
- **[Ergo Blockchain MCP](https://github.com/marctheshark3/ergo-mcp)** -An MCP server to integrate Ergo Blockchain Node and Explorer APIs for checking address balances, analyzing transactions, viewing transaction history, performing forensic analysis of addresses, searching for tokens, and monitoring network status.
- **[ESP MCP Server](https://github.com/horw/esp-mcp)** - An MCP server that integrates ESP IDF commands like building and flashing code for ESP Microcontrollers using an LLM.
- **[Eunomia](https://github.com/whataboutyou-ai/eunomia-MCP-server)** - Extension of the Eunomia framework that connects Eunomia instruments with MCP servers
- **[Everything Search](https://github.com/mamertofabian/mcp-everything-search)** - Fast file searching capabilities across Windows (using [Everything SDK](https://www.voidtools.com/support/everything/sdk/)), macOS (using mdfind command), and Linux (using locate/plocate command).
- **[EVM MCP Server](https://github.com/mcpdotdirect/evm-mcp-server)** - Comprehensive blockchain services for 30+ EVM networks, supporting native tokens, ERC20, NFTs, smart contracts, transactions, and ENS resolution.
- **[Excel](https://github.com/haris-musa/excel-mcp-server)** - Excel manipulation including data reading/writing, worksheet management, formatting, charts, and pivot table.
- **[F1](https://github.com/AbhiJ2706/f1-mcp/tree/main)** - Access to Formula 1 data including race results, driver information, lap times, telemetry, and circuit details.
- **[Fabric MCP](https://github.com/aci-labs/ms-fabric-mcp)** - Microsoft Fabric MCP server to accelerate working in your Fabric Tenant with the help of your favorite LLM models.
- **[fabric-mcp-server](https://github.com/adapoet/fabric-mcp-server)** - The fabric-mcp-server is an MCP server that integrates [Fabric](https://github.com/danielmiessler/fabric) patterns with [Cline](https://cline.bot/), exposing them as tools for AI-driven task execution and enhancing Cline's capabilities.
- **[Facebook Ads](https://github.com/gomarble-ai/facebook-ads-mcp-server)** - MCP server acting as an interface to the Facebook Ads, enabling programmatic access to Facebook Ads data and management features.
- **[Facebook Ads Library](https://github.com/trypeggy/facebook-ads-library-mcp)** - Get any answer from the Facebook Ads Library, conduct deep research including messaging, creative testing and comparisons in seconds.
- **[falai](https://github.com/universal-mcp/falai)** - Fal.ai mcp server from **[agentr](https://agentr.dev/)** that provides support for generating media using fast inference engine.
- **[Fantasy PL](https://github.com/rishijatia/fantasy-pl-mcp)** - Give your coding agent direct access to up-to date Fantasy Premier League data
- **[fastn.ai – Unified API MCP Server](https://github.com/fastnai/mcp-fastn)** - A remote, dynamic MCP server with a unified API that connects to 1,000+ tools, actions, and workflows, featuring built-in authentication and monitoring.
- **[FDIC BankFind MCP Server - (Unofficial)](https://github.com/clafollett/fdic-bank-find-mcp-server)** - The is a MCPserver that brings the power of FDIC BankFind APIs straight to your AI tools and workflows. Structured U.S. banking data, delivered with maximum vibes. 😎📊
- **[Federal Reserve Economic Data (FRED)](https://github.com/stefanoamorelli/fred-mcp-server)** (by Stefano Amorelli) - Community developed MCP server to interact with the Federal Reserve Economic Data.
- **[Fetch](https://github.com/zcaceres/fetch-mcp)** - A server that flexibly fetches HTML, JSON, Markdown, or plaintext.
- **[Feyod](https://github.com/jeroenvdmeer/feyod-mcp)** - A server that answers questions about football matches, and specialised in the football club Feyenoord.
- **[Fibaro HC3](https://github.com/coding-sailor/mcp-server-hc3)** - MCP server for Fibaro Home Center 3 smart home systems.
- **[Figma](https://github.com/GLips/Figma-Context-MCP)** - Give your coding agent direct access to Figma file data, helping it one-shot design implementation.
- **[Firebase](https://github.com/gannonh/firebase-mcp)** - Server to interact with Firebase services including Firebase Authentication, Firestore, and Firebase Storage.
- **[FireCrawl](https://github.com/vrknetha/mcp-server-firecrawl)** - Advanced web scraping with JavaScript rendering, PDF support, and smart rate limiting
- **[FitBit MCP Server](https://github.com/NitayRabi/fitbit-mcp)** - An MCP server that connects to FitBit API using a token obtained from OAuth flow.
- **[FlightRadar24](https://github.com/sunsetcoder/flightradar24-mcp-server)** - A Claude Desktop MCP server that helps you track flights in real-time using Flightradar24 data.
- **[Fluent-MCP](https://github.com/modesty/fluent-mcp)** - MCP server for Fluent (ServiceNow SDK) providing access to ServiceNow SDK CLI, API specifications, code snippets, and more.
- **[Flyworks Avatar](https://github.com/Flyworks-AI/flyworks-mcp)** - Fast and free zeroshot lipsync MCP server.
- **[FoundationModels](https://github.com/phimage/mcp-foundation-models)** - An MCP server that integrates Apple's [FoundationModels](https://developer.apple.com/documentation/foundationmodels) for text generation.
- **[Foursquare](https://github.com/foursquare/foursquare-places-mcp)** - Enable your agent to recommend places around the world with the [Foursquare Places API](https://location.foursquare.com/products/places-api/)
- **[FrankfurterMCP](https://github.com/anirbanbasu/frankfurtermcp)** - MCP server acting as an interface to the [Frankfurter API](https://frankfurter.dev/) for currency exchange data.
- **[freqtrade-mcp](https://github.com/kukapay/freqtrade-mcp)** - An MCP server that integrates with the Freqtrade cryptocurrency trading bot.
- **[GDB](https://github.com/pansila/mcp_server_gdb)** - A GDB/MI protocol server based on the MCP protocol, providing remote application debugging capabilities with AI assistants.
- **[Ghost](https://github.com/MFYDev/ghost-mcp)** - A Model Context Protocol (MCP) server for interacting with Ghost CMS through LLM interfaces like Claude.
- **[Git](https://github.com/geropl/git-mcp-go)** - Allows LLM to interact with a local git repository, incl. optional push support.
- **[Git Mob](https://github.com/Mubashwer/git-mob-mcp-server)** - MCP server that interfaces with the [git-mob](https://github.com/Mubashwer/git-mob) CLI app for managing co-authors in git commits during pair/mob programming.
- **[Github Actions](https://github.com/ko1ynnky/github-actions-mcp-server)** - A Model Context Protocol (MCP) server for interacting with Github Actions.
- **[GitHub Enterprise MCP](https://github.com/ddukbg/github-enterprise-mcp)** - A Model Context Protocol (MCP) server for interacting with GitHub Enterprise.
- **[GitHub Repos Manager MCP Server](https://github.com/kurdin/github-repos-manager-mcp)** - Token-based GitHub automation management. No Docker, Flexible configuration, 80+ tools with direct API integration.
- **[GitMCP](https://github.com/idosal/git-mcp)** - gitmcp.io is a generic remote MCP server to connect to ANY GitHub repository or project documentation effortlessly
- **[Glean](https://github.com/longyi1207/glean-mcp-server)** - A server that uses Glean API to search and chat.
- **[Gmail](https://github.com/GongRzhe/Gmail-MCP-Server)** - A Model Context Protocol (MCP) server for Gmail integration in Claude Desktop with auto authentication support.
- **[Gmail Headless](https://github.com/baryhuang/mcp-headless-gmail)** - Remote hostable MCP server that can get and send Gmail messages without local credential or file system setup.
- **[Gnuradio](https://github.com/yoelbassin/gnuradioMCP)** - An MCP server for GNU Radio that enables LLMs to autonomously create and modify RF .grc flowcharts.
- **[Goal Story](https://github.com/hichana/goalstory-mcp)** - a Goal Tracker and Visualization Tool for personal and professional development.
- **[GOAT](https://github.com/goat-sdk/goat/tree/main/typescript/examples/by-framework/model-context-protocol)** - Run more than +200 onchain actions on any blockchain including Ethereum, Solana and Base.
- **[Godot](https://github.com/Coding-Solo/godot-mcp)** - A MCP server providing comprehensive Godot engine integration for project editing, debugging, and scene management.
- **[Golang Filesystem Server](https://github.com/mark3labs/mcp-filesystem-server)** - Secure file operations with configurable access controls built with Go!
- **[Goodnews](https://github.com/VectorInstitute/mcp-goodnews)** - A simple MCP server that delivers curated positive and uplifting news stories.
- **[Google Ads](https://github.com/gomarble-ai/google-ads-mcp-server)** - MCP server acting as an interface to the Google Ads, enabling programmatic access to Facebook Ads data and management features.
- **[Google Analytics](https://github.com/surendranb/google-analytics-mcp)** - Google Analytics MCP Server to bring data across 200+ dimensions & metrics for LLMs to analyse.
- **[Google Calendar](https://github.com/v-3/google-calendar)** - Integration with Google Calendar to check schedules, find time, and add/delete events
- **[Google Calendar](https://github.com/nspady/google-calendar-mcp)** - Google Calendar MCP Server for managing Google calendar events. Also supports searching for events by attributes like title and location.
- **[Google Custom Search](https://github.com/adenot/mcp-google-search)** - Provides Google Search results via the Google Custom Search API
- **[Google Sheets](https://github.com/xing5/mcp-google-sheets)** - Access and editing data to your Google Sheets.
- **[Google Sheets](https://github.com/rohans2/mcp-google-sheets)** - A MCP Server written in TypeScript to access and edit data in your Google Sheets.
- **[Google Tasks](https://github.com/zcaceres/gtasks-mcp)** - Google Tasks API Model Context Protocol Server.
- **[Google Vertex AI Search](https://github.com/ubie-oss/mcp-vertexai-search)** - Provides Google Vertex AI Search results by grounding a Gemini model with your own private data
- **[Google Workspace](https://github.com/taylorwilsdon/google_workspace_mcp)** - Comprehensive Google Workspace MCP with full support for Calendar, Drive, Gmail, and Docs using Streamable HTTP or SSE transport.
- **[Google-SearchConsole](https://github.com/universal-mcp/google-searchconsole)** - Google Search Console MCP server from **[agentr](https://agentr.dev/)** that provides support for programmatic access to Google Search Console data and insights.
- **[Google_Docs](https://github.com/universal-mcp/google-docs)** - Google Docs mcp server from **[agentr](https://agentr.dev/)** that provides support for users to create, edit, and collaborate on documents in real-time.
- **[Gralio SaaS Database](https://github.com/tymonTe/gralio-mcp)** - Find and compare SaaS products, including data from G2 reviews, Trustpilot, Crunchbase, Linkedin, pricing, features and more, using [Gralio MCP](https://gralio.ai/mcp) server
- **[GraphQL](https://github.com/drestrepom/mcp_graphql)** - Comprehensive GraphQL API integration that automatically exposes each GraphQL query as a separate tool.
- **[GraphQL Schema](https://github.com/hannesj/mcp-graphql-schema)** - Allow LLMs to explore large GraphQL schemas without bloating the context.
- **[Hashing MCP Server](https://github.com/kanad13/MCP-Server-for-Hashing)** - MCP Server with cryptographic hashing functions e.g. SHA256, MD5, etc.
- **[Hashnode](https://github.com/universal-mcp/hashnode)** - Hashnode MCP server from **[agentr](https://agentr.dev/)** that provides support for managing blog posts and content on Hashnode.
- **[HDW LinkedIn](https://github.com/horizondatawave/hdw-mcp-server)** - Access to profile data and management of user account with [HorizonDataWave.ai](https://horizondatawave.ai/).
- **[Helm Chart CLI](https://github.com/jeff-nasseri/helm-chart-cli-mcp)** - Helm MCP provides a bridge between AI assistants and the Helm package manager for Kubernetes. It allows AI assistants to interact with Helm through natural language requests, executing commands like installing charts, managing repositories, and more.
- **[Heurist Mesh Agent](https://github.com/heurist-network/heurist-mesh-mcp-server)** - Access specialized web3 AI agents for blockchain analysis, smart contract security, token metrics, and blockchain interactions through the [Heurist Mesh network](https://github.com/heurist-network/heurist-agent-framework/tree/main/mesh).
- **[Holaspirit](https://github.com/syucream/holaspirit-mcp-server)** - Interact with [Holaspirit](https://www.holaspirit.com/).
- **[Home Assistant](https://github.com/tevonsb/homeassistant-mcp)** - Interact with [Home Assistant](https://www.home-assistant.io/) including viewing and controlling lights, switches, sensors, and all other Home Assistant entities.
- **[Home Assistant](https://github.com/voska/hass-mcp)** - Docker-ready MCP server for Home Assistant with entity management, domain summaries, automation support, and guided conversations. Includes pre-built container images for easy installation.
- **[HubSpot](https://github.com/buryhuang/mcp-hubspot)** - HubSpot CRM integration for managing contacts and companies. Create and retrieve CRM data directly through Claude chat.
- **[HuggingFace Spaces](https://github.com/evalstate/mcp-hfspace)** - Server for using HuggingFace Spaces, supporting Open Source Image, Audio, Text Models and more. Claude Desktop mode for easy integration.
- **[Human-In-the-Loop](https://github.com/GongRzhe/Human-In-the-Loop-MCP-Server)** - A powerful MCP Server that enables AI assistants like Claude to interact with humans through intuitive GUI dialogs. This server bridges the gap between automated AI processes and human decision-making by providing real-time user input tools, choices, confirmations, and feedback mechanisms.
- **[Human-use](https://github.com/RapidataAI/human-use)** - Instant human feedback through an MCP, have your AI interact with humans around the world. Powered by [Rapidata](https://www.rapidata.ai/)
- **[Hyperledger Fabric Agent Suite](https://github.com/padmarajkore/hlf-fabric-agent)** - Modular toolkit for managing Fabric test networks and chaincode lifecycle via MCP tools.
- **[Hyperliquid](https://github.com/mektigboy/server-hyperliquid)** - An MCP server implementation that integrates the Hyperliquid SDK for exchange data.
- **[hyprmcp](https://github.com/stefanoamorelli/hyprmcp)** (by Stefano Amorelli) - Lightweight MCP server for `hyprland`.
- **[iFlytek SparkAgent Platform](https://github.com/iflytek/ifly-spark-agent-mcp)** - This is a simple example of using MCP Server to invoke the task chain of the  iFlytek SparkAgent Platform.
- **[iFlytek Workflow](https://github.com/iflytek/ifly-workflow-mcp-server)** - Connect to iFlytek Workflow via the MCP server and run your own Agent.
- **[Image Generation](https://github.com/GongRzhe/Image-Generation-MCP-Server)** - This MCP server provides image generation capabilities using the Replicate Flux model.
- **[ImageSorcery MCP](https://github.com/sunriseapps/imagesorcery-mcp)** - ComputerVision-based 🪄 sorcery of image recognition and editing tools for AI assistants.
- **[IMAP MCP](https://github.com/dominik1001/imap-mcp)** - 📧 An IMAP Model Context Protocol (MCP) server to expose IMAP operations as tools for AI assistants.
- **[iMCP](https://github.com/loopwork-ai/iMCP)** - A macOS app that provides an MCP server for your iMessage, Reminders, and other Apple services.
- **[InfluxDB](https://github.com/idoru/influxdb-mcp-server)** - Run queries against InfluxDB OSS API v2.
- **[Inoyu](https://github.com/sergehuber/inoyu-mcp-unomi-server)** - Interact with an Apache Unomi CDP customer data platform to retrieve and update customer profiles
- **[Instagram DM](https://github.com/trypeggy/instagram_dm_mcp)** - Send DMs on Instagram via your LLM
- **[interactive-mcp](https://github.com/ttommyth/interactive-mcp)** - Enables interactive LLM workflows by adding local user prompts and chat capabilities directly into the MCP loop.
- **[Intercom](https://github.com/raoulbia-ai/mcp-server-for-intercom)** - An MCP-compliant server for retrieving customer support tickets from Intercom. This tool enables AI assistants like Claude Desktop and Cline to access and analyze your Intercom support tickets.
- **[iOS Simulator](https://github.com/InditexTech/mcp-server-simulator-ios-idb)** - A Model Context Protocol (MCP) server that enables LLMs to interact with iOS simulators (iPhone, iPad, etc.) through natural language commands.
- **[iTerm MCP](https://github.com/ferrislucas/iterm-mcp)** - Integration with iTerm2 terminal emulator for macOS, enabling LLMs to execute and monitor terminal commands.
- **[iTerm MCP Server](https://github.com/rishabkoul/iTerm-MCP-Server)** - A Model Context Protocol (MCP) server implementation for iTerm2 terminal integration. Able to manage multiple iTerm Sessions.
- **[Java Decompiler](https://github.com/idachev/mcp-javadc)** - Decompile Java bytecode into readable source code from .class files, package names, or JAR archives using CFR decompiler
- **[JavaFX](https://github.com/quarkiverse/quarkus-mcp-servers/tree/main/jfx)** - Make drawings using a JavaFX canvas
- **[JDBC](https://github.com/quarkiverse/quarkus-mcp-servers/tree/main/jdbc)** - Connect to any JDBC-compatible database and query, insert, update, delete, and more. Supports MySQL, PostgreSQL, Oracle, SQL Server, sqllite and [more](https://github.com/quarkiverse/quarkus-mcp-servers/tree/main/jdbc#supported-jdbc-variants).
- **[JMeter](https://github.com/QAInsights/jmeter-mcp-server)** - Run load testing using Apache JMeter via MCP-compliant tools.
- **[Job Searcher](https://github.com/0xDAEF0F/job-searchoor)** - A FastMCP server that provides tools for retrieving and filtering job listings based on time period, keywords, and remote work preferences.
- **[jobswithgpt](https://github.com/jobswithgpt/mcp)** - Job search MCP using jobswithgpt which indexes 500K+ public job listings and refreshed continously.
- **[JSON](https://github.com/GongRzhe/JSON-MCP-Server)** - JSON handling and processing server with advanced query capabilities using JSONPath syntax and support for array, string, numeric, and date operations.
- **[JSON2Video MCP](https://github.com/omergocmen/json2video-mcp-server)** - A Model Context Protocol (MCP) server implementation for programmatically generating videos using the json2video API. This server exposes powerful video generation and status-checking tools for use with LLMs, agents, or any MCP-compatible client.
- **[jupiter-mcp](https://github.com/kukapay/jupiter-mcp)** - An MCP server for executing token swaps on the Solana blockchain using Jupiter's new Ultra API.
- **[Jupyter Notebook](https://github.com/jjsantos01/jupyter-notebook-mcp)** - connects Jupyter Notebook to Claude AI, allowing Claude to directly interact with and control Jupyter Notebooks. This integration enables AI-assisted code execution, data analysis, visualization, and more.
- **[k8s-multicluster-mcp](https://github.com/razvanmacovei/k8s-multicluster-mcp)** - An MCP server for interact with multiple Kubernetes clusters simultaneously using multiple kubeconfig files.
- **[Keycloak MCP](https://github.com/ChristophEnglisch/keycloak-model-context-protocol)** - This MCP server enables natural language interaction with Keycloak for user and realm management including creating, deleting, and listing users and realms.
- **[Kibana MCP](https://github.com/TocharianOU/mcp-server-kibana.git)** (by TocharianOU) - A community-maintained MCP server implementation that allows any MCP-compatible client to access and manage Kibana instances through natural language or programmatic requests.
- **[Kibela](https://github.com/kiwamizamurai/mcp-kibela-server)** (by kiwamizamurai) - Interact with Kibela API.
- **[KiCad MCP](https://github.com/lamaalrajih/kicad-mcp)** - MCP server for KiCad on Mac, Windows, and Linux.
- **[kintone](https://github.com/macrat/mcp-server-kintone)** - Manage records and apps in [kintone](https://kintone.com) through LLM tools.
- **[Kokoro TTS](https://github.com/mberg/kokoro-tts-mcp)** - Use Kokoro text to speech to convert text to MP3s with optional autoupload to S3.
- **[Kong Konnect](https://github.com/Kong/mcp-konnect)** - A Model Context Protocol (MCP) server for interacting with Kong Konnect APIs, allowing AI assistants to query and analyze Kong Gateway configurations, traffic, and analytics.
- **[Kubernetes](https://github.com/Flux159/mcp-server-kubernetes)** - Connect to Kubernetes cluster and manage pods, deployments, and services.
- **[Kubernetes and OpenShift](https://github.com/manusa/kubernetes-mcp-server)** - A powerful Kubernetes MCP server with additional support for OpenShift. Besides providing CRUD operations for any Kubernetes resource, this server provides specialized tools to interact with your cluster.
- **[KubeSphere](https://github.com/kubesphere/ks-mcp-server)** - The KubeSphere MCP Server is a Model Context Protocol(MCP) server that provides integration with KubeSphere APIs, enabling to get resources from KubeSphere. Divided into four tools modules: Workspace Management, Cluster Management, User and Roles, Extensions Center.
- **[Langflow-DOC-QA-SERVER](https://github.com/GongRzhe/Langflow-DOC-QA-SERVER)** - A Model Context Protocol server for document Q&A powered by Langflow. It demonstrates core MCP concepts by providing a simple interface to query documents through a Langflow backend.
- **[Lark(Feishu)](https://github.com/kone-net/mcp_server_lark)** - A Model Context Protocol(MCP) server for Lark(Feishu) sheet, message, doc and etc.
- **[Lazy Toggl MCP](https://github.com/movstox/lazy-toggl-mcp)** - Simple unofficial MCP server to track time via Toggl API
- **[lean-lsp-mcp](https://github.com/oOo0oOo/lean-lsp-mcp)** - Interact with the [Lean theorem prover](https://lean-lang.org/) via the Language Server Protocol.
- **[libvirt-mcp](https://github.com/MatiasVara/libvirt-mcp)** - Allows LLM to interact with libvirt thus enabling to create, destroy or list the Virtual Machines in a system.
- **[Lightdash](https://github.com/syucream/lightdash-mcp-server)** - Interact with [Lightdash](https://www.lightdash.com/), a BI tool.
- **[LINE](https://github.com/amornpan/py-mcp-line)** (by amornpan) - Implementation for LINE Bot integration that enables Language Models to read and analyze LINE conversations through a standardized interface. Features asynchronous operation, comprehensive logging, webhook event handling, and support for various message types.
- **[Linear](https://github.com/tacticlaunch/mcp-linear)** - Interact with Linear project management system.
- **[Linear](https://github.com/jerhadf/linear-mcp-server)** - Allows LLM to interact with Linear's API for project management, including searching, creating, and updating issues.
- **[Linear (Go)](https://github.com/geropl/linear-mcp-go)** - Allows LLM to interact with Linear's API via a single static binary.
- **[Linear MCP](https://github.com/anoncam/linear-mcp)** - Full blown implementation of the Linear SDK to support comprehensive Linear management of projects, initiatives, issues, users, teams and states.
- **[LlamaCloud](https://github.com/run-llama/mcp-server-llamacloud)** (by marcusschiesser) - Integrate the data stored in a managed index on [LlamaCloud](https://cloud.llamaindex.ai/)
- **[lldb-mcp](https://github.com/stass/lldb-mcp)** - A Model Context Protocol server for LLDB that provides LLM-driven debugging.
- **[llm-context](https://github.com/cyberchitta/llm-context.py)** - Provides a repo-packing MCP tool with configurable profiles that specify file inclusion/exclusion patterns and optional prompts.
- **[Loki](https://github.com/scottlepp/loki-mcp)** - Golang based MCP Server to query logs from [Grafana Loki](https://github.com/grafana/loki).
- **[LottieFiles](https://github.com/junmer/mcp-server-lottiefiles)** - Searching and retrieving Lottie animations from [LottieFiles](https://lottiefiles.com/)
- **[lsp-mcp](https://github.com/Tritlo/lsp-mcp)** - Interact with Language Servers usint the Language Server Protocol to provide additional context information via hover, code actions and completions.
- **[Lspace](https://github.com/Lspace-io/lspace-server)** - Turn scattered ChatGPT/Claude/Cursor conversations into persistent, searchable knowledge.
- **[lucene-mcp-server](https://github.com/VivekKumarNeu/MCP-Lucene-Server)** - spring boot server using Lucene for fast document search and management.
- **[LunarCrush Remote MCP](https://github.com/lunarcrush/mcp-server)** - Get the latest social metrics and posts for both current live social context as well as historical metrics in LLM and token optimized outputs. Ideal for automated trading / financial advisory.
- **[mac-messages-mcp](https://github.com/carterlasalle/mac_messages_mcp)** - An MCP server that securely interfaces with your iMessage database via the Model Context Protocol (MCP), allowing LLMs to query and analyze iMessage conversations. It includes robust phone number validation, attachment processing, contact management, group chat handling, and full support for sending and receiving messages.
- **[Maestro MCP](https://github.com/maestro-org/maestro-mcp)** - An MCP server for interacting with Bitcoin via the Maestro RPC API.
- **[MalwareBazaar_MCP](https://github.com/mytechnotalent/MalwareBazaar_MCP)** (by Kevin Thomas) - An AI-driven MCP server that autonomously interfaces with MalwareBazaar, delivering real-time threat intel and sample metadata for authorized cybersecurity research workflows.
- **[man-mcp-server](https://github.com/guyru/man-mcp-server)** - MCP to search and access man pages on the local machine.
- **[MariaDB](https://github.com/abel9851/mcp-server-mariadb)** - MariaDB database integration with configurable access controls in Python.
- **[Markdown2doc](https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/pandoc)** - Convert between various file formats using Pandoc
- **[Markdownify](https://github.com/zcaceres/mcp-markdownify-server)** - MCP to convert almost anything to Markdown (PPTX, HTML, PDF, Youtube Transcripts and more)
- **[Markitdown](https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/markitdown)** - Convert files to Markdown
- **[MasterGo](https://github.com/mastergo-design/mastergo-magic-mcp)** - The server designed to connect MasterGo design tools with AI models. It enables AI models to directly retrieve DSL data from MasterGo design files.
- **[Matlab-MCP-Tools](https://github.com/neuromechanist/matlab-mcp-tools)** - An MCP to write and execute MATLAB scripts, maintain workspace context between MCP calls, visualize plots, and perform section-by-section analysis of MATLAB code with full access to MATLAB's computational capabilities.
- **[Maton](https://github.com/maton-ai/agent-toolkit/tree/main/modelcontextprotocol)** - Connect to your SaaS tools like HubSpot, Salesforce, and more.
- **[MCP Compass](https://github.com/liuyoshio/mcp-compass)** - Suggest the right MCP server for your needs
- **[MCP Create](https://github.com/tesla0225/mcp-create)** - A dynamic MCP server management service that creates, runs, and manages Model Context Protocol servers on-the-fly.
- **[MCP Documentation Server](https://github.com/andrea9293/mcp-documentation-server)** - Server that provides local document management and semantic search capabilities. Upload documents, search them with AI embeddings, and integrate seamlessly with MCP clients like Claude Desktop and vs code.
- **[MCP Installer](https://github.com/anaisbetts/mcp-installer)** - This server is a server that installs other MCP servers for you.
- **[MCP Proxy Server](https://github.com/TBXark/mcp-proxy)** - An MCP proxy server that aggregates and serves multiple MCP resource servers through a single HTTP server.
- **[MCP Server Creator](https://github.com/GongRzhe/MCP-Server-Creator)** - A powerful Model Context Protocol (MCP) server that creates other MCP servers! This meta-server provides tools for dynamically generating FastMCP server configurations and Python code.
- **[MCP Server Generator](https://github.com/SerhatUzbas/mcp-server-generator)** - An MCP server that creates and manages  MCP servers! Helps both non-technical users and developers build custom JavaScript MCP servers with AI guidance, automatic dependency management, and Claude Desktop integration.
- **[MCP STDIO to Streamable HTTP Adapter](https://github.com/pyroprompts/mcp-stdio-to-streamable-http-adapter)** - Connect to Streamable HTTP MCP Servers even if the MCP Client only supports STDIO.
- **[mcp-containerd](https://github.com/jokemanfire/mcp-containerd)** - The containerd MCP implemented by Rust supports the operation of the CRI interface.
- **[MCP-Database-Server](https://github.com/executeautomation/mcp-database-server)** - Fastest way to interact with your Database such as SQL Server, SQLite and PostgreSQL
- **[mcp-grep](https://github.com/erniebrodeur/mcp-grep)** - Python-based MCP server that brings grep functionality to LLMs. Supports common grep features including pattern searching, case-insensitive matching, context lines, and recursive directory searches.
- **[mcp-k8s-go](https://github.com/strowk/mcp-k8s-go)** - Golang-based Kubernetes server for MCP to browse pods and their logs, events, namespaces and more. Built to be extensible.
- **[mcp-local-rag](https://github.com/nkapila6/mcp-local-rag)** - "primitive" RAG-like web search model context protocol (MCP) server that runs locally using Google's MediaPipe Text Embedder and DuckDuckGo Search.
- **[mcp-mcp](https://github.com/wojtyniak/mcp-mcp)** - Meta-MCP Server that acts as a tool discovery service for MCP clients.
- **[mcp-meme-sticky](https://github.com/nkapila6/mcp-meme-sticky)** - Make memes or stickers using MCP server for WhatsApp or Telegram.
- **[MCP-NixOS](https://github.com/utensils/mcp-nixos)** - A Model Context Protocol server that provides AI assistants with accurate, real-time information about NixOS packages, system options, Home Manager settings, and nix-darwin macOS configurations.
- **[mcp-open-library](https://github.com/8enSmith/mcp-open-library)** - A Model Context Protocol (MCP) server for the Open Library API that enables AI assistants to search for book and author information.
- **[mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)** - Connect to MCP servers that run on SSE transport, or expose stdio servers as an SSE server.
- **[mcp-salesforce](https://github.com/lciesielski/mcp-salesforce-example)** - MCP server with basic demonstration of interactions with your Salesforce instance
- **[mcp-sanctions](https://github.com/madupay/mcp-sanctions)** - Screen individuals and organizations against global sanctions lists (OFAC, SDN, UN, etc). Query by prompt or document upload.
- **[mcp-server-leetcode](https://github.com/doggybee/mcp-server-leetcode)** - Practice and retrieve problems from LeetCode. Automate problem retrieval, solutions, and insights for coding practice and competitions.
- **[mcp-vision](https://github.com/groundlight/mcp-vision)** - A MCP server exposing HuggingFace computer vision models such as zero-shot object detection as tools, enhancing the vision capabilities of large language or vision-language models.
- **[mcp-weather](https://github.com/TimLukaHorstmann/mcp-weather)** - Accurate weather forecasts via the AccuWeather API (free tier available).
- **[mcp-youtube-extract](https://github.com/sinjab/mcp_youtube_extract)** - A Model Context Protocol server for YouTube operations, extracting video information and transcripts with intelligent fallback logic. Features comprehensive logging, error handling, and support for both auto-generated and manual transcripts.
- **[mcp_weather](https://github.com/isdaniel/mcp_weather_server)** - Get weather information from https://api.open-meteo.com API.
- **[MCPIgnore Filesytem](https://github.com/CyberhavenInc/filesystem-mcpignore)** - A Data Security First filesystem MCP server that implements .mcpignore to prevent MCP clients from accessing sensitive data.
- **[MeasureSpace MCP](https://github.com/MeasureSpace/measure-space-mcp-server)** - A free [Model Context Protocol (MCP) Server](https://smithery.ai/server/@MeasureSpace/measure-space-mcp-server) that provides global weather, climate, air quality forecast and geocoding services by [measurespace.io](https://measurespace.io).
- **[MediaWiki](https://github.com/ProfessionalWiki/MediaWiki-MCP-Server)** - A Model Context Protocol (MCP) Server that interacts with any MediaWiki wiki
- **[MediaWiki MCP adapter](https://github.com/lucamauri/MediaWiki-MCP-adapter)** - A custom Model Context Protocol adapter for MediaWiki and WikiBase APIs
- **[mem0-mcp](https://github.com/mem0ai/mem0-mcp)** - A Model Context Protocol server for Mem0, which helps with managing coding preferences.
- **[Membase](https://github.com/unibaseio/membase-mcp)** - Save and query your agent memory in distributed way by Membase.
- **[MetaTrader MCP](https://github.com/ariadng/metatrader-mcp-server)** - Enable AI LLMs to execute trades using MetaTrader 5 platform.
- **[Metricool MCP](https://github.com/metricool/mcp-metricool)** - A Model Context Protocol server that integrates with Metricool's social media analytics platform to retrieve performance metrics and schedule content across networks like Instagram, Facebook, Twitter, LinkedIn, TikTok and YouTube.
- **[Microsoft 365](https://github.com/merill/lokka)** - (by Merill) A Model Context Protocol (MCP) server for Microsoft 365. Includes support for all services including Teams, SharePoint, Exchange, OneDrive, Entra, Intune and more. See [Lokka](https://lokka.dev/) for more details.
- **[Microsoft 365](https://github.com/softeria/ms-365-mcp-server)** - MCP server that connects to Microsoft Office and the whole Microsoft 365 suite using Graph API (including Outlook/mail, files, Excel, calendar)
- **[Microsoft Teams](https://github.com/InditexTech/mcp-teams-server)** - MCP server that integrates Microsoft Teams messaging (read, post, mention, list members and threads) 
- **[Mifos X](https://github.com/openMF/mcp-mifosx)** - A MCP server for the Mifos X Open Source Banking useful for managing clients, loans, savings, shares, financial transactions and generating financial reports.
- **[Mikrotik](https://github.com/jeff-nasseri/mikrotik-mcp)** - Mikrotik MCP server which cover networking operations (IP, DHCP, Firewall, etc) 
- **[Mindmap](https://github.com/YuChenSSR/mindmap-mcp-server)** (by YuChenSSR) - A server that generates mindmaps from input containing markdown code.
- **[Minima](https://github.com/dmayboroda/minima)** - MCP server for RAG on local files
- **[Mobile MCP](https://github.com/mobile-next/mobile-mcp)** (by Mobile Next) - MCP server for Mobile(iOS/Android) automation, app scraping and development using physical devices or simulators/emulators.
- **[Monday.com](https://github.com/sakce/mcp-server-monday)** - MCP Server to interact with Monday.com boards and items.
- **[MongoDB](https://github.com/kiliczsh/mcp-mongo-server)** - A Model Context Protocol Server for MongoDB.
- **[MongoDB & Mongoose](https://github.com/nabid-pf/mongo-mongoose-mcp)** - MongoDB MCP Server with Mongoose Schema and Validation.
- **[MongoDB Lens](https://github.com/furey/mongodb-lens)** - Full Featured MCP Server for MongoDB Databases.
- **[Monzo](https://github.com/BfdCampos/monzo-mcp-bfdcampos)** - Access and manage your Monzo bank accounts through natural language, including balance checking, pot management, transaction listing, and transaction annotation across multiple account types (personal, joint, flex).
- **[Morningstar](https://github.com/Morningstar/morningstar-mcp-server)** - MCP Server to interact with Morningstar Research, Editorial and Datapoints
- **[MSSQL](https://github.com/aekanun2020/mcp-server/)** - MSSQL database integration with configurable access controls and schema inspection
- **[MSSQL](https://github.com/JexinSam/mssql_mcp_server)** (by jexin) - MCP Server for MSSQL database in Python
- **[MSSQL-MCP](https://github.com/daobataotie/mssql-mcp)** (by daobataotie) - MSSQL MCP that refer to the official website's SQLite MCP for modifications to adapt to MSSQL
- **[MSSQL-Python](https://github.com/amornpan/py-mcp-mssql)** (by amornpan) - A read-only Python implementation for MSSQL database access with enhanced security features, configurable access controls, and schema inspection capabilities. Focuses on safe database interaction through Python ecosystem.
- **[Multi-Model Advisor](https://github.com/YuChenSSR/multi-ai-advisor-mcp)** - A Model Context Protocol (MCP) server that orchestrates queries across multiple Ollama models, synthesizing their insights to deliver a comprehensive and multifaceted AI perspective on any given query.
- **[Multicluster-MCP-Sever](https://github.com/yanmxa/multicluster-mcp-server)** - The gateway for GenAI systems to interact with multiple Kubernetes clusters.
- **[MySQL](https://github.com/benborla/mcp-server-mysql)** (by benborla) - MySQL database integration in NodeJS with configurable access controls and schema inspection
- **[MySQL](https://github.com/designcomputer/mysql_mcp_server)** (by DesignComputer) - MySQL database integration in Python with configurable access controls and schema inspection
- **[n8n](https://github.com/leonardsellem/n8n-mcp-server)** - This MCP server provides tools and resources for AI assistants to manage n8n workflows and executions, including listing, creating, updating, and deleting workflows, as well as monitoring their execution status.
- **[Nacos MCP Router](https://github.com/nacos-group/nacos-mcp-router)** - This MCP(Model Context Protocol) Server provides tools to search, install, proxy other MCP servers.
- **[NASA](https://github.com/ProgramComputer/NASA-MCP-server)** (by ProgramComputer) - Access to a unified gateway of NASA's data sources including but not limited to APOD, NEO, EPIC, GIBS.
- **[Nasdaq Data Link](https://github.com/stefanoamorelli/nasdaq-data-link-mcp)** (by stefanoamorelli) - An MCP server to access, explore, and interact with Nasdaq Data Link's extensive and valuable financial and economic datasets.
- **[National Parks](https://github.com/KyrieTangSheng/mcp-server-nationalparks)** - The server provides latest information of park details, alerts, visitor centers, campgrounds, hiking trails, and events for U.S. National Parks.
- **[NAVER](https://github.com/pfldy2850/py-mcp-naver)** (by pfldy2850) - This MCP server provides tools to interact with various Naver services, such as searching blogs, news, books, and more.
- **[NBA](https://github.com/Taidgh-Robinson/nba-mcp-server)** - This MCP server provides tools to fetch recent and historical NBA games including basic and advanced statistics.
- **[Neo4j](https://github.com/da-okazaki/mcp-neo4j-server)** - A community built server that interacts with Neo4j Graph Database.
- **[Neovim](https://github.com/bigcodegen/mcp-neovim-server)** - An MCP Server for your Neovim session.
- **[Netbird](https://github.com/aantti/mcp-netbird)** - List and analyze Netbird network peers, groups, policies, and more.
- **[NocoDB](https://github.com/edwinbernadus/nocodb-mcp-server)** - Read and write access to NocoDB database.
- **[nomad-mcp](https://github.com/kocierik/mcp-nomad)** - A server that provides a set of tools for managing Nomad clusters through the MCP.
- **[Notion](https://github.com/suekou/mcp-notion-server)** (by suekou) - Interact with Notion API.
- **[Notion](https://github.com/v-3/notion-server)** (by v-3) - Notion MCP integration. Search, Read, Update, and Create pages through Claude chat.
- **[NS Travel Information](https://github.com/r-huijts/ns-mcp-server)** - Access Dutch Railways (NS) real-time train travel information and disruptions through the official NS API.
- **[ntfy-mcp](https://github.com/teddyzxcv/ntfy-mcp)** (by teddyzxcv) - The MCP server that keeps you informed by sending the notification on phone using ntfy
- **[ntfy-me-mcp](https://github.com/gitmotion/ntfy-me-mcp)** (by gitmotion) - An ntfy MCP server for sending/fetching ntfy notifications to your self-hosted ntfy server from AI Agents 📤 (supports secure token auth & more - use with npx or docker!)
- **[oatpp-mcp](https://github.com/oatpp/oatpp-mcp)** - C++ MCP integration for Oat++. Use [Oat++](https://oatpp.io) to build MCP servers.
- **[Obsidian Markdown Notes](https://github.com/calclavia/mcp-obsidian)** - Read and search through your Obsidian vault or any directory containing Markdown notes
- **[obsidian-mcp](https://github.com/StevenStavrakis/obsidian-mcp)** - (by Steven Stavrakis) An MCP server for Obsidian.md with tools for searching, reading, writing, and organizing notes.
- **[OceanBase](https://github.com/yuanoOo/oceanbase_mcp_server)** - (by yuanoOo) A Model Context Protocol (MCP) server that enables secure interaction with OceanBase databases.
- **[Octocode](https://github.com/bgauryy/octocode-mcp)** - (by Guy Bary) AI-powered developer assistant that enables advanced code research, analysis and discovery across GitHub and NPM realms in realtime
- **[Odoo](https://github.com/ivnvxd/mcp-server-odoo)** - Connect AI assistants to Odoo ERP systems for business data access and workflow automation.
- **[Office-PowerPoint-MCP-Server](https://github.com/GongRzhe/Office-PowerPoint-MCP-Server)** - A Model Context Protocol (MCP) server for creating, reading, and manipulating Microsoft PowerPoint documents.
- **[Office-Visio-MCP-Server](https://github.com/GongRzhe/Office-Visio-MCP-Server)** - A Model Context Protocol (MCP) server for creating, reading, and manipulating Microsoft Visio documents.
- **[Office-Word-MCP-Server](https://github.com/GongRzhe/Office-Word-MCP-Server)** - A Model Context Protocol (MCP) server for creating, reading, and manipulating Microsoft Word documents. 
- **[Okta](https://github.com/kapilduraphe/okta-mcp-server)** - Interact with Okta API.
- **[OneNote](https://github.com/rajvirtual/MCP-Servers/tree/master/onenote)** - (by Rajesh Vijay) An MCP server that connects to Microsoft OneNote using the Microsoft Graph API. Reading notebooks, sections, and pages from OneNote,Creating new notebooks, sections, and pages in OneNote.
- **[Open Strategy Partners Marketing Tools](https://github.com/open-strategy-partners/osp_marketing_tools)** - Content editing codes, value map, and positioning tools for product marketing.
- **[OpenAI WebSearch MCP](https://github.com/ConechoAI/openai-websearch-mcp)** - This is a Python-based MCP server that provides OpenAI `web_search` build-in tool.
- **[OpenAlex.org MCP](https://github.com/drAbreu/alex-mcp)** - Professional MCP server providing ML-powered author disambiguation and comprehensive researcher profiles using the OpenAlex database.
- **[OpenAPI](https://github.com/snaggle-ai/openapi-mcp-server)** - Interact with [OpenAPI](https://www.openapis.org/) APIs.
- **[OpenAPI AnyApi](https://github.com/baryhuang/mcp-server-any-openapi)** - Interact with large [OpenAPI](https://www.openapis.org/) docs using built-in semantic search for endpoints. Allows for customizing the MCP server prefix.
- **[OpenAPI Schema](https://github.com/hannesj/mcp-openapi-schema)** - Allow LLMs to explore large [OpenAPI](https://www.openapis.org/) schemas without bloating the context.
- **[OpenAPI Schema Explorer](https://github.com/kadykov/mcp-openapi-schema-explorer)** - Token-efficient access to local or remote OpenAPI/Swagger specs via MCP Resources.
- **[OpenCTI](https://github.com/Spathodea-Network/opencti-mcp)** - Interact with OpenCTI platform to retrieve threat intelligence data including reports, indicators, malware and threat actors.
- **[OpenCV](https://github.com/GongRzhe/opencv-mcp-server)** - A MCP server providing OpenCV computer vision capabilities. This allows AI assistants and language models to access powerful computer vision tools.
- **[OpenDota](https://github.com/asusevski/opendota-mcp-server)** - Interact with OpenDota API to retrieve Dota 2 match data, player statistics, and more.
- **[OpenRPC](https://github.com/shanejonas/openrpc-mpc-server)** - Interact with and discover JSON-RPC APIs via [OpenRPC](https://open-rpc.org).
- **[OpenStack](https://github.com/wangsqly0407/openstack-mcp-server)** - MCP server implementation that provides OpenStack interaction.
- **[OpenWeather](https://github.com/mschneider82/mcp-openweather)** - Interact with the free openweathermap API to get the current and forecast weather for a location.
- **[OPNSense MCP](https://github.com/vespo92/OPNSenseMCP)** - MCP Server for OPNSense Firewall Management and API access
- **[Optimade MCP](https://github.com/dianfengxiaobo/optimade-mcp-server)** - An MCP server conducts real-time material science data queries with the Optimade database (for example, elemental composition, crystal structure).
- **[Oura Ring](https://github.com/rajvirtual/oura-mcp-server)** (by Rajesh Vijay) - MCP Server to access and analyze your Oura Ring data. It provides a structured way to fetch and understand your health metrics.
- **[Outline](https://github.com/Vortiago/mcp-outline)** - MCP Server to interact with [Outline](https://www.getoutline.com) knowledge base to search, read, create, and manage documents and their content, access collections, add comments, and manage document backlinks.
- **[pancakeswap-poolspy-mcp](https://github.com/kukapay/pancakeswap-poolspy-mcp)** - An MCP server that tracks newly created liquidity pools on Pancake Swap.
- **[Pandoc](https://github.com/vivekVells/mcp-pandoc)** - MCP server for seamless document format conversion using Pandoc, supporting Markdown, HTML, PDF, DOCX (.docx), csv and more.
- **[Paradex MCP](https://github.com/sv/mcp-paradex-py)** - MCP native server for interacting with Paradex platform, including fully features trading.
- **[PDF reader MCP](https://github.com/gpetraroli/mcp_pdf_reader)** - MCP server to read and search text in a local PDF file.
- **[Peacock for VS Code](https://github.com/johnpapa/peacock-mcp)** - MCP Server for the Peacock extension for VS Code, coloring your world, one Code editor at a time. The main goal of the project is to show how an MCP server can be used to interact with APIs.
- **[Phone MCP](https://github.com/hao-cyber/phone-mcp)** - 📱 A powerful plugin that lets you control your Android phone. Enables AI agents to perform complex tasks like automatically playing music based on weather or making calls and sending texts.
- **[PIF](https://github.com/hungryrobot1/MCP-PIF)** - A Personal Intelligence Framework (PIF), providing tools for file operations, structured reasoning, and journal-based documentation to support continuity and evolving human-AI collaboration across sessions.
- **[Pinecone](https://github.com/sirmews/mcp-pinecone)** - MCP server for searching and uploading records to Pinecone. Allows for simple RAG features, leveraging Pinecone's Inference API.
- **[Pinner MCP](https://github.com/safedep/pinner-mcp)** - A MCP server for pinning GitHub Actions and container base images to their immutable SHA hashes to prevent supply chain attacks.
- **[Placid.app](https://github.com/felores/placid-mcp-server)** - Generate image and video creatives using Placid.app templates
- **[Plane](https://github.com/kelvin6365/plane-mcp-server)** - This MCP Server will help you to manage projects and issues through Plane's API
- **[Playwright](https://github.com/executeautomation/mcp-playwright)** - This MCP Server will help you run browser automation and webscraping using Playwright
- **[Podbean](https://github.com/amurshak/podbeanMCP)** - MCP server for managing your podcasts, episodes, and analytics through the Podbean API. Allows for updating, adding, deleting podcasts, querying show description, notes, analytics, and more.
- **[Postman](https://github.com/shannonlal/mcp-postman)** - MCP server for running Postman Collections locally via Newman. Allows for simple execution of Postman Server and returns the results of whether the collection passed all the tests.
- **[Powerdrill](https://github.com/powerdrillai/powerdrill-mcp)** - Interact with Powerdrill datasets, authenticated with [Powerdrill](https://powerdrill.ai) User ID and Project API Key.
- **[Prefect](https://github.com/allen-munsch/mcp-prefect)** - MCP Server for workflow orchestration and ELT/ETL with Prefect Server, and Prefect Cloud [https://www.prefect.io/] using the `prefect` python client.
- **[Productboard](https://github.com/kenjihikmatullah/productboard-mcp)** - Integrate the Productboard API into agentic workflows via MCP.
- **[Prometheus](https://github.com/pab1it0/prometheus-mcp-server)** - Query and analyze Prometheus - open-source monitoring system.
- **[PubChem](https://github.com/sssjiang/pubchem_mcp_server)** - extract drug information from pubchem API.
- **[Pulumi](https://github.com/dogukanakkaya/pulumi-mcp-server)** - MCP Server to Interact with Pulumi API, creates and lists Stacks
- **[Puppeteer vision](https://github.com/djannot/puppeteer-vision-mcp)** - Use Puppeteer to browse a webpage and return a high quality Markdown. Use AI vision capabilities to handle cookies, captchas, and other interactive elements automatically.
- **[Pushover](https://github.com/ashiknesin/pushover-mcp)** - Send instant notifications to your devices using [Pushover.net](https://pushover.net/)
- **[pydantic/pydantic-ai/mcp-run-python](https://github.com/pydantic/pydantic-ai/tree/main/mcp-run-python)** - Run Python code in a secure sandbox via MCP tool calls, powered by Deno and Pyodide
- **[Python CLI MCP](https://github.com/ofek/pycli-mcp)** - Interact with local Python command line applications.
- **[QGIS](https://github.com/jjsantos01/qgis_mcp)** - connects QGIS to Claude AI through the MCP. This integration enables prompt-assisted project creation, layer loading, code execution, and more.
- **[Qiniu MCP Server](https://github.com/qiniu/qiniu-mcp-server)** - The Model Context Protocol (MCP) Server built on Qiniu Cloud products supports users in accessing Qiniu Cloud Storage, intelligent multimedia services, and more through this MCP Server within the context of AI large model clients.
- **[Quarkus](https://github.com/quarkiverse/quarkus-mcp-servers)** - MCP servers for the Quarkus Java framework.
- **[QuickChart](https://github.com/GongRzhe/Quickchart-MCP-Server)** - A Model Context Protocol server for generating charts using QuickChart.io
- **[Qwen_Max](https://github.com/66julienmartin/MCP-server-Qwen_Max)** - A Model Context Protocol (MCP) server implementation for the Qwen models.
- **[RabbitMQ](https://github.com/kenliao94/mcp-server-rabbitmq)** - The MCP server that interacts with RabbitMQ to publish and consume messages.
- **[RAG Local](https://github.com/renl/mcp-rag-local)** - This MCP server for storing and retrieving text passages locally based on their semantic meaning.
- **[RAG Web Browser](https://github.com/apify/mcp-server-rag-web-browser)** An MCP server for Apify's open-source RAG Web Browser [Actor](https://apify.com/apify/rag-web-browser) to perform web searches, scrape URLs, and return content in Markdown.
- **[Raindrop.io](https://github.com/hiromitsusasaki/raindrop-io-mcp-server)** - An integration that allows LLMs to interact with Raindrop.io bookmarks using the Model Context Protocol (MCP).
- **[Random Number](https://github.com/zazencodes/random-number-mcp)** - Provides LLMs with essential random generation abilities, built entirely on Python's standard library.
- **[Reaper](https://github.com/dschuler36/reaper-mcp-server)** - Interact with your [Reaper](https://www.reaper.fm/) (Digital Audio Workstation) projects.
- **[Reddit](https://github.com/universal-mcp/reddit)** - Reddit MCP server from **[agentr](https://agentr.dev/)** that provides support for interacting with Reddit posts, comments, and subreddits.
- **[Redis](https://github.com/GongRzhe/REDIS-MCP-Server)** - Redis database operations and caching microservice server with support for key-value operations, expiration management, and pattern-based key listing.
- **[Redis](https://github.com/prajwalnayak7/mcp-server-redis)** MCP server to interact with Redis Server, AWS Memory DB, etc for caching or other use-cases where in-memory and key-value based storage is appropriate
- **[RedNote MCP](https://github.com/ifuryst/rednote-mcp)** - MCP server for accessing RedNote(XiaoHongShu, xhs) content
- **[Reed Jobs](https://github.com/kld3v/reed_jobs_mcp)** - Search and retrieve job listings from Reed.co.uk.
- **[Rememberizer AI](https://github.com/skydeckai/mcp-server-rememberizer)** - An MCP server designed for interacting with the Rememberizer data source, facilitating enhanced knowledge retrieval.
- **[Replicate](https://github.com/deepfates/mcp-replicate)** - Search, run and manage machine learning models on Replicate through a simple tool-based interface. Browse models, create predictions, track their status, and handle generated images.
- **[Resend](https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/resend)** - Send email using Resend services
- **[Rijksmuseum](https://github.com/r-huijts/rijksmuseum-mcp)** - Interface with the Rijksmuseum API to search artworks, retrieve artwork details, access image tiles, and explore user collections.
- **[Riot Games](https://github.com/jifrozen0110/mcp-riot)** - MCP server for League of Legends – fetch player info, ranks, champion stats, and match history via Riot API.
- **[Rquest](https://github.com/xxxbrian/mcp-rquest)** - An MCP server providing realistic browser-like HTTP request capabilities with accurate TLS/JA3/JA4 fingerprints for bypassing anti-bot measures.
- **[Rust MCP Filesystem](https://github.com/rust-mcp-stack/rust-mcp-filesystem)** - Fast, asynchronous MCP server for efficient handling of various filesystem operations built with the power of Rust.
- **[Salesforce MCP](https://github.com/smn2gnt/MCP-Salesforce)** - Interact with Salesforce Data and Metadata
- **[Salesforce MCP (AiondaDotCom)](https://github.com/AiondaDotCom/mcp-salesforce)** - Universal Salesforce integration with OAuth authentication, smart learning system, comprehensive backup capabilities, and full CRUD operations for any Salesforce org including custom objects and fields.
- **[Salesforce MCP Server](https://github.com/tsmztech/mcp-server-salesforce)** - Comprehensive Salesforce integration with tools for querying records, executing Apex, managing fields/objects, and handling debug logs
- **[SchemaCrawler](https://github.com/schemacrawler/SchemaCrawler-MCP-Server-Usage)** - Connect to any relational database, and be able to get valid SQL, and ask questions like what does a certain column prefix mean.
- **[SchemaFlow](https://github.com/CryptoRadi/schemaflow-mcp-server)** - Real-time PostgreSQL & Supabase database schema access for AI-IDEs via Model Context Protocol. Provides live database context through secure SSE connections with three powerful tools: get_schema, analyze_database, and check_schema_alignment. [SchemaFlow](https://schemaflow.dev)
- **[Scholarly](https://github.com/adityak74/mcp-scholarly)** - A MCP server to search for scholarly and academic articles.
- **[scrapling-fetch](https://github.com/cyberchitta/scrapling-fetch-mcp)** - Access text content from bot-protected websites. Fetches HTML/markdown from sites with anti-automation measures using Scrapling.
- **[SearXNG](https://github.com/ihor-sokoliuk/mcp-searxng)** - A Model Context Protocol Server for [SearXNG](https://docs.searxng.org)
- **[SearXNG](https://github.com/erhwenkuo/mcp-searxng)** - A MCP server provide web searching via [SearXNG](https://docs.searxng.org) & retrieve url as makrdown.
- **[SearXNG Public](https://github.com/pwilkin/mcp-searxng-public)** - A Model Context Protocol Server for retrieving data from public [SearXNG](https://docs.searxng.org) instances, with fallback support
- **[SEC EDGAR](https://github.com/stefanoamorelli/sec-edgar-mcp)** - (by Stefano Amorelli) A community Model Context Protocol Server to access financial filings and data through the U.S. Securities and Exchange Commission ([SEC](https://www.sec.gov/)) `Electronic Data Gathering, Analysis, and Retrieval` ([EDGAR](https://www.sec.gov/submit-filings/about-edgar)) database
- **[Semantic Scholar](https://github.com/universal-mcp/semanticscholar)** - Semantic Scholar MCP server from **[agentr](https://agentr.dev/)** that provides support for research using the Semnatic Scholar App.
- **[SEO MCP](https://github.com/cnych/seo-mcp)** - A free SEO tool MCP (Model Control Protocol) service based on Ahrefs data. Includes features such as backlinks, keyword ideas, and more. by [claudemcp](https://www.claudemcp.com/servers/seo-mcp).
- **[SerpApi](https://github.com/universal-mcp/serpapi)** - SerpApi MCP server from **[agentr](https://agentr.dev/)** that provides support for programmatic access to search engine results.
- **[Serper](https://github.com/garymengcom/serper-mcp-server)** - An MCP server that performs Google searches using [Serper](https://serper.dev).
- **[ServiceNow](https://github.com/osomai/servicenow-mcp)** - A MCP server to interact with a ServiceNow instance
- **[ShaderToy](https://github.com/wilsonchenghy/ShaderToy-MCP)** - This MCP server lets LLMs to interact with the ShaderToy API, allowing LLMs to learn from compute shaders examples and enabling them to create complex GLSL shaders that they are previously not capable of.
- **[Shodan MCP](https://github.com/Hexix23/shodan-mcp)** - MCP server to interact with [Shodan](https://www.shodan.io/)
- **[Shopify](https://github.com/GeLi2001/shopify-mcp)** - MCP to interact with Shopify API including order, product, customers and so on.
- **[Simple Loki MCP](https://github.com/ghrud92/simple-loki-mcp)** - A simple MCP server to query Loki logs using logcli.
- **[Siri Shortcuts](https://github.com/dvcrn/mcp-server-siri-shortcuts)** - MCP to interact with Siri Shortcuts on macOS. Exposes all Shortcuts as MCP tools.
- **[Skyvern](https://github.com/Skyvern-AI/skyvern/tree/main/integrations/mcp)** - MCP to let Claude / Windsurf / Cursor / your LLM control the browser
- **[Slack](https://github.com/korotovsky/slack-mcp-server)** - The most powerful MCP server for Slack Workspaces. This integration supports both Stdio and SSE transports, proxy settings and does not require any permissions or bots being created or approved by Workspace admins 😏.
- **[Slidespeak](https://github.com/SlideSpeak/slidespeak-mcp)** - Create PowerPoint presentations using the [Slidespeak](https://slidespeak.com/) API.
- **[Smartlead](https://github.com/jean-technologies/smartlead-mcp-server-local)** - MCP to connect to Smartlead. Additional, tooling, functionality, and connection to workflow automation platforms also available.
- **[Snowflake](https://github.com/isaacwasserman/mcp-snowflake-server)** - This MCP server enables LLMs to interact with Snowflake databases, allowing for secure and controlled data operations.
- **[SoccerDataAPI](https://github.com/yeonupark/mcp-soccer-data)** - This MCP server provides real-time football match data based on the SoccerDataAPI.
- **[Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit/tree/main/examples/agent-kit-mcp-server)** - This MCP server enables LLMs to interact with the Solana blockchain with help of Solana Agent Kit by SendAI, allowing for 40+ protcool actions and growing
- **[Solr MCP](https://github.com/mjochum64/mcp-solr-search)** - This MCP server offers a basic functionality to perform a search on Solr servers.
- **[Solver](https://github.com/szeider/mcp-solver)** - Solves constraint satisfaction and optimization problems . 
- **[Splunk](https://github.com/jkosik/mcp-server-splunk)** - Golang MCP server for Splunk (lists saved searches, alerts, indexes, macros...). Supports SSE and STDIO.
- **[Spotify](https://github.com/varunneal/spotify-mcp)** - This MCP allows an LLM to play and use Spotify.
- **[Spring Initializr](https://github.com/hpalma/springinitializr-mcp)** - This MCP allows an LLM to create Spring Boot projects with custom configurations. Instead of manually visiting start.spring.io, you can now ask your AI assistant to generate projects with specific dependencies, Java versions, and project structures.
- **[SSH](https://github.com/AiondaDotCom/mcp-ssh)** - Agent for managing and controlling SSH connections.
- **[SSH](https://github.com/classfang/ssh-mcp-server)** - An MCP server that can execute SSH commands remotely, upload files, download files, and so on.
- **[Standard Korean Dictionary](https://github.com/privetin/stdict)** - Search the dictionary using API
- **[Star Wars](https://github.com/johnpapa/mcp-starwars)** -MCP Server for the SWAPI Star Wars API. The main goal of the project is to show how an MCP server can be used to interact with APIs.
- **[Starknet MCP Server](https://github.com/mcpdotdirect/starknet-mcp-server)** - A comprehensive MCP server for interacting with the Starknet blockchain, providing tools for querying blockchain data, resolving StarknetIDs, and performing token transfers.
- **[Starwind UI](https://github.com/Boston343/starwind-ui-mcp/)** - This MCP provides relevant commands, documentation, and other information to allow LLMs to take full advantage of Starwind UI's open source Astro components.
- **[Stellar](https://github.com/syronlabs/stellar-mcp/)** - This MCP server enables LLMs to interact with the Stellar blockchain to create accounts, check address balances, analyze transactions, view transaction history, mint new assets, interact with smart contracts and much more.
- **[Stitch AI](https://github.com/StitchAI/stitch-ai-mcp/)** - Knowledge management system for AI agents with memory space creation and retrieval capabilities.
- **[Strava](https://github.com/r-huijts/strava-mcp)** - Connect to the Strava API to access activity data, athlete profiles, segments, and routes, enabling fitness tracking and analysis with Claude.
- **[Stripe](https://github.com/atharvagupta2003/mcp-stripe)** - This MCP allows integration with Stripe for handling payments, customers, and refunds.
- **[Substack/Medium](https://github.com/jonathan-politzki/mcp-writer-substack)** - Connect Claude to your Substack/Medium writing, enabling semantic search and analysis of your published content.
- **[System Health](https://github.com/thanhtung0201/mcp-remote-system-health)** - The MCP (Multi-Channel Protocol) System Health Monitoring is a robust, real-time monitoring solution designed to provide comprehensive health metrics and alerts for remote Linux servers.
- **[Talk To Figma](https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp)** - This MCP server enables LLMs to interact with Figma, allowing them to read and modify designs programmatically.
- **[Talk To Figma via Claude](https://github.com/gaganmanku96/talk-with-figma-claude)** - TMCP server that provides seamless Figma integration specifically for Claude Desktop, enabling design creation, modification, and real-time collaboration through natural language commands.
- **[TAM MCP Server](https://github.com/gvaibhav/TAM-MCP-Server)** - Market research and business intelligence with TAM/SAM calculations and integration across 8 economic data sources: Alpha Vantage, BLS, Census Bureau, FRED, IMF, Nasdaq Data Link, OECD, and World Bank.
- **[Tavily search](https://github.com/RamXX/mcp-tavily)** - An MCP server for Tavily's search & news API, with explicit site inclusions/exclusions
- **[TeamRetro](https://github.com/adepanges/teamretro-mcp-server)** - This MCP server allows LLMs to interact with TeamRetro, allowing LLMs to manage user, team, team member, retrospective, health check, action, agreement and fetch the reports.
- **[Telegram](https://github.com/chigwell/telegram-mcp)** - An MCP server that provides paginated chat reading, message retrieval, and message sending capabilities for Telegram through Telethon integration.
- **[Telegram-Client](https://github.com/chaindead/telegram-mcp)** - A Telegram API bridge that manages user data, dialogs, messages, drafts, read status, and more for seamless interactions.
- **[Tempo](https://github.com/scottlepp/tempo-mcp-server)** - An MCP server to query traces/spans from [Grafana Tempo](https://github.com/grafana/tempo).
- **[Teradata](https://github.com/arturborycki/mcp-teradata)** - his MCP server enables LLMs to interact with Teradata databases. This MCP Server support tools and prompts for multi task data analytics
- **[Terminal-Control](https://github.com/GongRzhe/terminal-controller-mcp)** - A MCP server that enables secure terminal command execution, directory navigation, and file system operations through a standardized interface.
- **[Terraform-Cloud](https://github.com/severity1/terraform-cloud-mcp)** - An MCP server that integrates AI assistants with the Terraform Cloud API, allowing you to manage your infrastructure through natural conversation.
- **[TFT-Match-Analyzer](https://github.com/GeLi2001/tft-mcp-server)** - MCP server for teamfight tactics match history & match details fetching, providing user the detailed context for every match.
- **[thegraph-mcp](https://github.com/kukapay/thegraph-mcp)** - An MCP server that powers AI agents with indexed blockchain data from The Graph.
- **[Things3 MCP](https://github.com/urbanogardun/things3-mcp)** - Things3 task management integration for macOS with comprehensive TODO, project, and tag management.
- **[Think MCP](https://github.com/Rai220/think-mcp)** - Enhances any agent's reasoning capabilities by integrating the think-tools, as described in [Anthropic's article](https://www.anthropic.com/engineering/claude-think-tool).
- **[Ticketmaster](https://github.com/delorenj/mcp-server-ticketmaster)** - Search for events, venues, and attractions through the Ticketmaster Discovery API
- **[TickTick](https://github.com/alexarevalo9/ticktick-mcp-server)** - A Model Context Protocol (MCP) server designed to integrate with the TickTick task management platform, enabling intelligent context-aware task operations and automation.
- **[tip.md](https://github.com/tipdotmd#-mcp-server-for-ai-assistants)** - An MCP server that enables AI assistants to interact with tip.md's crypto tipping functionality, allowing agents or supporters to tip registered developers directly from AI chat interfaces.
- **[TMDB](https://github.com/Laksh-star/mcp-server-tmdb)** - This MCP server integrates with The Movie Database (TMDB) API to provide movie information, search capabilities, and recommendations.
- **[Todoist](https://github.com/abhiz123/todoist-mcp-server)** - Interact with Todoist to manage your tasks.
- **[Todos](https://github.com/tomelliot/todos-mcp)** - A practical todo list manager to use with your favourite chatbot.
- **[token-minter-mcp](https://github.com/kukapay/token-minter-mcp)** - An MCP server providing tools for AI agents to mint ERC-20 tokens across multiple blockchains.
- **[token-revoke-mcp](https://github.com/kukapay/token-revoke-mcp)** - An MCP server for checking and revoking ERC-20 token allowances across multiple blockchains.
- **[Ton Blockchain MCP](https://github.com/devonmojito/ton-blockchain-mcp)** - An MCP server for interacting with Ton Blockchain.
- **[TouchDesigner](https://github.com/8beeeaaat/touchdesigner-mcp)** - An MCP server for TouchDesigner, enabling interaction with TouchDesigner projects, nodes, and parameters.
- **[Travel Planner](https://github.com/GongRzhe/TRAVEL-PLANNER-MCP-Server)** - Travel planning and itinerary management server integrating with Google Maps API for location search, place details, and route calculations.
- **[Trello MCP Server](https://github.com/lioarce01/trello-mcp-server)** - An MCP server that interact with user Trello boards, modifying them with prompting.
- **[Tripadvisor](https://github.com/pab1it0/tripadvisor-mcp)** - A MCP server that enables LLMs to interact with Tripadvisor API, supporting location data, reviews, and photos through standardized MCP interfaces
- **[TrueNAS Core MCP](https://github.com/vespo92/TrueNasCoreMCP)** - An MCP server for interacting with TrueNAS Core.
- **[Tyk API Management](https://github.com/TykTechnologies/tyk-dashboard-mcp)** - Chat with all of your organization's managed APIs and perform other API lifecycle operations, managing tokens, users, analytics, and more.
- **[Typesense](https://github.com/suhail-ak-s/mcp-typesense-server)** - A Model Context Protocol (MCP) server implementation that provides AI models with access to Typesense search capabilities. This server enables LLMs to discover, search, and analyze data stored in Typesense collections.
- **[uniswap-poolspy-mcp](https://github.com/kukapay/uniswap-poolspy-mcp)** - An MCP server that tracks newly created liquidity pools on Uniswap across nine blockchain networks.
- **[uniswap-trader-mcp](https://github.com/kukapay/uniswap-trader-mcp)** -An MCP server for AI agents to automate token swaps on Uniswap DEX across multiple blockchains.
- **[Unity Catalog](https://github.com/ognis1205/mcp-server-unitycatalog)** - An MCP server that enables LLMs to interact with Unity Catalog AI, supporting CRUD operations on Unity Catalog Functions and executing them as MCP tools.
- **[Unity Integration (Advanced)](https://github.com/quazaai/UnityMCPIntegration)** - Advanced Unity3d Game Engine MCP which supports ,Execution of Any Editor Related Code Directly Inside of Unity, Fetch Logs, Get Editor State and Allow File Access of the Project making it much more useful in Script Editing or asset creation.
- **[Unity3d Game Engine](https://github.com/CoderGamester/mcp-unity)** - An MCP server that enables LLMs to interact with Unity3d Game Engine, supporting access to a variety of the Unit's Editor engine tools (e.g. Console Logs, Test Runner logs, Editor functions, hierarchy state, etc) and executing them as MCP tools or gather them as resources.
- **[Unleash Integration (Feature Toggle)](https://github.com/cuongtl1992/unleash-mcp)** - A Model Context Protocol (MCP) server implementation that integrates with Unleash Feature Toggle system. Provide a bridge between LLM applications and Unleash feature flag system
- **[use_aws_mcp](https://github.com/runjivu/use_aws_mcp)** - amazon-q-cli's use_aws tool extracted into independant mcp, for general aws api usage.
- **[User Feedback](https://github.com/mrexodia/user-feedback-mcp)** - Simple MCP Server to enable a human-in-the-loop workflow in tools like Cline and Cursor.
- **[USPTO](https://github.com/riemannzeta/patent_mcp_server)** - MCP server for accessing United States Patent & Trademark Office data through its Open Data Protocol (ODP) API.
- **[Vectara](https://github.com/vectara/vectara-mcp)** - Query Vectara's trusted RAG-as-a-service platform.
- **[Vega-Lite](https://github.com/isaacwasserman/mcp-vegalite-server)** - Generate visualizations from fetched data using the VegaLite format and renderer.
- **[Vertica](https://github.com/nolleh/mcp-vertica)** - Vertica database integration in Python with configurable access controls and schema inspection
- **[Vibe Check](https://github.com/PV-Bhat/vibe-check-mcp-server)** - An MCP server leveraging an external oversight layer to "vibe check" agents, and also self-improve accuracy & user alignment over time. Prevents scope creep, code bloat, misalignment, misinterpretation, tunnel vision, and overcomplication.
- **[Video Editor](https://github.com/burningion/video-editing-mcp)** - A Model Context Protocol Server to add, edit, and search videos with [Video Jungle](https://www.video-jungle.com/).
- **[Video Still Capture](https://github.com/13rac1/videocapture-mcp)** - 📷 Capture video stills from an OpenCV-compatible webcam or other video source.
- **[Virtual location (Google Street View,etc.)](https://github.com/mfukushim/map-traveler-mcp)** - Integrates Google Map, Google Street View, PixAI, Stability.ai, ComfyUI API and Bluesky to provide a virtual location simulation in LLM (written in Effect.ts)
- **[Voice MCP](https://github.com/mbailey/voice-mcp)** - Enable voice conversations with Claude using any OpenAI-compatible STT/TTS service ([voice-mcp.com](https://voice-mcp.com))
- **[VolcEngine TOS](https://github.com/dinghuazhou/sample-mcp-server-tos)** - A sample MCP server for VolcEngine TOS that flexibly get objects from TOS.
- **[Voyp](https://github.com/paulotaylor/voyp-mcp)** - VOYP MCP server for making calls using Artificial Intelligence.
- **[vulnicheck](https://github.com/andrasfe/vulnicheck)** - Real-time Python package vulnerability scanner that checks dependencies against OSV and NVD databases, providing comprehensive security analysis with CVE details, lock file support, and actionable upgrade recommendations.
- **[Wanaku MCP Router](https://github.com/wanaku-ai/wanaku/)** - The Wanaku MCP Router is a SSE-based MCP server that provides an extensible routing engine that allows integrating your enterprise systems with AI agents.
- **[weather-mcp-server](https://github.com/devilcoder01/weather-mcp-server)** - Get real-time weather data for any location using weatherapi.
- **[Webflow](https://github.com/kapilduraphe/webflow-mcp-server)** - Interfact with the Webflow APIs
- **[whale-tracker-mcp](https://github.com/kukapay/whale-tracker-mcp)**  -  A mcp server for tracking cryptocurrency whale transactions.
- **[WhatsApp MCP Server](https://github.com/lharries/whatsapp-mcp)** - MCP server for your personal WhatsApp handling individuals, groups, searching and sending.
- **[Whois MCP](https://github.com/bharathvaj-ganesan/whois-mcp)** - MCP server that performs whois lookup against domain, IP, ASN and TLD. 
- **[Wikidata MCP](https://github.com/zzaebok/mcp-wikidata)** - Wikidata MCP server that interact with Wikidata, by searching identifiers, extracting metadata, and executing sparql query.
- **[Wikipedia MCP](https://github.com/Rudra-ravi/wikipedia-mcp)** - Access and search Wikipedia articles via MCP for AI-powered information retrieval.
- **[WildFly MCP](https://github.com/wildfly-extras/wildfly-mcp)** - WildFly MCP server that enables LLM to interact with running WildFly servers (retrieve metrics, logs, invoke operations, ...).
- **[Windows CLI](https://github.com/SimonB97/win-cli-mcp-server)** - MCP server for secure command-line interactions on Windows systems, enabling controlled access to PowerShell, CMD, and Git Bash shells.
- **[Workflowy](https://github.com/danield137/mcp-workflowy)** - A server that interacts with [workflowy](https://workflowy.com/).
- **[World Bank data API](https://github.com/anshumax/world_bank_mcp_server)** - A server that fetches data indicators available with the World Bank as part of their data API
- **[Wren Engine](https://github.com/Canner/wren-engine)** - The Semantic Engine for Model Context Protocol(MCP) Clients and AI Agents
- **[Wrike](https://github.com/universal-mcp/wrike)** - Wrike MCP server from **[agentr](https://agentr.dev/)** that provides support for managing projects, tasks, and workflows in Wrike.
- **[X (Twitter)](https://github.com/EnesCinr/twitter-mcp)** (by EnesCinr) - Interact with twitter API. Post tweets and search for tweets by query.
- **[X (Twitter)](https://github.com/vidhupv/x-mcp)** (by vidhupv) - Create, manage and publish X/Twitter posts directly through Claude chat.
- **[Xcode](https://github.com/r-huijts/xcode-mcp-server)** - MCP server that brings AI to your Xcode projects, enabling intelligent code assistance, file operations, project management, and automated development tasks.
- **[xcodebuild](https://github.com/ShenghaiWang/xcodebuild)**  - 🍎 Build iOS Xcode workspace/project and feed back errors to llm.
- **[Xero-mcp-server](https://github.com/john-zhang-dev/xero-mcp)** - Enabling clients to interact with Xero system for streamlined accounting, invoicing, and business operations.
- **[XiYan](https://github.com/XGenerationLab/xiyan_mcp_server)** - 🗄️ An MCP server that supports fetching data from a database using natural language queries, powered by XiyanSQL as the text-to-SQL LLM.
- **[XMind](https://github.com/apeyroux/mcp-xmind)** - Read and search through your XMind directory containing XMind files.
- **[yfinance](https://github.com/Adity-star/mcp-yfinance-server)** -💹The MCP YFinance Stock Server provides real-time and historical stock data in a standard format, powering dashboards, AI agents,and research tools with seamless financial insights.
- **[YNAB](https://github.com/ChuckBryan/ynabmcpserver)** - A Model Context Protocol (MCP) server for integrating with YNAB (You Need A Budget), allowing AI assistants to securely access and analyze your financial data.
- **[YouTrack](https://github.com/tonyzorin/youtrack-mcp)** - A Model Context Protocol (MCP) server implementation for JetBrains YouTrack, allowing AI assistants to interact with YouTrack issue tracking system.
- **[YouTube](https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/youtube)** - Extract Youtube video information (with proxies support).
- **[YouTube](https://github.com/ZubeidHendricks/youtube-mcp-server)** - Comprehensive YouTube API integration for video management, Shorts creation, and analytics.
- **[Youtube Uploader MCP](https://github.com/anwerj/youtube-uploader-mcp)** - AI‑powered YouTube uploader—no CLI, no YouTube Studio.
- **[YouTube Video Summarizer](https://github.com/nabid-pf/youtube-video-summarizer-mcp)** - Summarize lengthy youtube videos.
- **[Zoom](https://github.com/Prathamesh0901/zoom-mcp-server/tree/main)** - Create, update, read and delete your zoom meetings.

## 📚 Frameworks

These are high-level frameworks that make it easier to build MCP servers or clients.

### For servers

* **[EasyMCP](https://github.com/zcaceres/easy-mcp/)** (TypeScript)
- **[FastAPI to MCP auto generator](https://github.com/tadata-org/fastapi_mcp)** – A zero-configuration tool for automatically exposing FastAPI endpoints as MCP tools by **[Tadata](https://tadata.com/)**
* **[FastMCP](https://github.com/punkpeye/fastmcp)** (TypeScript)
* **[Foobara MCP Connector](https://github.com/foobara/mcp-connector)** - Easily expose Foobara commands written in Ruby as tools via MCP
* **[Foxy Contexts](https://github.com/strowk/foxy-contexts)** – A library to build MCP servers in Golang by **[strowk](https://github.com/strowk)**
* **[Higress MCP Server Hosting](https://github.com/alibaba/higress/tree/main/plugins/wasm-go/mcp-servers)** - A solution for hosting MCP Servers by extending the API Gateway (based on Envoy) with wasm plugins.
* **[MCP Declarative Java SDK](https://github.com/codeboyzhou/mcp-declarative-java-sdk)** Annotation-driven MCP servers development with Java, no Spring Framework Required, minimize dependencies as much as possible.
* **[MCP-Framework](https://mcp-framework.com)** Build MCP servers with elegance and speed in Typescript. Comes with a CLI to create your project with `mcp create app`. Get started with your first server in under 5 minutes by **[Alex Andru](https://github.com/QuantGeekDev)**
* **[MCP Plexus](https://github.com/Super-I-Tech/mcp_plexus)**: A secure, **multi-tenant** and Multi-user MCP python server framework built to integrate easily with external services via OAuth 2.1, offering scalable and robust solutions for managing complex AI applications.
* **[mcp_sse (Elixir)](https://github.com/kEND/mcp_sse)** An SSE implementation in Elixir for rapidly creating MCP servers.
* **[Next.js MCP Server Template](https://github.com/vercel-labs/mcp-for-next.js)** (Typescript) - A starter Next.js project that uses the MCP Adapter to allow MCP clients to connect and access resources.
* **[Quarkus MCP Server SDK](https://github.com/quarkiverse/quarkus-mcp-server)** (Java)
* **[SAP ABAP MCP Server SDK](https://github.com/abap-ai/mcp)** - Build SAP ABAP based MCP servers. ABAP 7.52 based with 7.02 downport; runs on R/3 & S/4HANA on-premises, currently not cloud-ready.
* **[Spring AI MCP Server](https://docs.spring.io/spring-ai/reference/api/mcp/mcp-server-boot-starter-docs.html)** - Provides auto-configuration for setting up an MCP server in Spring Boot applications.
* **[Template MCP Server](https://github.com/mcpdotdirect/template-mcp-server)** - A CLI tool to create a new Model Context Protocol server project with TypeScript support, dual transport options, and an extensible structure
* **[AgentR Universal MCP SDK](https://github.com/universal-mcp/universal-mcp)** - A python SDK to build MCP Servers with inbuilt credential management by **[Agentr](https://agentr.dev/home)**
* **[Vercel MCP Adapter](https://github.com/vercel/mcp-adapter)** (Typescript) - A simple package to start serving an MCP server on most major JS meta-frameworks including Next, Nuxt, Svelte, and more.


### For clients

* **[codemirror-mcp](https://github.com/marimo-team/codemirror-mcp)** - CodeMirror extension that implements the Model Context Protocol (MCP) for resource mentions and prompt commands
* **[MCP-Agent](https://github.com/lastmile-ai/mcp-agent)** - A simple, composable framework to build agents using Model Context Protocol by **[LastMile AI](https://www.lastmileai.dev)**
* **[Spring AI MCP Client](https://docs.spring.io/spring-ai/reference/api/mcp/mcp-client-boot-starter-docs.html)** - Provides auto-configuration for MCP client functionality in Spring Boot applications.
* **[MCP CLI Client](https://github.com/vincent-pli/mcp-cli-host)** - A CLI host application that enables Large Language Models (LLMs) to interact with external tools through the Model Context Protocol (MCP).

## 📚 Resources

Additional resources on MCP.

- **[AiMCP](https://www.aimcp.info)** - A collection of MCP clients&servers to find the right mcp tools by **[Hekmon](https://github.com/hekmon8)**
- **[Awesome Crypto MCP Servers by badkk](https://github.com/badkk/awesome-crypto-mcp-servers)** - A curated list of MCP servers by **[Luke Fan](https://github.com/badkk)**
- **[Awesome MCP Servers by appcypher](https://github.com/appcypher/awesome-mcp-servers)** - A curated list of MCP servers by **[Stephen Akinyemi](https://github.com/appcypher)**
- **[Awesome MCP Servers by punkpeye](https://github.com/punkpeye/awesome-mcp-servers)** (**[website](https://glama.ai/mcp/servers)**) - A curated list of MCP servers by **[Frank Fiegel](https://github.com/punkpeye)**
- **[Awesome MCP Servers by wong2](https://github.com/wong2/awesome-mcp-servers)** (**[website](https://mcpservers.org)**) - A curated list of MCP servers by **[wong2](https://github.com/wong2)**
- **[Awesome Remote MCP Servers by JAW9C](https://github.com/jaw9c/awesome-remote-mcp-servers)** - A curated list of **remote** MCP servers, including thier authentication support by **[JAW9C](https://github.com/jaw9c)**
- **[Discord Server](https://glama.ai/mcp/discord)** – A community discord server dedicated to MCP by **[Frank Fiegel](https://github.com/punkpeye)**
- **[Discord Server (ModelContextProtocol)](https://discord.gg/jHEGxQu2a5)** – Connect with developers, share insights, and collaborate on projects in an active Discord community dedicated to the Model Context Protocol by **[Alex Andru](https://github.com/QuantGeekDev)**
- <img height="12" width="12" src="https://raw.githubusercontent.com/klavis-ai/klavis/main/static/klavis-ai.png" alt="Klavis Logo" /> **[Klavis AI](https://www.klavis.ai)** - Open Source MCP Infra. Hosted MCP servers and MCP clients on Slack and Discord.
- **[MCP Badges](https://github.com/mcpx-dev/mcp-badges)** – Quickly highlight your MCP project with clear, eye-catching badges, by **[Ironben](https://github.com/nanbingxyz)**
- **[MCPRepository.com](https://mcprepository.com/)** - A repository that indexes and organizes all MCP servers for easy discovery.
- **[mcp-cli](https://github.com/wong2/mcp-cli)** - A CLI inspector for the Model Context Protocol by **[wong2](https://github.com/wong2)**
- **[mcp-dockmaster](https://mcp-dockmaster.com)** - An Open-Sourced UI to install and manage MCP servers for Windows, Linux and MacOS.
- **[mcp-get](https://mcp-get.com)** - Command line tool for installing and managing MCP servers by **[Michael Latman](https://github.com/michaellatman)**
- **[mcp-guardian](https://github.com/eqtylab/mcp-guardian)** - GUI application + tools for proxying / managing control of MCP servers by **[EQTY Lab](https://eqtylab.io)**
- **[MCP Linker](https://github.com/milisp/mcp-linker)** - A cross-platform Tauri GUI tool for one-click setup and management of MCP servers, supporting Claude Desktop, Cursor, Windsurf, VS Code, Cline, and Neovim.
- **[mcp-manager](https://github.com/zueai/mcp-manager)** - Simple Web UI to install and manage MCP servers for Claude Desktop by **[Zue](https://github.com/zueai)**
- **[MCP Marketplace Web Plugin](https://github.com/AI-Agent-Hub/mcp-marketplace)** MCP Marketplace is a small Web UX plugin to integrate with AI applications, Support various MCP Server API Endpoint (e.g pulsemcp.com/deepnlp.org and more). Allowing user to browse, paginate and select various MCP servers by different categories. [Pypi](https://pypi.org/project/mcp-marketplace) | [Maintainer](https://github.com/AI-Agent-Hub) | [Website](http://www.deepnlp.org/store/ai-agent/mcp-server)
- **[mcp.natoma.id](https://mcp.natoma.id)** – A Hosted MCP Platform to discover, install, manage and deploy MCP servers by **[Natoma Labs](https://www.natoma.id)**
- **[mcp.run](https://mcp.run)** - A hosted registry and control plane to install & run secure + portable MCP Servers.
- **[MCP Review](https://www.mcpreview.com)** - Website to list high quality MCP servers and reviews by real users. Also provide online playground for popular MCP servers.
- **[MCP Router](https://mcp-router.net)** – Free Windows and macOS app that simplifies MCP management while providing seamless app authentication and powerful log visualization by **[MCP Router](https://github.com/mcp-router/mcp-router)**
- **[MCP Servers Hub](https://github.com/apappascs/mcp-servers-hub)** (**[website](https://mcp-servers-hub-website.pages.dev/)**) - A curated list of MCP servers by **[apappascs](https://github.com/apappascs)**
- **[MCPServers.com](https://mcpservers.com)** - A growing directory of high-quality MCP servers with clear setup guides for a variety of MCP clients. Built by the team behind the **[Highlight MCP client](https://highlightai.com/)**
- **[MCP Servers Rating and User Reviews](http://www.deepnlp.org/store/ai-agent/mcp-server)** - Website to rate MCP servers, write authentic user reviews, and [search engine for agent & mcp](http://www.deepnlp.org/search/agent)
- **[MCP X Community](https://x.com/i/communities/1861891349609603310)** – A X community for MCP by **[Xiaoyi](https://x.com/chxy)**
- **[MCPHub](https://github.com/Jeamee/MCPHub-Desktop)** – An Open Source macOS & Windows GUI Desktop app for discovering, installing and managing MCP servers by **[Jeamee](https://github.com/jeamee)**
- **[mcpm](https://github.com/pathintegral-institute/mcpm.sh)** ([website](https://mcpm.sh)) - MCP Manager (MCPM) is a Homebrew-like service for managing Model Context Protocol (MCP) servers across clients by **[Pathintegral](https://github.com/pathintegral-institute)**
- **[MCPVerse](https://mcpverse.dev)** - A portal for creating & hosting authenticated MCP servers and connecting to them securely.
- **[MCPWatch](https://github.com/kapilduraphe/mcp-watch)** - A comprehensive security scanner for Model Context Protocol (MCP) servers that detects vulnerabilities and security issues in your MCP server implementations.
- <img height="12" width="12" src="https://mkinf.io/favicon-lilac.png" alt="mkinf Logo" /> **[mkinf](https://mkinf.io)** - An Open Source registry of hosted MCP Servers to accelerate AI agent workflows.
- **[Open-Sourced MCP Servers Directory](https://github.com/chatmcp/mcp-directory)** - A curated list of MCP servers by **[mcpso](https://mcp.so)**
- <img height="12" width="12" src="https://opentools.com/favicon.ico" alt="OpenTools Logo" /> **[OpenTools](https://opentools.com)** - An open registry for finding, installing, and building with MCP servers by **[opentoolsteam](https://github.com/opentoolsteam)**
- **[PulseMCP](https://www.pulsemcp.com)** ([API](https://www.pulsemcp.com/api)) - Community hub & weekly newsletter for discovering MCP servers, clients, articles, and news by **[Tadas Antanavicius](https://github.com/tadasant)**, **[Mike Coughlin](https://github.com/macoughl)**, and **[Ravina Patel](https://github.com/ravinahp)**
- **[r/mcp](https://www.reddit.com/r/mcp)** – A Reddit community dedicated to MCP by **[Frank Fiegel](https://github.com/punkpeye)**
- **[r/modelcontextprotocol](https://www.reddit.com/r/modelcontextprotocol)** – A Model Context Protocol community Reddit page - discuss ideas, get answers to your questions, network with like-minded people, and showcase your projects! by **[Alex Andru](https://github.com/QuantGeekDev)**
- **[MCP.ing](https://mcp.ing/)** - A list of MCP services for discovering MCP servers in the community and providing a convenient search function for MCP services by **[iiiusky](https://github.com/iiiusky)**
- **[Smithery](https://smithery.ai/)** - A registry of MCP servers to find the right tools for your LLM agents by **[Henry Mao](https://github.com/calclavia)**
- **[Toolbase](https://gettoolbase.ai)** - Desktop application that manages tools and MCP servers with just a few clicks - no coding required by **[gching](https://github.com/gching)**
- **[ToolHive](https://github.com/StacklokLabs/toolhive)** - A lightweight utility designed to simplify the deployment and management of MCP servers, ensuring ease of use, consistency, and security through containerization by **[StacklokLabs](https://github.com/StacklokLabs)**

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
