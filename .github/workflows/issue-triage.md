---
on:
  issues:
    types: [opened, reopened]
engine: copilot
permissions:
  contents: read
  copilot-requests: write
safe-outputs:
  add-labels:
    allowed: [new-server-request]
    max: 1
  add-comment:
    max: 1
  close-issue:
---

# New-server request triage

Read the triggering issue (title and body).

Decide whether this issue is a request to add a new MCP server to this repository or to a server list. This includes: "please add my server", requests to list or register a server, submissions of new server implementations, or announcements of a server the author wants included here.

Context: this repository contains only a small set of reference servers. Per CONTRIBUTING.md, new server implementations are not accepted here. The community server list was retired from the README in favor of the MCP Server Registry (https://registry.modelcontextprotocol.io/).

Rules:

- Only act if you have HIGH confidence the issue is a new-server request. If you have any doubt — for example the issue could be a bug report, a feature request for one of the existing servers (everything, fetch, filesystem, git, memory, sequentialthinking, time), a documentation issue, or a question — do nothing.
- If you are confident it is a new-server request:
  1. Add the `new-server-request` label.
  2. Post one concise comment (plain tone, no emojis) that: thanks the author; explains that this repository no longer accepts new server implementations, linking to CONTRIBUTING.md; and directs them to publish to the MCP Server Registry (https://github.com/modelcontextprotocol/registry), linking the quickstart guide (https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx) and the browsable registry (https://registry.modelcontextprotocol.io/). End by noting that a maintainer can reopen the issue if it was closed in error.
  3. Close the issue as "not planned".
- Never close an issue you are not certain about. When uncertain, take no action at all.
