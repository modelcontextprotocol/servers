/**
 * Characterizes the `mcp-server-everything` launcher (#4854): which transport
 * each argument starts, the usage text for an unknown one, the exit code when
 * a transport fails to start, and the entry-point guard that keeps importing
 * the module from starting anything. The transport modules are replaced with
 * stubs, since each is tested on its own; the boot smoke
 * (`scripts/smoke-servers.mjs`) runs the real binary.
 */
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startStdioServer, startSseServer, startStreamableHttpServer } =
  vi.hoisted(() => ({
    startStdioServer: vi.fn(),
    startSseServer: vi.fn(),
    startStreamableHttpServer: vi.fn(),
  }));

vi.mock("../transports/stdio.js", () => ({ startStdioServer }));
vi.mock("../transports/sse.js", () => ({ startSseServer }));
vi.mock("../transports/streamableHttp.js", () => ({
  startStreamableHttpServer,
}));

const { run, isEntryPoint } = await import("../index.js");

let exit: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("run", () => {
  it.each([
    ["stdio", startStdioServer],
    ["sse", startSseServer],
    ["streamableHttp", startStreamableHttpServer],
  ])("starts the %s transport", async (name, start) => {
    await run(name);
    expect(start).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it("prints the usage and exits 1 for an unknown transport", async () => {
    await run("websocket");
    expect(error.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "-".repeat(53),
      "  Everything Server Launcher",
      "  Usage: node ./index.js [stdio|sse|streamableHttp]",
      "  Default transport: stdio",
      "-".repeat(53),
      "Unknown transport: websocket",
    ]);
    expect(log.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "Available transports:",
      "- stdio",
      "- sse",
      "- streamableHttp",
    ]);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports a transport that fails to start and exits 1", async () => {
    const failure = new Error("port trouble");
    startSseServer.mockImplementationOnce(() => {
      throw failure;
    });
    await run("sse");
    expect(error).toHaveBeenCalledWith("Error running script:", failure);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not start anything when imported", () => {
    // The module was imported above, under vitest rather than as the binary.
    expect(startStdioServer).not.toHaveBeenCalled();
  });
});

describe("isEntryPoint", () => {
  const self = new URL("../index.ts", import.meta.url);
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "everything-entry-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("is true for the module's own path", () => {
    expect(isEntryPoint(fileURLToPath(self), self.href)).toBe(true);
  });

  it("follows a symlink, as npm's bin shim is", () => {
    const link = join(dir, "mcp-server-everything");
    symlinkSync(fileURLToPath(self), link);
    expect(isEntryPoint(link, self.href)).toBe(true);
  });

  it("is false for another script, a missing path, or none", () => {
    expect(isEntryPoint(join(dir, "missing.js"), self.href)).toBe(false);
    expect(
      isEntryPoint(fileURLToPath(self), pathToFileURL(join(dir, "x.js")).href),
    ).toBe(false);
    expect(
      isEntryPoint(
        fileURLToPath(new URL("../version.ts", import.meta.url)),
        self.href,
      ),
    ).toBe(false);
    expect(isEntryPoint(undefined, self.href)).toBe(false);
  });
});
