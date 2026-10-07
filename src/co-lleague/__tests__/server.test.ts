import { describe, it, expect } from "vitest";

describe("co-lleague MCP server", () => {
  it("should export server configuration", () => {
    const pkg = require("../package.json");
    expect(pkg.name).toBe("@modelcontextprotocol/server-co-lleague");
    expect(pkg.bin["mcp-server-co-lleague"]).toBe("dist/index.js");
  });
});
