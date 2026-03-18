#!/usr/bin/env node

import { authenticate } from "@google-cloud/local-auth";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from 'url';

const drive = google.drive("v3");

// Resource handlers call drive.files.list() on every resources/list request,
// which some MCP clients invoke during initialization.  Set this env var to
// "true" to expose Drive files as MCP resources; leave unset for tools-only
// mode (search + download), which is compatible with all MCP clients.
const enableResources = process.env.GDRIVE_ENABLE_RESOURCES === "true";

const server = new Server(
  {
    name: "example-servers/gdrive",
    version: "0.1.0",
  },
  {
    capabilities: {
      ...(enableResources ? { resources: {} } : {}),
      tools: {},
    },
  },
);

if (enableResources) {
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const pageSize = 10;
    const params: any = {
      pageSize,
      fields: "nextPageToken, files(id, name, mimeType)",
    };

    if (request.params?.cursor) {
      params.pageToken = request.params.cursor;
    }

    const res = await drive.files.list(params);
    const files = res.data.files!;

    return {
      resources: files.map((file) => ({
        uri: `gdrive:///${file.id}`,
        mimeType: file.mimeType,
        name: file.name,
      })),
      nextCursor: res.data.nextPageToken,
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const fileId = request.params.uri.replace("gdrive:///", "");

    // First get file metadata to check mime type
    const file = await drive.files.get({
      fileId,
      fields: "mimeType",
    });

    // For Google Docs/Sheets/etc we need to export
    if (file.data.mimeType?.startsWith("application/vnd.google-apps")) {
      let exportMimeType: string;
      switch (file.data.mimeType) {
        case "application/vnd.google-apps.document":
          exportMimeType = "text/markdown";
          break;
        case "application/vnd.google-apps.spreadsheet":
          exportMimeType = "text/csv";
          break;
        case "application/vnd.google-apps.presentation":
          exportMimeType = "text/plain";
          break;
        case "application/vnd.google-apps.drawing":
          exportMimeType = "image/png";
          break;
        default:
          exportMimeType = "text/plain";
      }

      const res = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: "text" },
      );

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: exportMimeType,
            text: res.data,
          },
        ],
      };
    }

    // For regular files download content
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const mimeType = file.data.mimeType || "application/octet-stream";
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: mimeType,
            text: Buffer.from(res.data as ArrayBuffer).toString("utf-8"),
          },
        ],
      };
    } else {
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: mimeType,
            blob: Buffer.from(res.data as ArrayBuffer).toString("base64"),
          },
        ],
      };
    }
  });
}

const DOWNLOAD_DIR = process.env.GDRIVE_DOWNLOAD_DIR || "/tmp/gdrive-downloads";

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search for files in Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "download",
        description:
          "Download a file from Google Drive to a local temp path. Returns the local file path so the client can read it with native tools. For Google Docs/Sheets/Presentations, exports to markdown/csv/text.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: {
              type: "string",
              description: "The Google Drive file ID (from search results)",
            },
          },
          required: ["fileId"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search") {
    const userQuery = request.params.arguments?.query as string;
    const escapedQuery = userQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const formattedQuery = `fullText contains '${escapedQuery}'`;

    const res = await drive.files.list({
      q: formattedQuery,
      pageSize: 10,
      fields: "files(id, name, mimeType, modifiedTime, size)",
    });

    const fileList = res.data.files
      ?.map((file: any) => `${file.name} (${file.mimeType}) [id:${file.id}]`)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Found ${res.data.files?.length ?? 0} files:\n${fileList}`,
        },
      ],
      isError: false,
    };
  }
  if (request.params.name === "download") {
    const fileId = request.params.arguments?.fileId as string;
    if (!fileId) {
      return {
        content: [{ type: "text", text: "Error: fileId is required" }],
        isError: true,
      };
    }

    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    const file = await drive.files.get({ fileId, fields: "name, mimeType" });
    const fileName = (file.data.name || "unnamed").replace(
      /[/\\:*?"<>|\u00A0\u202F\u2000-\u200A\u2028\u2029\u205F\u3000\uFEFF]/g,
      "_",
    );
    const mimeType = file.data.mimeType;

    let localPath: string;
    if (mimeType?.startsWith("application/vnd.google-apps")) {
      let exportMimeType: string;
      let ext: string;
      switch (mimeType) {
        case "application/vnd.google-apps.document":
          exportMimeType = "text/markdown";
          ext = ".md";
          break;
        case "application/vnd.google-apps.spreadsheet":
          exportMimeType = "text/csv";
          ext = ".csv";
          break;
        case "application/vnd.google-apps.presentation":
          exportMimeType = "text/plain";
          ext = ".txt";
          break;
        case "application/vnd.google-apps.drawing":
          exportMimeType = "image/png";
          ext = ".png";
          break;
        default:
          exportMimeType = "text/plain";
          ext = ".txt";
      }
      const res = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: "arraybuffer" },
      );
      localPath = path.join(DOWNLOAD_DIR, `${fileName}${ext}`);
      fs.writeFileSync(localPath, Buffer.from(res.data as ArrayBuffer));
    } else {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" },
      );
      localPath = path.join(DOWNLOAD_DIR, fileName);
      fs.writeFileSync(localPath, Buffer.from(res.data as ArrayBuffer));
    }

    const stats = fs.statSync(localPath);
    return {
      content: [
        {
          type: "text",
          text: `Downloaded to: ${localPath}\nSize: ${stats.size} bytes\nMIME type: ${mimeType}`,
        },
      ],
      isError: false,
    };
  }

  throw new Error("Tool not found");
});

const credentialsPath = process.env.GDRIVE_CREDENTIALS_PATH || path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.gdrive-server-credentials.json",
);

async function authenticateAndSaveCredentials() {
  console.log("Launching auth flow…");
  const auth = await authenticate({
    keyfilePath: process.env.GDRIVE_OAUTH_PATH || path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../gcp-oauth.keys.json",
    ),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  fs.writeFileSync(credentialsPath, JSON.stringify(auth.credentials));
  console.log("Credentials saved. You can now run the server.");
}

async function loadCredentialsAndRunServer() {
  if (!fs.existsSync(credentialsPath)) {
    console.error(
      "Credentials not found. Please run with 'auth' argument first.",
    );
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));

  // Load client_id and client_secret from OAuth keys so the client can
  // auto-refresh expired access tokens using the refresh_token.
  const oauthKeysPath = process.env.GDRIVE_OAUTH_PATH || path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../gcp-oauth.keys.json",
  );
  const oauthKeys = JSON.parse(fs.readFileSync(oauthKeysPath, "utf-8"));
  const keyData = oauthKeys.installed || oauthKeys.web;

  const auth = new google.auth.OAuth2(
    keyData.client_id,
    keyData.client_secret,
    keyData.redirect_uris?.[0],
  );
  auth.setCredentials(credentials);
  google.options({ auth });

  console.error("Credentials loaded. Starting server.");
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[2] === "auth") {
  authenticateAndSaveCredentials().catch(console.error);
} else {
  loadCredentialsAndRunServer().catch(console.error);
}
