import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  CallToolRequestSchema,
  ClientCapabilities,
  CompleteRequestSchema,
  CreateMessageRequest,
  CreateMessageResultSchema,
  ElicitResultSchema,
  GetPromptRequestSchema,
  LoggingLevel,
  Resource,
  RootsListChangedNotificationSchema,
  ServerNotification,
  ServerRequest,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  type Root
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import JSZip from "jszip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const instructions = readFileSync(join(__dirname, "instructions.md"), "utf-8");

type SendRequest = RequestHandlerExtra<ServerRequest, ServerNotification>["sendRequest"];

/* Input schemas for tools implemented in this server */
const EchoSchema = z.object({
  message: z.string().describe("Message to echo"),
});

const AddSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

const LongRunningOperationSchema = z.object({
  duration: z
    .number()
    .default(10)
    .describe("Duration of the operation in seconds"),
  steps: z
    .number()
    .default(5)
    .describe("Number of steps in the operation"),
});

const PrintEnvSchema = z.object({});

const SampleLLMSchema = z.object({
  prompt: z.string().describe("The prompt to send to the LLM"),
  maxTokens: z
    .number()
    .default(100)
    .describe("Maximum number of tokens to generate"),
});

const GetTinyImageSchema = z.object({});

const AnnotatedMessageSchema = z.object({
  messageType: z
    .enum(["error", "success", "debug"])
    .describe("Type of message to demonstrate different annotation patterns"),
  includeImage: z
    .boolean()
    .default(false)
    .describe("Whether to include an example image"),
});

const GetResourceReferenceSchema = z.object({
  resourceId: z
    .number()
    .min(1)
    .max(100)
    .describe("ID of the resource to reference (1-100)"),
});

const ElicitationSchema = z.object({});

const GetResourceLinksSchema = z.object({
  count: z
    .number()
    .min(1)
    .max(10)
    .default(3)
    .describe("Number of resource links to return (1-10)"),
});

const ListRootsSchema = z.object({});

const StructuredContentSchema = {
  input: z.object({
    location: z
      .string()
      .trim()
      .min(1)
      .describe("City name or zip code"),
  }),

  output: z.object({
    temperature: z
      .number()
      .describe("Temperature in celsius"),
    conditions: z
      .string()
      .describe("Weather conditions description"),
    humidity: z
      .number()
      .describe("Humidity percentage"),
  })
};

const ZipResourcesInputSchema = z.object({
  files: z.record(z.string().url().describe("URL of the file to include in the zip")).describe("Mapping of file names to URLs to include in the zip"),
});

enum ToolName {
  ECHO = "echo",
  ADD = "add",
  LONG_RUNNING_OPERATION = "longRunningOperation",
  PRINT_ENV = "printEnv",
  SAMPLE_LLM = "sampleLLM",
  GET_TINY_IMAGE = "getTinyImage",
  ANNOTATED_MESSAGE = "annotatedMessage",
  GET_RESOURCE_REFERENCE = "getResourceReference",
  ELICITATION = "startElicitation",
  GET_RESOURCE_LINKS = "getResourceLinks",
  STRUCTURED_CONTENT = "structuredContent",
  ZIP_RESOURCES = "zip",
  LIST_ROOTS = "listRoots"
}

enum PromptName {
  SIMPLE = "simple_prompt",
  COMPLEX = "complex_prompt",
  RESOURCE = "resource_prompt",
}

// Example completion values
const EXAMPLE_COMPLETIONS = {
  style: ["casual", "formal", "technical", "friendly"],
  temperature: ["0", "0.5", "0.7", "1.0"],
  resourceId: ["1", "2", "3", "4", "5"],
};

