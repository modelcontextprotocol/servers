# Fastn UCL – Model Context Protocol Server

[Fastn UCL](https://ucl.dev) is a production-ready implementation of the [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/spec) designed for AI builders.

It exposes a unified `/command` endpoint that allows developers to interact with 1000+ applications (e.g. Notion, Slack, Gmail, GitHub) via consistent command + context payloads — without repetitive API setup.

---

## 🚀 What is Fastn UCL?

Fastn UCL (Unified Command Layer) is a multi-tenant MCP that enables:

- Reusable commands across different tools
- Context-aware execution (ideal for AI agents)
- Embedding directly into agents, SaaS products, and more.
- Built for multi-tenant, multi-agent orchestration

It follows the MCP spec out of the box.

📘 [Read the full documentation](https://docs.fastn.ai/ucl-unified-command-layer/about-fastn-ucl)

---

## 🔌 Endpoint

**`POST /command`**

Send commands and contexts using a standard MCP payload.

### Example Request
```json
{
  "command": "send_slack_message",
  "context": {
    "channel": "#general",
    "message": "Hello from Fastn UCL!"
  }
}
