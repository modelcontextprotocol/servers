#!/usr/bin/env node

// Parse command line arguments first
const args = process.argv.slice(2);
const scriptName = args[0] || "stdio";

async function run() {
  try {
    // Dynamically import only the requested module to prevent all modules from initializing
    switch (scriptName) {
      case "stdio":
        // Import and run the default server
        await import("./transports/stdio.js");
        break;
      case "sse":
        // Import and run the SSE server
        await import("./transports/sse.js");
        break;
      case "streamableHttp":
        // Import and run the streamable HTTP server
        await import("./transports/streamableHttp.js");
        break;
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

await run();
