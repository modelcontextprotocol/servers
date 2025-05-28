import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function createClient() {
  // Create the HTTP transport pointing to your server
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/mcp")
  );

  // Create the MCP client
  const client = new Client(
    {
      name: "postgres-client",
      version: "1.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Connect to the server
  await client.connect(transport);

  return client;
}

async function main() {
  try {
    const client = await createClient();

    // List available resources (database tables)
    const resources = await client.listResources();
    console.log("Available resources:", resources);

    // Read a specific resource if available
    if (resources.resources.length > 0) {
      const firstResource = resources.resources[0];
      console.log(`Reading resource: ${firstResource.name}`);

      const resourceContent = await client.readResource({
        uri: firstResource.uri
      });
      console.log("Resource content:", resourceContent);
    }

    // Clean up - terminate the session
    // await client.transport.terminateSession();

  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