export const createServer = () => {
  const server = new McpServer(
    {
      name: "example-servers/everything",
      title: "Everything Example Server",
      version: "1.0.0",
    },
    {
      instructions
    }
  );

  let subscriptions: Set<string> = new Set();
  let subsUpdateInterval: NodeJS.Timeout | undefined;
  let stdErrUpdateInterval: NodeJS.Timeout | undefined;

  let logsUpdateInterval: NodeJS.Timeout | undefined;
  // Store client capabilities
  let clientCapabilities: ClientCapabilities | undefined;

  // Roots state management
  let currentRoots: Root[] = [];
  let clientSupportsRoots = false;
  let sessionId: string | undefined;

    // Function to start notification intervals when a client connects
  const startNotificationIntervals = (sid?: string|undefined) => {
      sessionId = sid;
      if (!subsUpdateInterval) {
        subsUpdateInterval = setInterval(() => {
          for (const uri of subscriptions) {
            server.server.notification({
              method: "notifications/resources/updated",
              params: { uri },
            });
          }
        }, 10000);
      }

      const maybeAppendSessionId = sessionId ? ` - SessionId ${sessionId}`: "";
      const messages: { level: LoggingLevel; data: string }[] = [
          { level: "debug", data: `Debug-level message${maybeAppendSessionId}` },
          { level: "info", data: `Info-level message${maybeAppendSessionId}` },
          { level: "notice", data: `Notice-level message${maybeAppendSessionId}` },
          { level: "warning", data: `Warning-level message${maybeAppendSessionId}` },
          { level: "error", data: `Error-level message${maybeAppendSessionId}` },
          { level: "critical", data: `Critical-level message${maybeAppendSessionId}` },
          { level: "alert", data: `Alert level-message${maybeAppendSessionId}` },
          { level: "emergency", data: `Emergency-level message${maybeAppendSessionId}` },
      ];

      if (!logsUpdateInterval) {
          console.error("Starting logs update interval");
          logsUpdateInterval = setInterval(async () => {
          await server.sendLoggingMessage(messages[Math.floor(Math.random() * messages.length)]);
      }, 15000);
    }
  };

  // Helper method to request sampling from client
  const requestSampling = async (
    context: string,
    uri: string,
    maxTokens: number = 100,
    sendRequest: SendRequest
  ) => {
    const request: CreateMessageRequest = {
      method: "sampling/createMessage",
      params: {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Resource ${uri} context: ${context}`,
            },
          },
        ],
        systemPrompt: "You are a helpful test server.",
        maxTokens,
        temperature: 0.7,
        includeContext: "thisServer",
      },
    };

    return await sendRequest(request, CreateMessageResultSchema);

  };

  const ALL_RESOURCES: Resource[] = Array.from({ length: 100 }, (_, i) => {
    const uri = `test://static/resource/${i + 1}`;
    if (i % 2 === 0) {
      return {
        uri,
        name: `Resource ${i + 1}`,
        mimeType: "text/plain",
        text: `Resource ${i + 1}: This is a plaintext resource`,
      };
    } else {
      const buffer = Buffer.from(`Resource ${i + 1}: This is a base64 blob`);
      return {
        uri,
        name: `Resource ${i + 1}`,
        mimeType: "application/octet-stream",
        blob: buffer.toString("base64"),
      };
    }
  });

  // Register all 100 resources individually so they appear in listings
  for (let i = 0; i < ALL_RESOURCES.length; i++) {
    const resource = ALL_RESOURCES[i];
    const resourceId = i + 1;

    server.registerResource(
      `static-resource-${resourceId}`,
      resource.uri,
      {
        name: resource.name,
        description: `Resource ${resourceId}: ${resource.mimeType === "text/plain" ? "plaintext resource" : "binary blob resource"}`,
        mimeType: resource.mimeType,
      },
      async () => {
        // Build the resource contents based on type
        if ('text' in resource && resource.text) {
          return {
            contents: [{
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: resource.text as string,
            }],
          };
        } else if ('blob' in resource && resource.blob) {
          return {
            contents: [{
              uri: resource.uri,
              mimeType: resource.mimeType,
              blob: resource.blob as string,
            }],
          };
        }
        throw new Error(`Resource ${resource.uri} has neither text nor blob`);
      }
    );
  }

  // Also register a template for the same pattern to support dynamic access
  server.registerResource(
    'static-resources-template',
    new ResourceTemplate('test://static/resource/{id}', { list: undefined }),
    {
      description: 'A static test resource with a numeric ID',
    },
    async (uri, variables) => {
      const id = Array.isArray(variables.id) ? variables.id[0] : variables.id;
      const index = parseInt(id, 10) - 1;

      if (index >= 0 && index < ALL_RESOURCES.length) {
        const resource = ALL_RESOURCES[index];
        // Build the resource contents based on type
        if ('text' in resource && resource.text) {
          return {
            contents: [{
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: resource.text as string,
            }],
          };
        } else if ('blob' in resource && resource.blob) {
          return {
            contents: [{
              uri: resource.uri,
              mimeType: resource.mimeType,
              blob: resource.blob as string,
            }],
          };
        }
      }

      throw new Error(`Unknown resource: ${uri.href}`);
    }
  );

  server.server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
    const { uri } = request.params;
    subscriptions.add(uri);
    return {};
  });

  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    subscriptions.delete(request.params.uri);
    return {};
  });

  // Prompts with simple content can use registerPrompt, but those with resource content need setRequestHandler
  // Register simple and complex prompts
  server.registerPrompt(
    PromptName.SIMPLE,
    {
      title: "Simple Prompt",
      description: "A prompt without arguments",
      argsSchema: {}
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "This is a simple prompt without arguments.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    PromptName.COMPLEX,
    {
      title: "Complex Prompt",
      description: "A prompt with arguments",
      argsSchema: {
        temperature: z.string().describe("Temperature setting"),
        style: z.string().optional().describe("Output style"),
      }
    },
    (args) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `This is a complex prompt with arguments: temperature=${args.temperature}, style=${args.style}`,
          },
        },
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: "I understand. You've provided a complex prompt with temperature and style arguments. How would you like me to proceed?",
          },
        },
        {
          role: "user" as const,
          content: {
            type: "image" as const,
            data: MCP_TINY_IMAGE,
            mimeType: "image/png",
          },
        },
      ],
    })
  );

  // Resource prompt must use setRequestHandler for now due to type compatibility issues
  server.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === PromptName.RESOURCE) {
      const resourceId = parseInt(args?.resourceId as string, 10);
      if (isNaN(resourceId) || resourceId < 1 || resourceId > 100) {
        throw new Error(
          `Invalid resourceId: ${args?.resourceId}. Must be a number between 1 and 100.`
        );
      }

      const resourceIndex = resourceId - 1;
      const resource = ALL_RESOURCES[resourceIndex];

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `This prompt includes Resource ${resourceId}. Please analyze the following resource:`,
            },
          },
          {
            role: "user" as const,
            content: {
              type: "resource" as const,
              resource: resource,
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  });

  // Register tools using modern API
  server.registerTool(
    ToolName.ECHO,
    {
      title: "Echo",
      description: "Echoes back the input",
      inputSchema: EchoSchema.shape,
    },
    async (args) => {
      return {
        content: [{ type: "text" as const, text: `Echo: ${args.message}` }],
      };
    }
  );

  server.registerTool(
    ToolName.ADD,
    {
      title: "Add",
      description: "Adds two numbers",
      inputSchema: AddSchema.shape,
    },
    async (args) => {
      const sum = args.a + args.b;
      return {
        content: [
          {
            type: "text" as const,
            text: `The sum of ${args.a} and ${args.b} is ${sum}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    ToolName.PRINT_ENV,
    {
      title: "Print Environment",
      description: "Prints all environment variables, helpful for debugging MCP server configuration",
      inputSchema: PrintEnvSchema.shape,
    },
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(process.env, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    ToolName.GET_TINY_IMAGE,
    {
      title: "Get Tiny Image",
      description: "Returns the MCP_TINY_IMAGE",
      inputSchema: GetTinyImageSchema.shape,
    },
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: "This is a tiny image:",
          },
          {
            type: "image" as const,
            data: MCP_TINY_IMAGE,
            mimeType: "image/png",
          },
          {
            type: "text" as const,
            text: "The image above is the MCP tiny image.",
          },
        ],
      };
    }
  );

  server.registerTool(
    ToolName.ANNOTATED_MESSAGE,
    {
      title: "Annotated Message",
      description: "Demonstrates how annotations can be used to provide metadata about content",
      inputSchema: AnnotatedMessageSchema.shape,
    },
    async (args) => {
      const { messageType, includeImage } = args;
      const content: any[] = [];

      // Main message with different priorities/audiences based on type
      if (messageType === "error") {
        content.push({
          type: "text" as const,
          text: "Error: Operation failed",
          annotations: {
            priority: 1.0, // Errors are highest priority
            audience: ["user", "assistant"], // Both need to know about errors
          },
        });
      } else if (messageType === "success") {
        content.push({
          type: "text" as const,
          text: "Operation completed successfully",
          annotations: {
            priority: 0.7, // Success messages are important but not critical
            audience: ["user"], // Success mainly for user consumption
          },
        });
      } else if (messageType === "debug") {
        content.push({
          type: "text" as const,
          text: "Debug: Cache hit ratio 0.95, latency 150ms",
          annotations: {
            priority: 0.3, // Debug info is low priority
            audience: ["assistant"], // Technical details for assistant
          },
        });
      }

      // Optional image with its own annotations
      if (includeImage) {
        content.push({
          type: "image" as const,
          data: MCP_TINY_IMAGE,
          mimeType: "image/png",
          annotations: {
            priority: 0.5,
            audience: ["user"], // Images primarily for user visualization
          },
        });
      }

      return { content };
    }
  );

  server.registerTool(
    ToolName.GET_RESOURCE_LINKS,
    {
      title: "Get Resource Links",
      description: "Returns multiple resource links that reference different types of resources",
      inputSchema: GetResourceLinksSchema.shape,
    },
    async (args) => {
      const { count } = args;
      const content: any[] = [];

      // Add intro text
      content.push({
        type: "text" as const,
        text: `Here are ${count} resource links to resources available in this server (see full output in tool response if your client does not support resource_link yet):`,
      });

      // Return resource links to actual resources from ALL_RESOURCES
      const actualCount = Math.min(count, ALL_RESOURCES.length);
      for (let i = 0; i < actualCount; i++) {
        const resource = ALL_RESOURCES[i];
        content.push({
          type: "resource_link" as const,
          uri: resource.uri,
          name: resource.name,
          description: `Resource ${i + 1}: ${resource.mimeType === "text/plain"
            ? "plaintext resource"
            : "binary blob resource"
            }`,
          mimeType: resource.mimeType,
        });
      }

      return { content };
    }
  );

  server.registerTool(
    ToolName.STRUCTURED_CONTENT,
    {
      title: "Structured Content",
      description: "Returns structured content along with an output schema for client data validation",
      inputSchema: StructuredContentSchema.input.shape,
      outputSchema: StructuredContentSchema.output.shape,
    },
    async (args) => {
      // The same response is returned for every input.
      const weather = {
        temperature: 22.5,
        conditions: "Partly cloudy",
        humidity: 65
      }

      const backwardCompatiblecontent = {
        type: "text" as const,
        text: JSON.stringify(weather)
      }

      return {
        content: [backwardCompatiblecontent],
        structuredContent: weather
      };
    }
  );

  server.registerTool(
    ToolName.ZIP_RESOURCES,
    {
      title: "Zip Resources",
      description: "Compresses the provided resource files (mapping of name to URI, which can be a data URI) to a zip file, which it returns as a data URI resource link.",
      inputSchema: ZipResourcesInputSchema.shape,
    },
    async (args) => {
      const { files } = args;

      const zip = new JSZip();

      for (const [fileName, fileUrl] of Object.entries(files)) {
        try {
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${fileUrl}: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          zip.file(fileName, arrayBuffer);
        } catch (error) {
          throw new Error(`Error fetching file ${fileUrl}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const uri = `data:application/zip;base64,${await zip.generateAsync({ type: "base64" })}`;

      return {
        content: [
          {
            type: "resource_link" as const,
            uri,
            name: "compressed.zip",
            mimeType: "application/zip",
          },
        ],
      };
    }
  );

  server.registerTool(
    ToolName.GET_RESOURCE_REFERENCE,
    {
      title: "Get Resource Reference",
      description: "Returns a resource reference that can be read by the client",
      inputSchema: GetResourceReferenceSchema.shape,
    },
    async (args, extra) => {
      const resourceId = args.resourceId;

      const resourceIndex = resourceId - 1;
      if (resourceIndex < 0 || resourceIndex >= ALL_RESOURCES.length) {
        throw new Error(`Resource with ID ${resourceId} does not exist`);
      }

      const resource = ALL_RESOURCES[resourceIndex];

      return {
        content: [
          {
            type: "text" as const,
            text: `Returning resource reference for Resource ${resourceId}:`,
          },
          {
            type: "resource" as const,
            resource: resource as any,
          },
          {
            type: "text" as const,
            text: `You can access this resource using the URI: ${resource.uri}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    ToolName.LONG_RUNNING_OPERATION,
    {
      title: "Long Running Operation",
      description: "Demonstrates a long running operation with progress notifications",
      inputSchema: LongRunningOperationSchema.shape,
    },
    async (args, extra) => {
      const { duration, steps } = args;
      const stepDuration = duration / steps;
      const progressToken = extra._meta?.progressToken;

      for (let i = 1; i < steps + 1; i++) {
        await new Promise((resolve) =>
          setTimeout(resolve, stepDuration * 1000)
        );

        if (progressToken !== undefined) {
          await server.server.notification({
            method: "notifications/progress",
            params: {
              progress: i,
              total: steps,
              progressToken,
            },
          },{relatedRequestId: extra.requestId});
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Long running operation completed. Duration: ${duration} seconds, Steps: ${steps}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    ToolName.SAMPLE_LLM,
    {
      title: "Sample LLM",
      description: "Requests the client to sample from an LLM",
      inputSchema: SampleLLMSchema.shape,
    },
    async (args, extra) => {
      const { prompt, maxTokens } = args;

      const result = await requestSampling(
        prompt,
        ToolName.SAMPLE_LLM,
        maxTokens,
        extra.sendRequest
      );
      return {
        content: [
          { type: "text" as const, text: `LLM sampling result: ${result.content.text}` },
        ],
      };
    }
  );

  server.registerTool(
    ToolName.ELICITATION,
    {
      title: "Start Elicitation",
      description: "Demonstrates client-side user input collection via elicitation",
      inputSchema: ElicitationSchema.shape,
    },
    async (args, extra) => {
      const elicitationResult = await extra.sendRequest({
        method: 'elicitation/create',
        params: {
          message: 'Please provide inputs for the following fields:',
          requestedSchema: {
            type: 'object',
            properties: {
              name: {
                title: 'Full Name',
                type: 'string',
                description: 'Your full, legal name',
              },
              check: {
                title: 'Agree to terms',
                type: 'boolean',
                description: 'A boolean check',
              },
              color: {
                title: 'Favorite Color',
                type: 'string',
                description: 'Favorite color (open text)',
                default: 'blue',
              },
              email: {
                title: 'Email Address',
                type: 'string',
                format: 'email',
                description: 'Your email address (will be verified, and never shared with anyone else)',
              },
              homepage: {
                type: 'string',
                format: 'uri',
                description: 'Homepage / personal site',
              },
              birthdate: {
                title: 'Birthdate',
                type: 'string',
                format: 'date',
                description: 'Your date of birth (will never be shared with anyone else)',
              },
              integer: {
                title: 'Favorite Integer',
                type: 'integer',
                description: 'Your favorite integer (do not give us your phone number, pin, or other sensitive info)',
                minimum: 1,
                maximum: 100,
                default: 42,
              },
              number: {
                title: 'Favorite Number',
                type: 'number',
                description: 'Favorite number (there are no wrong answers)',
                minimum: 0,
                maximum: 1000,
                default: 3.14,
              },
              petType: {
                title: 'Pet type',
                type: 'string',
                enum: ['cats', 'dogs', 'birds', 'fish', 'reptiles'],
                enumNames: ['Cats', 'Dogs', 'Birds', 'Fish', 'Reptiles'],
                default: 'dogs',
                description: 'Your favorite pet type',
              },
            },
            required: ['name'],
          },
        },
      }, ElicitResultSchema, { timeout: 10 * 60 * 1000 /* 10 minutes */ });

      // Handle different response actions
      const content: any[] = [];

      if (elicitationResult.action === 'accept' && elicitationResult.content) {
        content.push({
          type: "text" as const,
          text: `✅ User provided the requested information!`,
        });

        // Only access elicitationResult.content when action is accept
        const userData = elicitationResult.content;
        const lines = [];
        if (userData.name) lines.push(`- Name: ${userData.name}`);
        if (userData.check !== undefined) lines.push(`- Agreed to terms: ${userData.check}`);
        if (userData.color) lines.push(`- Favorite Color: ${userData.color}`);
        if (userData.email) lines.push(`- Email: ${userData.email}`);
        if (userData.homepage) lines.push(`- Homepage: ${userData.homepage}`);
        if (userData.birthdate) lines.push(`- Birthdate: ${userData.birthdate}`);
        if (userData.integer !== undefined) lines.push(`- Favorite Integer: ${userData.integer}`);
        if (userData.number !== undefined) lines.push(`- Favorite Number: ${userData.number}`);
        if (userData.petType) lines.push(`- Pet Type: ${userData.petType}`);

        content.push({
          type: "text" as const,
          text: `User inputs:\n${lines.join('\n')}`,
        });
      } else if (elicitationResult.action === 'decline') {
        content.push({
          type: "text" as const,
          text: `❌ User declined to provide the requested information.`,
        });
      } else if (elicitationResult.action === 'cancel') {
        content.push({
          type: "text" as const,
          text: `⚠️ User cancelled the elicitation dialog.`,
        });
      }

      // Include raw result for debugging
      content.push({
        type: "text" as const,
        text: `\nRaw result: ${JSON.stringify(elicitationResult, null, 2)}`,
      });

      return { content };
    }
  );

  server.registerTool(
    ToolName.LIST_ROOTS,
    {
      title: "List Roots",
      description: "Lists the root directories provided by the MCP client",
      inputSchema: ListRootsSchema.shape,
    },
    async (args, extra) => {
      if (!clientSupportsRoots) {
        return {
          content: [
            {
              type: "text" as const,
              text: "The MCP client does not support the roots protocol.\n\n" +
                "This means the server cannot access information about the client's workspace directories or file system roots."
            }
          ]
        };
      }

      if (currentRoots.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "The client supports roots but no roots are currently configured.\n\n" +
                "This could mean:\n" +
                "1. The client hasn't provided any roots yet\n" +
                "2. The client provided an empty roots list\n" +
                "3. The roots configuration is still being loaded"
            }
          ]
        };
      }

      const rootsList = currentRoots.map((root, index) => {
        return `${index + 1}. ${root.name || 'Unnamed Root'}\n   URI: ${root.uri}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: "text" as const,
            text: `Current MCP Roots (${currentRoots.length} total):\n\n${rootsList}\n\n` +
              "Note: This server demonstrates the roots protocol capability but doesn't actually access files. " +
              "The roots are provided by the MCP client and can be used by servers that need file system access."
          }
        ]
      };
    }
  );

  server.server.setRequestHandler(CompleteRequestSchema, async (request) => {
    const { ref, argument } = request.params;

    if (ref.type === "ref/resource") {
      const resourceId = ref.uri.split("/").pop();
      if (!resourceId) return { completion: { values: [] } };

      // Filter resource IDs that start with the input value
      const values = EXAMPLE_COMPLETIONS.resourceId.filter((id) =>
        id.startsWith(argument.value)
      );
      return { completion: { values, hasMore: false, total: values.length } };
    }

    if (ref.type === "ref/prompt") {
      // Handle completion for prompt arguments
      const completions =
        EXAMPLE_COMPLETIONS[argument.name as keyof typeof EXAMPLE_COMPLETIONS];
      if (!completions) return { completion: { values: [] } };

      const values = completions.filter((value) =>
        value.startsWith(argument.value)
      );
      return { completion: { values, hasMore: false, total: values.length } };
    }

    throw new Error(`Unknown reference type`);
  });

  // Roots protocol handlers
  server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    try {
      // Request the updated roots list from the client
      const response = await server.server.listRoots();
      if (response && 'roots' in response) {
        currentRoots = response.roots;

        // Log the roots update for demonstration
        await server.sendLoggingMessage({
            level: "info",
            logger: "everything-server",
            data: `Roots updated: ${currentRoots.length} root(s) received from client`,
        });
      }
    } catch (error) {
      await server.sendLoggingMessage({
          level: "error",
          logger: "everything-server",
          data: `Failed to request roots from client: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  // Handle post-initialization setup for roots
  server.server.oninitialized = async () => {
   clientCapabilities = server.server.getClientCapabilities();

    if (clientCapabilities?.roots) {
      clientSupportsRoots = true;
      try {
        const response = await server.server.listRoots();
        if (response && 'roots' in response) {
          currentRoots = response.roots;

          await server.sendLoggingMessage({
              level: "info",
              logger: "everything-server",
              data: `Initial roots received: ${currentRoots.length} root(s) from client`,
          });
        } else {
          await server.sendLoggingMessage({
              level: "warning",
              logger: "everything-server",
              data: "Client returned no roots set",
          });
        }
      } catch (error) {
        await server.sendLoggingMessage({
            level: "error",
            logger: "everything-server",
            data: `Failed to request initial roots from client: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } else {
      await server.sendLoggingMessage({
          level: "info",
          logger: "everything-server",
          data: "Client does not support MCP roots protocol",
      });
    }
  };

  const cleanup = async () => {
    if (subsUpdateInterval) clearInterval(subsUpdateInterval);
    if (logsUpdateInterval) clearInterval(logsUpdateInterval);
    if (stdErrUpdateInterval) clearInterval(stdErrUpdateInterval);
  };

  return { server, cleanup, startNotificationIntervals };
};

const MCP_TINY_IMAGE =
  "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";
