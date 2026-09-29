/**
 * Shared typing helpers for the everything-server unit tests.
 *
 * The tests capture the handlers a register* function passes to a mocked
 * McpServer and invoke them directly. These types describe exactly what the
 * tests call them with — a plain argument object and a partial request
 * `extra` — so the captured handlers are typed without `any` or `Function`.
 * `contentOfType` narrows a content block to one member of the SDK's
 * `ContentBlock` union, failing loudly when the block is some other kind.
 */
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ContentBlock,
  GetPromptResult,
  ReadResourceResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

/** The request context a tool/prompt/resource handler receives. */
export type HandlerExtra = RequestHandlerExtra<
  ServerRequest,
  ServerNotification
>;

/** A captured tool handler, as the tests invoke it. */
export type ToolHandler = (
  args: Record<string, unknown>,
  extra?: Partial<HandlerExtra>,
) => Promise<CallToolResult>;

/** A captured prompt handler, as the tests invoke it (the prompts are sync). */
export type PromptHandler = (args?: Record<string, string>) => GetPromptResult;

/** A captured resource read handler, as the tests invoke it. */
export type ResourceHandler = (
  uri: URL,
  extra?: Partial<HandlerExtra>,
) => Promise<ReadResourceResult>;

/**
 * Narrow a content block to the member of the `ContentBlock` union whose
 * `type` is `type`, throwing if the block is missing or of another kind.
 */
export function contentOfType<T extends ContentBlock["type"]>(
  block: ContentBlock | undefined,
  type: T,
): Extract<ContentBlock, { type: T }> {
  if (block?.type !== type) {
    throw new Error(`expected ${type} content, got ${block?.type}`);
  }
  return block as Extract<ContentBlock, { type: T }>;
}

/** The text of a content block that must be a text block. */
export function textOf(block: ContentBlock | undefined): string {
  return contentOfType(block, "text").text;
}
