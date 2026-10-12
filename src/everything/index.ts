#!/usr/bin/env node

// The `mcp-server-everything` launcher: picks a transport from the first
// command-line argument (default `stdio`) and starts it.
//
// `run()` is exported and the start-up is guarded by `isEntryPoint()` (#4854),
// so a test can import this module and drive each branch in-process without
// the import itself starting a server on the test runner's stdio. Each
// transport module is still imported dynamically, so only the requested one
// initializes.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Start the transport named `scriptName`, or print the usage and exit 1 for an
 * unknown name.
 */
export async function run(scriptName: string): Promise<void> {
  try {
    // Dynamically import only the requested module to prevent all modules from initializing
    switch (scriptName) {
      case "stdio": {
        // Import and run the default server
        const { startStdioServer } = await import("./transports/stdio.js");
        await startStdioServer();
        break;
      }
      case "sse": {
        // Import and run the SSE server
        const { startSseServer } = await import("./transports/sse.js");
        startSseServer();
        break;
      }
      case "streamableHttp": {
        // Import and run the streamable HTTP server
        const { startStreamableHttpServer } =
          await import("./transports/streamableHttp.js");
        startStreamableHttpServer();
        break;
      }
      default:
        console.error(`-`.repeat(53));
        console.error(`  Everything Server Launcher`);
        console.error(`  Usage: node ./index.js [stdio|sse|streamableHttp]`);
        console.error(`  Default transport: stdio`);
        console.error(`-`.repeat(53));
        console.error(`Unknown transport: ${scriptName}`);
        console.log("Available transports:");
        console.log("- stdio");
        console.log("- sse");
        console.log("- streamableHttp");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error running script:", error);
    process.exit(1);
  }
}

/**
 * Whether the module at `moduleUrl` is the script node was started with
 * (`argv1`). Both sides are resolved through symlinks, because the npm `bin`
 * shim that `npx` runs is a symlink to `dist/index.js`.
 */
export function isEntryPoint(
  argv1: string | undefined,
  moduleUrl: string,
): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/* v8 ignore next -- true only when node runs this file as the binary; the boot smoke (scripts/smoke-servers.mjs) covers that path */
if (isEntryPoint(process.argv[1], import.meta.url)) {
  await run(process.argv[2] || "stdio");
}
