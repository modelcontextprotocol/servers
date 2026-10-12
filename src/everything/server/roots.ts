// The 2025-era roots sync: after `initialize`, a server whose client supports
// Roots asks for the list with `roots/list`, and asks again each time the
// client sends `notifications/roots/list_changed`, reporting each answer to
// the client as a log message.
//
// 2025-era only, and deprecated: the 2026-07-28 revision removes
// server-to-client requests and `notifications/roots/list_changed`, and
// deprecates Roots. There a server asks for roots in-band, by returning an
// `input_required` result from a call, which `get-roots-list` does on both
// eras (#4852). Nothing is cached: the answer is only reported.

import { McpServer } from "@modelcontextprotocol/server";

/** The servers whose `roots/list_changed` handler is installed. */
const watching = new WeakSet<McpServer>();

/**
 * Ask the client for its roots and report the answer, and re-ask on each
 * `notifications/roots/list_changed`. Does nothing for a client without Roots.
 * Safe to call more than once: the notification handler is installed once.
 *
 * A failed request is logged to stderr, not thrown, since the caller is a
 * timer with nothing to report the failure to.
 *
 * @param {McpServer} server - The 2025-era server whose client is asked.
 */
export const syncRoots = async (server: McpServer): Promise<void> => {
  const clientCapabilities = server.server.getClientCapabilities() || {};
  if (clientCapabilities.roots === undefined) return;

  const requestRoots = async () => {
    try {
      const response = await server.server.listRoots();
      await server.sendLoggingMessage(
        {
          level: "info",
          logger: "everything-server",
          data: `Roots updated: ${response.roots.length} root(s) received from client`,
        },
        server.server.transport?.sessionId,
      );
    } catch (error) {
      console.error(
        `Failed to request roots from client: ${
          /* v8 ignore start -- the SDK always rejects listRoots() with an Error (ProtocolError or SdkError) */
          error instanceof Error ? error.message : String(error)
          /* v8 ignore stop */
        }`,
      );
    }
  };

  if (!watching.has(server)) {
    watching.add(server);
    server.server.setNotificationHandler(
      "notifications/roots/list_changed",
      requestRoots,
    );
  }
  await requestRoots();
};
