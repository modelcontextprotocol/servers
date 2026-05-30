import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validatePath, readFileContent, getAllowedDirectories } from "./lib.js";

export const registerResources = (server: McpServer): void => {
  server.registerResource("allowed-directories", "filesystem://allowed-directories",
    { title: "Allowed Directories", description: "Allowed access directories.", mimeType: "text/plain" },
    async (uri) => ({ contents: [{ uri: uri.toString(), mimeType: "text/plain", text: getAllowedDirectories().join("\n") || "None configured" }] }));
  server.registerResource("file", new ResourceTemplate("file://{path}", { list: undefined }),
    { title: "File", description: "Read a file. URI: file:///path/to/file", mimeType: "text/plain" },
    async (uri, v) => {
      const validPath = await validatePath(String(v.path ?? ""));
      return { contents: [{ uri: uri.toString(), mimeType: "text/plain", text: await readFileContent(validPath) }] };
    });
};
