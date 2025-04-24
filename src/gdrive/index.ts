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
import { extractFileId } from './extractFileId.js';
import { getDocumentContent, DocumentData, getDocument } from './getDocumentContent.js';
import { saveDocument } from './saveDocument.js';
import 'dotenv/config';

const drive = google.drive("v3");

// Cache to store document content for chat interactions
const documentCache = new Map();

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
  const fileId = extractFileId(request.params.uri.replace("gdrive:///", ""));

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
        name: "search",
        description: "Use this tool just when the document is not in saved previously in memory with the named using underscore. Search for files in Google Drive. This tool is useful for finding documents by name or content. Just when the document is not in saved previously",
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
        name: "get_document_content",
        description: "Use this tool just when the document is not in saved previously in memory with the named using underscore. Get the full content of a Google Docs document. This tool is useful for getting the content of a document that is not in saved previously",
        inputSchema: {
          type: "object",
          properties: {
            document_id: {
              type: "string",
              description: "Document ID, URL, or URI (gdrive:///{id})",
            },
          },
          required: ["document_id"],
        },
      },
      {
        name: "chat_with_document",
        description: "Use this tool just when the document is not in saved previously in memory with the named using underscore. Ask a question about a Google Docs document's content. This tool is useful for getting the content of a document that is not in saved previously",
        inputSchema: {
          type: "object",
          properties: {
            document_id: {
              type: "string",
              description: "Document ID, URL, or URI (gdrive:///{id})",
            },
            question: {
              type: "string",
              description: "Question about the document content",
            },
          },
          required: ["document_id", "question"],
        },
      },
      {
        name: "save_document",
        description: "Use this tool just when the document is not in saved previously in memory with the named using underscore. Save a Google Docs document as Markdown file for use as reference. This tool is useful for saving documents that are not in saved previously",
        inputSchema: {
          type: "object",
          properties: {
            document_id: {
              type: "string",
              description: "Document ID, URL, or URI (gdrive:///{id})",
            },
            output_dir: {
              type: "string",
              description: "Optional directory to save the file (defaults to ./saved_documents)",
            },
          },
          required: ["document_id"],
        },
      },
    ],
  };
});

// Helper function to fetch document content
// (moved to getDocumentContent.ts)

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search") {
    const userQuery = request.params.arguments?.query as string;
    const escapedQuery = userQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `fullText contains '${escapedQuery}'`,
      pageSize: 10,
      fields: "files(id, name, mimeType)",
    });

    const fileList = (res.data.files || [])
      .map(
        (file) =>
          `${file.name} (${file.mimeType}) - ID: ${file.id}`,
      )
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
  else if (request.params.name === "get_document_content") {
    try {
      const documentId = request.params.arguments?.document_id as string;
      const documentData = await getDocumentContent(documentId);
      
      return {
        content: [
          {
            type: "text",
            text: documentData.content,
          },
        ],
        isError: false,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
  else if (request.params.name === "chat_with_document") {
    try {
      const documentId = request.params.arguments?.document_id as string;
      const question = request.params.arguments?.question as string;
      
      const documentData = await getDocumentContent(documentId);
      // const documentData = await getDocument(google, documentId);
      
      // Here we would normally call an LLM to answer questions about the document
      // Since we don't have direct LLM access, we'll provide the content and question
      return {
        content: [
          {
            type: "text",
            // text: `Question: ${question}\n\nDocument: ${documentData.name}\n\nContent for reference:\n${documentData.content.substring(0, 500)}...\n\nPlease ask the assistant to answer this question based on the document content.`,
            text: `Question: ${question}

            Document: ${documentData.name}
            
            Content for reference:
            ${documentData.content}

            El contenido de cada misión será lo que encuentres entre un "Misión: [Nombre de la misión]" y otro "Misión: [Nombre de la siguiente misión]".
            
            Please ask the assistant to answer this question based on the document content and add to the answer the amount of characters used for your final answer.`,
          },
        ],
        isError: false,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
  else if (request.params.name === "save_document") {
    try {
      const documentId = request.params.arguments?.document_id as string;
      const outputDir = request.params.arguments?.output_dir as string | undefined;
      
      const result = await saveDocument(documentId, outputDir);
      
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `✅ ${result.message}\n\nDocument "${result.documentName}" saved to: ${result.filePath}\n\nYou can now use this file as reference context in Cascade.`,
            },
          ],
          isError: false,
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${result.message}`,
            },
          ],
          isError: true,
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  throw new Error("Tool not found");
});

const credentialsPath = process.env.GDRIVE_CREDENTIALS_PATH || path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".gdrive-server-credentials.json",
);

async function authenticateAndSaveCredentials() {
  console.log("Launching auth flow…");
  const auth = await authenticate({
    keyfilePath: process.env.GDRIVE_OAUTH_PATH || path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "gcp-oauth.keys.json",
    ),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  fs.writeFileSync(credentialsPath, JSON.stringify(auth.credentials));
  console.log("Credentials saved. You can now run the server.");
}

async function loadCredentialsAndRunServer() {
  // console.log("Loading credentials…", process.env.GDRIVE_OAUTH_PATH);
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


// npx run dist/index.js
// npx -y @modelcontextprotocol/inspector npx -y tsx index.ts
// npm run build  
// node ./dist auth


// "<truncated 16540 bytes>", "<truncated 16603 bytes>",
// Estoy recibiendo aproximadamente entre 4,000 y 5,000 bytes de contenido antes del truncamiento.

// dime del documento track multicomprobantes en la misión plantillas de documentos, sección tecnica plantillas, cual es el problema del resumen ejecutivo?

// dime del documento track multicomprobantes en la misión plantillas de documentos, sección casos de prueba, cual es el objetivo?

// 
// Busca y responde en español lo siguiente:
// En el documento de google docs llamado track multicomprobantes, busca  en la misión llamada plantillas de documentos, busca el contenido relacionaod a propósito de la plantilla técnica

// puedes buscar el documento track multicomprobantes y decirme el problema mencionado en el resumen ejecutivo de la misión llamada "Ajuste en Plantillas de documentos"?


// listame los requisito de la solución en la misión Ajuste en Plantillas de documentos
