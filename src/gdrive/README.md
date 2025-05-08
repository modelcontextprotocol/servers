# Google Drive server

This MCP server integrates with Google Drive to allow listing, reading, and searching over files.

## Components

### Tools

- **search**
  - Search for files in Google Drive
  - Input: `query` (string): Search query
  - Returns file names and MIME types of matching files

### Resources

The server provides access to Google Drive files:

- **Files** (`gdrive:///<file_id>`)
  - Supports all file types
  - Google Workspace files are automatically exported:
    - Docs → Markdown
    - Sheets → CSV
    - Presentations → Plain text
    - Drawings → PNG
  - Other files are provided in their native format

## Getting started

1. [Create a new Google Cloud project](https://console.cloud.google.com/projectcreate)
2. [Enable the Google Drive API](https://console.cloud.google.com/workspace-api/products)
3. [Configure an OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) ("internal" is fine for testing)
4. Add OAuth scope `https://www.googleapis.com/auth/drive.readonly`
5. [Create an OAuth Client ID](https://console.cloud.google.com/apis/credentials/oauthclient) for application type "Desktop App"
6. Download the JSON file of your client's OAuth keys
7. Rename the key file to `gcp-oauth.keys.json` and place into the root of this repo (i.e. `servers/gcp-oauth.keys.json`)

Make sure to build the server with either `npm run build` or `npm run watch`.

### Authentication

To authenticate and save credentials:

1. Run the server with the `auth` argument: `node ./dist auth`
2. This will open an authentication flow in your system browser
3. Complete the authentication process
4. Credentials will be saved in the root of this repo (i.e. `servers/.gdrive-server-credentials.json`)

### Usage with Desktop App

To integrate this server with the desktop app, add the following to your app's server configuration:

#### Docker

Authentication:

Assuming you have completed setting up the OAuth application on Google Cloud, you can now auth the server with the following command, replacing `/path/to/gcp-oauth.keys.json` with the path to your OAuth keys file:

```bash
docker run -i --rm --mount type=bind,source=/path/to/gcp-oauth.keys.json,target=/gcp-oauth.keys.json -v mcp-gdrive:/gdrive-server -e GDRIVE_OAUTH_PATH=/gcp-oauth.keys.json -e "GDRIVE_CREDENTIALS_PATH=/gdrive-server/credentials.json" -p 3000:3000 mcp/gdrive auth
```

The command will print the URL to open in your browser. Open this URL in your browser and complete the authentication process. The credentials will be saved in the `mcp-gdrive` volume.

Once authenticated, you can use the server in your app's server configuration:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "mcp-gdrive:/gdrive-server", "-e", "GDRIVE_CREDENTIALS_PATH=/gdrive-server/credentials.json", "mcp/gdrive"]
    }
  }
}
```

#### NPX

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-gdrive"
      ],
      "env": {
        "GDRIVE_CREDENTIALS_PATH": "/path/to/.gdrive-server-credentials.json"
      }
    }
  }
}
```

### Usage with VS Code

For quick installation, use one of the one-click install buttons below..

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=gdrive&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22credentials_path%22%2C%22description%22%3A%22Path%20to%20.gdrive-server-credentials.json%20file%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-gdrive%22%5D%2C%22env%22%3A%7B%22GDRIVE_CREDENTIALS_PATH%22%3A%22%24%7Binput%3Acredentials_path%7D%22%7D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=gdrive&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22credentials_path%22%2C%22description%22%3A%22Path%20to%20.gdrive-server-credentials.json%20file%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-gdrive%22%5D%2C%22env%22%3A%7B%22GDRIVE_CREDENTIALS_PATH%22%3A%22%24%7Binput%3Acredentials_path%7D%22%7D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=gdrive&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-v%22%2C%22mcp-gdrive%3A%2Fgdrive-server%22%2C%22-e%22%2C%22GDRIVE_CREDENTIALS_PATH%3D%2Fgdrive-server%2Fcredentials.json%22%2C%22mcp%2Fgdrive%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=gdrive&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-v%22%2C%22mcp-gdrive%3A%2Fgdrive-server%22%2C%22-e%22%2C%22GDRIVE_CREDENTIALS_PATH%3D%2Fgdrive-server%2Fcredentials.json%22%2C%22mcp%2Fgdrive%22%5D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

#### NPX

```json
{
  "mcp": {
    "servers": {
      "gdrive": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-gdrive"
        ],
        "env": {
          "GDRIVE_CREDENTIALS_PATH": "/path/to/.gdrive-server-credentials.json"
        }
      }
    }
  }
}
```

#### Docker

```json
{
  "mcp": {
    "servers": {
      "gdrive": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "--rm",
          "-v",
          "mcp-gdrive:/gdrive-server",
          "-e",
          "GDRIVE_CREDENTIALS_PATH=/gdrive-server/credentials.json",
          "mcp/gdrive"
        ]
      }
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
