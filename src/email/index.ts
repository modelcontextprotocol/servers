#!/usr/bin/env node
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as readline from "readline";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

async function authorize(): Promise<OAuth2Client> {
  const credentials = JSON.parse(fs.readFileSync("credentials.json", "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = process.env.GOOGLE_OAUTH_TOKEN;
  if (token) {
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } else {
    return getNewToken(oAuth2Client);
  }
}

async function getNewToken(oAuth2Client: OAuth2Client): Promise<OAuth2Client> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this URL:", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise<string>((resolve) => {
    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();
      resolve(code);
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  console.log(
    "\nToken generated! Add this to your environment variables:\n" +
      `export GOOGLE_OAUTH_TOKEN='${JSON.stringify(tokens)}'`
  );
  return oAuth2Client;
}

async function fetchEmails(auth: OAuth2Client, count: number = 10) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: count,
  });
  const messages = res.data.messages || [];
  const emailDetails = await Promise.all(
    messages.map(async (message) => {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
      });
      return {
        id: msg.data.id,
        snippet: msg.data.snippet,
        subject:
          msg.data.payload?.headers?.find((h) => h.name === "Subject")?.value ||
          "No Subject",
      };
    })
  );
  return emailDetails
    .map(
      (email) =>
        `Subject: ${email.subject}\nSnippet: ${email.snippet}\nID: ${email.id}`
    )
    .join("\n\n");
}

// MCP Server tanımı
const server = new Server(
  {
    name: "community/mcp-email-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool listesi
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fetch_emails",
      description:
        "Fetches recent emails from Gmail using the Gmail API. " +
        "Returns a list of emails with subject, snippet, and message ID.",
      inputSchema: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "Number of emails to fetch (default: 10, max: 50)",
            default: 10,
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "fetch_emails") {
    try {
      const { count = 10 } =
        (request.params.arguments as { count?: number }) || {};
      const auth = await authorize();
      const emails = await fetchEmails(auth, Math.min(count, 50));
      return {
        content: [{ type: "text", text: emails || "No emails found" }],
        isError: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Email MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
