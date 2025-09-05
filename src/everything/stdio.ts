#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./everything.js";
import {
    LoggingLevel,
    LoggingLevelSchema,
    LoggingMessageNotification,
    SetLevelRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

console.error('Starting default (STDIO) server...');

async function main() {
    const transport = new StdioServerTransport();
    const {server, cleanup, startNotificationIntervals } = createServer();

    // Currently, for STDIO servers, automatic log-level support is not available, as levels are tracked by sessionId.
    // The listener will be set, so if the STDIO server advertises support for logging, and the client sends a setLevel
    // request, it will be handled and thus not throw a "Method not found" error. However, the STDIO server will need to
    // implement its own listener and level handling for now. This will be remediated in a future SDK version.

    let logLevel: LoggingLevel = "debug";
    server.setRequestHandler(SetLevelRequestSchema, async (request) => {
        const { level } = request.params;
        logLevel = level;
        return {};
    });

    server.sendLoggingMessage =  async (params: LoggingMessageNotification["params"], _: string|undefined): Promise<void>  => {
        const LOG_LEVEL_SEVERITY = new Map(
            LoggingLevelSchema.options.map((level, index) => [level, index])
        );

        const isMessageIgnored = (level: LoggingLevel): boolean => {
            const currentLevel = logLevel;
            return (currentLevel)
                ? LOG_LEVEL_SEVERITY.get(level)! < LOG_LEVEL_SEVERITY.get(currentLevel)!
                : false;
        };

        if (!isMessageIgnored(params.level)) {
            return server.notification({method: "notifications/message", params})
        }

    }

    await server.connect(transport);
    startNotificationIntervals();

    // Cleanup on exit
    process.on("SIGINT", async () => {
        await cleanup();
        await server.close();
        process.exit(0);
    });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

