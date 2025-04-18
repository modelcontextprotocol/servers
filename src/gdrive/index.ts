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
import dotenv from "dotenv";
dotenv.config();

const drive = google.drive("v3");

const server = new Server(
  {
    name: "example-servers/gdrive",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);


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


server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "gdrive_list_all",
        description: "List all files and folders in Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            cursor: {
              type: "string",
              description: "Cursor for pagination",
            },
          },
          required: [],
        },
      },
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
        name: "gdrive_read_file",
        description: "Read content of a Google Drive file",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "File URI (format: gdrive:///{fileId})",
            },
          },
          required: ["uri"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try{
    if (request.params.name === "gdrive_list_all") {
      const params: any = {
        // pageSize: 10,
        fields: "nextPageToken, files(id, name, mimeType, parents)",//, modifiedTime, driveId, size)",
        supportsAllDrives:true,
        includeItemsFromAllDrives:true,
        corpora: "user", // in case you want to get access to a specific drive, change it to "drive"
        // driveId: "YOUR_DRIVE_ID" // add driveId to fields temporarily, to get the ID of a shared drive, then change corpora to 'drive'
      };
      
      if (request.params.arguments?.cursor) {
        params.pageToken = request.params.arguments.cursor;
      }
      try {
        const res = await drive.files.list(params);
        
        const fileList = res.data.files?.map((file: any) => 
          `File name: ${file.name}\n` +
          `URI: gdrive:///${file.id}\n` +
          `Type: ${file.mimeType}\n` +
          `ParentFolderId: ${file.parents}\n` +
          `Description: ${file.description || 'N/A'}\n` +
          // `Modified: ${file.modifiedTime || 'N/A'}\n` +
          // `DriveID: ${file.driveId || 'N/A'}\n` +
          // `Size: ${file.size || 'N/A'} bytes\n` +
          `-------------------`
        )
        .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${res.data.files?.length ?? 0} files:\n\n${fileList}\n\nIncomplete Search: ${res.data.incompleteSearch ?? 'N/A'}`,
            },
          ],
          nextCursor: res.data.nextPageToken,
          isError: false,
        };
      } catch (apiError: any) {
        // Extract HTTP status code and include it in the response
        const statusCode = apiError.response?.status || "Unknown";
        const statusText = apiError.response?.statusText || "Unknown";

        return {
          content: [
            {
              type: "text",
              text: `Google Drive API error: ${apiError.message}\n\n` +
                `HTTP Status: ${statusCode} (${statusText})\n\n` +
                `Error details: ${JSON.stringify(apiError.response?.data, null, 2)}\n\n` +
                `Request sent: ${JSON.stringify(request, null, 2)}`,
            },
          ],
          isError: true,
        };
      }
    }
    else if (request.params.name === "search") {
      const userQuery = request.params.arguments?.query as string;
      if (!userQuery) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Missing required 'query' parameter. Received request: ${JSON.stringify(request, null, 2)}`,
            },
          ],
          isError: true,
        };
      }

      const escapedQuery = userQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const formattedQuery = `fullText contains '${escapedQuery}'`;

      const params: any = {
        q: formattedQuery,
        fields: "nextPageToken, files(id, name, mimeType, parents)",//, modifiedTime, driveId, size)",
        supportsAllDrives:true,
        includeItemsFromAllDrives:true,
        corpora: "user", // in case you want to get access to a specific drive, change it to "drive"
        // driveId: "YOUR_DRIVE_ID" // add driveId to fields temporarily, to get the ID of a shared drive, then change corpora to 'drive'
      };

      try {
        const res = await drive.files.list(params);

        const fileList = res.data.files?.map((file: any) => 
          `File name: ${file.name}\n` +
          `URI: gdrive:///${file.id}\n` +
          `Type: ${file.mimeType}\n` +
          `ParentFolderId: ${file.parents}\n` +
          `Description: ${file.description || 'N/A'}\n` +
          // `Modified: ${file.modifiedTime || 'N/A'}\n` +
          // `DriveID: ${file.driveId || 'N/A'}\n` +
          // `Size: ${file.size || 'N/A'} bytes\n` +
          `-------------------`
        )
        .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${res.data.files?.length ?? 0} files:\n\n${fileList}\n\nIncomplete Search: ${res.data.incompleteSearch ?? 'No'}`,
            },
          ],
          isError: false,
        };
      } catch (apiError: any) {
        // Extract HTTP status code and include it in the response
        const statusCode = apiError.response?.status || "Unknown";
        const statusText = apiError.response?.statusText || "Unknown";

        return {
          content: [
            {
              type: "text",
              text: `Google Drive API error: ${apiError.message}\n\n` +
                `HTTP Status: ${statusCode} (${statusText})\n\n` +
                `Error details: ${JSON.stringify(apiError.response?.data, null, 2)}\n\n` +
                `Request sent: ${JSON.stringify(request, null, 2)}`,
            },
          ],
          isError: true,
        };
      }
    }
    else if (request.params.name === "gdrive_read_file") {
      const uri = request.params.arguments?.uri as string;
      if (!uri || !uri.startsWith("gdrive:///")) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Invalid file URI format, should be gdrive:///{fileId}. Received request: ${JSON.stringify(request, null, 2)}`,
            },
          ],
          isError: true,
        };
      }

      const fileId = uri.replace("gdrive:///", "");

      try {
        // Get file metadata to check MIME type
        const file = await drive.files.get({
          fileId,
          fields: "name,mimeType",
          supportsAllDrives:true
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
            content: [
              {
                type: "text",
                text: `File name: ${file.data.name}\nType: ${file.data.mimeType}\nExport format: ${exportMimeType}\n\nContent:\n${res.data}`,
              },
            ],
            isError: false,
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
            content: [
              {
                type: "text",
                text: `File name: ${file.data.name}\nType: ${mimeType}\n\nContent:\n${Buffer.from(res.data as ArrayBuffer).toString("utf-8")}`,
              },
            ],
            isError: false,
          };
        }
        else {
          // Convert ArrayBuffer to Buffer
          const buffer = Buffer.from(res.data as ArrayBuffer);

          // Get the output directory from the environment variable
          const outputDirectory = process.env.GDRIVE_DOWNLOAD_DIRECTORY || "/default/output/directory";
          // // Ensure the directory exists
          // if (!fs.existsSync(outputDirectory)) {
          //   fs.mkdirSync(outputDirectory, { recursive: true });
          // }

          // Specify the path where the file should be saved
          const filePath = path.join(outputDirectory, `${file.data.name}`);

          // Write the file to the specified path
          fs.writeFileSync(filePath, buffer);
          return {
            content: [
              {
                type: "text",
                text: `File name: ${file.data.name}\nType: ${mimeType}\n\nFile saved to: ${filePath}`,
              },
            ],
            isError: false,
          };
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading file: ${error.message}. Received request: ${JSON.stringify(request, null, 2)}`,
            },
          ],
          isError: true,
        };
      }
    }
    throw new Error(`Tool '${request.params.name}' not found. Received request: ${JSON.stringify(request, null, 2)}`);
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Unexpected error: ${error.message}. Received request: ${JSON.stringify(request, null, 2)}`,
        },
      ],
      isError: true,
    };
  }
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
  const auth = new google.auth.OAuth2();
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
