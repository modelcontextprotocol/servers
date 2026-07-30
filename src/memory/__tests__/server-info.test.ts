import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const { MockMcpServer, mockServer } = vi.hoisted(() => {
  const mockServer = {
    registerTool: vi.fn(),
    registerResource: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    server: {
      sendResourceUpdated: vi.fn(),
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
    },
  };

  return {
    MockMcpServer: vi.fn(function MockMcpServer() {
      return mockServer;
    }),
    mockServer,
  };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: MockMcpServer,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

describe('memory server info', () => {
  it('uses the package version for MCP server metadata', async () => {
    vi.resetModules();

    await import('../index.js');

    expect(MockMcpServer).toHaveBeenCalledTimes(1);
    expect(MockMcpServer).toHaveBeenCalledWith({
      name: 'memory-server',
      version: packageJson.version,
    });
    expect(mockServer.registerTool).toHaveBeenCalled();
  });
});
