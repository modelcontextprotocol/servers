#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";

// AWS client initialization
const clientConfig: Record<string, any> = {
  region: process.env.AWS_REGION,
};

// Only add explicit credentials if access keys are provided
// Otherwise use the default credential provider chain (supports SSO)
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };

  // Add session token if provided (for temporary credentials)
  if (process.env.AWS_SESSION_TOKEN) {
    clientConfig.credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
  }
}

const bedrockClient = new BedrockAgentRuntimeClient(clientConfig);

// Get configured knowledgebase IDs from environment variable
const configuredKnowledgeBaseIds = process.env.AWS_KB_IDS ?
  JSON.parse(process.env.AWS_KB_IDS) :
  [];

interface RAGSource {
  id: string;
  fileName: string;
  snippet: string;
  score: number;
}

async function retrieveContext(
  query: string,
  knowledgeBaseId: string,
  n: number = 3
): Promise<{
  context: string;
  isRagWorking: boolean;
  ragSources: RAGSource[];
}> {
  try {
    if (!knowledgeBaseId) {
      console.error("knowledgeBaseId is not provided");
      return {
        context: "",
        isRagWorking: false,
        ragSources: [],
      };
    }

    const input: RetrieveCommandInput = {
      knowledgeBaseId: knowledgeBaseId,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: n },
      },
    };

    const command = new RetrieveCommand(input);
    const response = await bedrockClient.send(command);
    const rawResults = response?.retrievalResults || [];
    const ragSources: RAGSource[] = rawResults
      .filter((res) => res?.content?.text)
      .map((result, index) => {
        const uri = result?.location?.s3Location?.uri || "";
        const fileName = uri.split("/").pop() || `Source-${index}.txt`;
        return {
          id: (result.metadata?.["x-amz-bedrock-kb-chunk-id"] as string) || `chunk-${index}`,
          fileName: fileName.replace(/_/g, " ").replace(".txt", ""),
          snippet: result.content?.text || "",
          score: (result.score as number) || 0,
        };
      })
      .slice(0, 3);

    const context = rawResults
      .filter((res): res is { content: { text: string } } => res?.content?.text !== undefined)
      .map(res => res.content.text)
      .join("\n\n");

    return {
      context,
      isRagWorking: true,
      ragSources,
    };
  } catch (error) {
    console.error("RAG Error:", error);
    return { context: "", isRagWorking: false, ragSources: [] };
  }
}

// Define the retrieval tool
const RETRIEVAL_TOOL: Tool = {
  name: "retrieve_from_aws_kb",
  description: "Performs retrieval from the AWS Knowledge Base using the provided query and Knowledge Base ID.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The query to perform retrieval on" },
      knowledgeBaseId: {
        type: "string",
        description: configuredKnowledgeBaseIds.length > 0
          ? "The ID of the AWS Knowledge Base (optional if configured via AWS_KB_IDS)"
          : "The ID of the AWS Knowledge Base"
      },
      n: { type: "number", default: 3, description: "Number of results to retrieve" },
    },
    required: configuredKnowledgeBaseIds.length > 0 ? ["query"] : ["query", "knowledgeBaseId"],
  },
};

// Server setup
const server = new Server(
  {
    name: "aws-kb-retrieval-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [RETRIEVAL_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "retrieve_from_aws_kb") {
    const { query, knowledgeBaseId, n = 3 } = args as Record<string, any>;

    // Determine which knowledge base ID to use
    let actualKnowledgeBaseId = knowledgeBaseId;

    // If no ID provided but we have configured IDs, use the first one
    if (!actualKnowledgeBaseId && configuredKnowledgeBaseIds.length > 0) {
      actualKnowledgeBaseId = configuredKnowledgeBaseIds[0];
      console.error(`Using configured knowledge base ID: ${actualKnowledgeBaseId}`);
    }

    // If still no ID available, return an error
    if (!actualKnowledgeBaseId) {
      return {
        content: [{
          type: "text",
          text: "No knowledge base ID provided. Either include a knowledgeBaseId in your request or configure AWS_KB_IDS in the environment."
        }],
        isError: true,
      };
    }

    try {
      const result = await retrieveContext(query, actualKnowledgeBaseId, n);
      if (result.isRagWorking) {
        // Format RAG sources for readability
        const formattedSources = result.ragSources.map((source, index) => {
          return `Source ${index + 1}: ${source.fileName} (score: ${source.score.toFixed(3)})\n${source.snippet}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: "text",
              text: result.context
            },
            {
              type: "json",
              json: {
                ragSources: result.ragSources
              }
            }
          ],
        };
      } else {
        return {
          content: [{ type: "text", text: "Retrieval failed or returned no results." }],
        };
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error occurred: ${error}` }],
      };
    }
  } else {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
});

// Server startup
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AWS KB Retrieval Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
