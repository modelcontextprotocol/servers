# EverArt MCP Server

Image generation server for Claude Desktop using EverArt's API.

## Install

```bash
npm install
export EVERART_API_KEY=your_key_here
```

## Config

### Usage with Claude Desktop

Add to Claude Desktop config:

#### Docker

```json
{
  "mcpServers": {
    "everart": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "EVERART_API_KEY", "mcp/everart"],
      "env": {
        "EVERART_API_KEY": "your_key_here"
      }
    }
  }
}
```

#### NPX

```json
{
  "mcpServers": {
    "everart": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everart"],
      "env": {
        "EVERART_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Usage with VS Code

For quick installation, use the one-click installation buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everart&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22everart_api_key%22%2C%22description%22%3A%22EverArt%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everart%22%5D%2C%22env%22%3A%7B%22EVERART_API_KEY%22%3A%22%24%7Binput%3Aeverart_api_key%7D%22%7D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everart&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22everart_api_key%22%2C%22description%22%3A%22EverArt%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everart%22%5D%2C%22env%22%3A%7B%22EVERART_API_KEY%22%3A%22%24%7Binput%3Aeverart_api_key%7D%22%7D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everart&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22everart_api_key%22%2C%22description%22%3A%22EverArt%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverart%22%5D%2C%22env%22%3A%7B%22EVERART_API_KEY%22%3A%22%24%7Binput%3Aeverart_api_key%7D%22%7D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everart&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22everart_api_key%22%2C%22description%22%3A%22EverArt%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverart%22%5D%2C%22env%22%3A%7B%22EVERART_API_KEY%22%3A%22%24%7Binput%3Aeverart_api_key%7D%22%7D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is needed when using the `mcp.json` file.

#### Docker

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "everart_api_key",
        "description": "EverArt API Key",
        "password": true
      }
    ],
    "servers": {
      "everart": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "EVERART_API_KEY", "mcp/everart"],
        "env": {
          "EVERART_API_KEY": "${input:everart_api_key}"
        }
      }
    }
  }
}
```

#### NPX

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "everart_api_key",
        "description": "EverArt API Key",
        "password": true
      }
    ],
    "servers": {
      "everart": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-everart"],
        "env": {
          "EVERART_API_KEY": "${input:everart_api_key}"
        }
      }
    }
  }
}
```

## Tools

### generate_image

Generates images with multiple model options. Opens result in browser and returns URL.

Parameters:

```typescript
{
  prompt: string,       // Image description
  model?: string,       // Model ID (default: "207910310772879360")
  image_count?: number  // Number of images (default: 1)
}
```

Models:

- 5000: FLUX1.1 (standard)
- 9000: FLUX1.1-ultra
- 6000: SD3.5
- 7000: Recraft-Real
- 8000: Recraft-Vector

All images generated at 1024x1024.

Sample usage:

```javascript
const result = await client.callTool({
  name: "generate_image",
  arguments: {
    prompt: "A cat sitting elegantly",
    model: "7000",
    image_count: 1
  }
});
```

Response format:

```
Image generated successfully!
The image has been opened in your default browser.

Generation details:
- Model: 7000
- Prompt: "A cat sitting elegantly"
- Image URL: https://storage.googleapis.com/... 

You can also click the URL above to view the image again.
```

## Building w/ Docker

```sh
docker build -t mcp/everart -f src/everart/Dockerfile .
```
