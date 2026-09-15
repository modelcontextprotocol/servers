import { McpServer, RegisteredResource } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resource, ResourceLink } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tracks registered session resources per server, by URI, to allow updating/removing on
 * re-registration. This prevents "Resource already registered" errors when a tool creates a
 * resource with the same URI multiple times during a session.
 *
 * The registry is scoped to the `McpServer` that owns the resource rather than being module
 * level: every session gets its own server (see `server/index.ts`), so a module-level map lets
 * one session's re-registration remove the resource another session registered under the same
 * URI. A `WeakMap` also lets a closed session's registry be collected.
 */
const registeredResources = new WeakMap<McpServer, Map<string, RegisteredResource>>();

/**
 * Returns the resource registry owned by `server`, creating it on first use.
 */
const sessionResourcesFor = (server: McpServer): Map<string, RegisteredResource> => {
  let resources = registeredResources.get(server);

  if (!resources) {
    resources = new Map<string, RegisteredResource>();
    registeredResources.set(server, resources);
  }

  return resources;
};

/**
 * Generates a session-scoped resource URI string based on the provided resource name.
 *
 * @param {string} name - The name of the resource to create a URI for.
 * @returns {string} The formatted session resource URI.
 */
export const getSessionResourceURI = (name: string): string => {
  return `demo://resource/session/${name}`;
};

/**
 * Registers a session-scoped resource with the provided server and returns a resource link.
 *
 * The registered resource is available during the life of the session only; it is not otherwise persisted.
 *
 * @param {McpServer} server - The server instance responsible for handling the resource registration.
 * @param {Resource} resource - The resource object containing metadata such as URI, name, description, and mimeType.
 * @param {"text"|"blob"} type
 * @param payload
 * @returns {ResourceLink} An object representing the resource link, with associated metadata.
 */
export const registerSessionResource = (
  server: McpServer,
  resource: Resource,
  type: "text" | "blob",
  payload: string
): ResourceLink => {
  // Destructure resource
  const { uri, name, mimeType, description, title, annotations, icons, _meta } =
    resource;

  // Prepare the resource content to return
  // See https://modelcontextprotocol.io/specification/2025-11-25/server/resources#resource-contents
  const resourceContent =
    type === "text"
      ? {
          uri: uri.toString(),
          mimeType,
          text: payload,
        }
      : {
          uri: uri.toString(),
          mimeType,
          blob: payload,
        };

  // Check if this server already registered a resource with this URI and remove that one
  const sessionResources = sessionResourcesFor(server);
  const existingResource = sessionResources.get(uri);
  if (existingResource) {
    existingResource.remove();
    sessionResources.delete(uri);
  }

  // Register file resource
  const registeredResource = server.registerResource(
    name,
    uri,
    { mimeType, description, title, annotations, icons, _meta },
    async () => {
      return {
        contents: [resourceContent],
      };
    }
  );

  // Track the registered resource for potential future removal
  sessionResources.set(uri, registeredResource);

  return { type: "resource_link", ...resource };
};
