# thatsme-mcp-issuer

Issue digital certificates and query engagement data from
thatsme — the world's first RewardTech platform.

## Category

Business Tools

## Tools

- `search_events` — Search your organization's events
- `issue_certificates` — Issue 3D digital certificates to recipients
- `get_engagement_funnel` — Get funnel data per event (issued, accepted, viewed, shared)
- `list_recipients` — List recipients with certificate status
- `export_csv` — Export emission data as CSV

## Setup

Requires a thatsme account with PRO plan or higher. Get your API key at `app.thatsme.com.br/settings/integrations`.

## Usage

```json
{
  "mcpServers": {
    "thatsme": {
      "command": "npx",
      "args": ["-y", "thatsme-mcp-issuer"],
      "env": {
        "THATSME_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Remote (HTTP)

```json
{
  "mcpServers": {
    "thatsme": {
      "url": "https://mcp.thatsme.com.br/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```
