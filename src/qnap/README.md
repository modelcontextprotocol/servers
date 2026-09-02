# QNAP MCP Server

An MCP server implementation for QNAP NAS devices, providing tools to monitor system status, manage files, and generate reports.

## Tools

- `qnap-connect`: Connect to a QNAP NAS and obtain a session ID.
  - `host`: The QNAP NAS URL (e.g., `http://10.1.1.241:8080`).
  - `username`: Your admin username.
  - `password`: Your admin password.
- `qnap-report`: Generate a comprehensive **Markdown system report** including CPU, memory, powered by `toon` tables for disks and volumes. Perfect for both human reading and AI analysis.
- `qnap-dir`: List the contents of a directory in a **professional tabular format**, automatically sorted by modification date.
  - `path`: The path to list (e.g., `/Public`).
- `qnap-file-info`: Get detailed information about a specific file.
  - `path`: The directory path.
  - `filename`: The name of the file.

## Resources

The server exposes QNAP system components as MCP Resources, providing structured JSON data for monitoring:

- **Disks**: `qnap://[host]:[port]/disk/[disk-id]`
  - Real-time disk health, model, serial, and temperature.
- **Volumes**: `qnap://[host]:[port]/volume/[volume-id]`
  - Detailed storage usage, capacity, and volume names.

These resources allow AI models to monitor NAS health and storage levels without manually calling reporting tools.

## Configuration

### Environment Variables

The server can use environment variables and startup arguments for automatic connection:

- **`QNAP_USER`**: QNAP admin username.
- **`QNAP_PASSWORD`**: QNAP admin password.

### Startup Arguments

1. **`host`**: (Optional) URL of the QNAP NAS (e.g., `http://10.1.1.241:8080`).

If the host and environment variables are provided, the server will attempt to connect automatically at startup.

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qnap": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-qnap",
        "http://10.1.1.241:8080"
      ],
      "env": {
        "QNAP_USER": "admin",
        "QNAP_PASSWORD": "password"
      }
    }
  }
}
```

using docker image

```json
{
  "mcpServers": {
    "qnap": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "QNAP_USER=admin",
        "-e",
        "QNAP_PASSWORD=password",
        "mochoa/mcp-qnap",
        "http://10.1.1.241:8080"
      ]
    }
  }
}
```

## Development

```bash
cd src/qnap
npm install
npm run build
```


## Demos

See [Demos](https://github.com/marcelo-ochoa/servers/blob/main/src/qnap/Demos.md) for usage examples with Claude Desktop, Gemini CLI, and Antigravity Code Editor.

## Docker

Building the container:

```bash
docker build -t mochoa/mcp-qnap -f src/qnap/Dockerfile .
```

Running the container:

```bash
docker run -i --rm -e QNAP_USER=admin -e QNAP_PASSWORD=password mochoa/mcp-qnap http://10.1.1.241:8080
```

## Change Log

See [Change Log](https://github.com/marcelo-ochoa/servers/blob/main/src/qnap/CHANGELOG.md) for the history of changes.

## 📜 License

This project is licensed under the Apache License, Version 2.0 for new contributions, with existing code under MIT - see the [LICENSE](https://github.com/marcelo-ochoa/servers/blob/main/src/qnap/LICENSE) file for details.
