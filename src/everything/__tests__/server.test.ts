import { describe, it, expect } from "vitest";
import { createServer, cleanupSession } from "../server/index.js";

describe("Server Factory", () => {
  describe("createServer", () => {
    it("should return an McpServer instance", () => {
      const server = createServer();

      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
    });

    it("should expose a session cleanup function", () => {
      expect(typeof cleanupSession).toBe("function");
      expect(() => cleanupSession()).not.toThrow();
    });

    it("should set an oninitialized handler on a legacy-era instance", () => {
      // The handshake hook only exists on the legacy era: 2026-07-28 has no
      // `initialize`, so roots are pulled by the `get-roots-list` tool instead.
      const server = createServer({ era: "legacy" });

      expect(server.server.oninitialized).toBeDefined();
    });

    it("should NOT set an oninitialized handler on a modern-era instance", () => {
      const server = createServer({ era: "modern" });

      expect(server.server.oninitialized).toBeUndefined();
    });

    it("should default to the legacy handshake hook when no context is given", () => {
      // A bare `createServer()` (tests, and the SSE transport before it passes
      // its own context) must not lose the legacy-era roots sync.
      const server = createServer();

      expect(server.server.oninitialized).toBeDefined();
    });

    it("should allow multiple servers to be created", () => {
      const server1 = createServer();
      const server2 = createServer();

      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1).not.toBe(server2);
    });
  });
});
