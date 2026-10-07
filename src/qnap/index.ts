#!/usr/bin/env node
import { QnapServer } from "./server.js";

const server = new QnapServer();
server.run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
