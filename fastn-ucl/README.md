# Fastn UCL – Model Context Protocol Server

Fastn UCL is a production-ready, multi-tenant implementation of the **Model Context Protocol (MCP)**, built to help AI agents take real actions across 1000+ tools via a single, unified interface.

With just one /command endpoint, your AI agents can access external services like **Notion, Slack, Gmail, Jira,** and many more, without writing custom glue code, managing auth, or duplicating integration logic.

## 🔧 What is Fastn UCL?

**Fastn UCL (Unified Command Layer)** is a secure, MCP-compliant platform that sits between your AI agents and third-party tools. It enables:

- **Reusable Commands:** One command schema works across all tools
- **Context-Aware Execution:** Every action is scoped to the correct tenant, user, and configuration
- **Embedded Integration:** Use directly inside agents or SaaS products, no redirect flows
- **Enterprise-Grade Multitenancy:** Fully isolated tenants within a single deployment
- **Built-in Observability:** Automatic logging, retries, and audit trails

Whether you're building an AI-native SaaS product or integrating agents into internal tools, Fastn UCL handles the complexity of real-world execution at scale.

## 🌐 Unified Endpoint

Fastn UCL exposes a single standardized endpoint:

```
POST /command
```

This endpoint receives a payload containing:
- A command: the structured action you want to execute
- A context: all necessary input like credentials, parameters, or metadata

## 📦 Example Request

```json
{
"command": "send_slack_message",
"context": {
  "channel": "#general",
  "message": "Hello from Fastn UCL!"
}
}
```

Fastn UCL will:
- Identify the correct **tenant and user**
- Match the command to the right **connector configuration**
- Authenticate and route the request to the external tool
- Return a standardized, structured result

## 🤝 Seamless AI Integration

Use Fastn UCL with any AI framework:

| Platform | Use Case Example |
|----------|------------------|
| CrewAI | Multi-agent workflows accessing real-world tools |
| LangChain | LLM apps with tool-use via MCP adapter |
| LlamaIndex | RAG apps that both retrieve info and trigger actions |
| LiveKit | Voice-driven agents interacting with external systems |

Each sample follows a common structure:

**User Input → AI Platform → Fastn UCL → External Tool → Output**

## 🧰 Highlights & Benefits

- **1000+ Tools Supported:** From Slack and Notion to Salesforce and Active Directory
- **Multitenant by Design:** One deployment, many securely isolated customers
- **No Hosting Needed:** Fully managed platform with zero infra burden
- **Observability Built In:** Real-time monitoring, structured logs, error handling
- **Secure & Compliant:** SOC 2 Type II, GDPR, HIPAA-ready

## 🚀 Quick Start

**Prerequisites**
- Python 3.8+
- Fastn UCL API Key and Space ID (sign up at [ucl.dev](https://ucl.dev/))
- Optional: OpenAI key (for AI-powered use cases)

**Steps**
```bash
# Clone any integration sample
cd crewai/

# Setup virtual environment
python -m venv venv && source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure credentials
cp .env.example .env
# Edit .env with your Fastn UCL API Key and Space ID

# Run the sample
python app.py
```

## 🔌 Tool Coverage

Fastn UCL supports tools across categories like:

**Productivity**
- Gmail, Google Calendar, Notion, Slack, Microsoft Teams

**Project Management**
- Jira, Linear, Asana, Trello

**CRM & Sales**
- Salesforce, HubSpot, Zoho CRM

**Enterprise IT**
- Active Directory, Okta, Datadog, Splunk

**Data & Analytics**
- MongoDB, Elasticsearch, Tableau

And **900+ more** — [see full list](https://docs.fastn.ai/)

## 🏗️ Architecture Overview
<img width="779" height="223" alt="fasnt architecture image" src="https://github.com/user-attachments/assets/e4afa62b-5717-4c27-96fe-4dfe4bcb486e" />


Fastn UCL acts as your intelligent, context-aware middleware, no manual wiring, no auth headaches.

## 📚 Resources

- [Fastn UCL Docs](https://docs.fastn.ai/)
- [MCP Spec](https://modelcontext.org/)
- [Integration Samples](https://github.com/fastn-ai/ucl-integration-samples)

## 🆘 Support

- Email: support@fastn.ai
- Join discussions: [GitHub Discussions](https://github.com/fastn-ai)
- Raise issues: [GitHub Issues](https://github.com/fastn-ai)
