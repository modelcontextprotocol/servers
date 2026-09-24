export const tools = [
    {
        name: "mk-connect",
        description: "Connect to the MikroTik router",
        inputSchema: {
            type: "object",
            properties: {
                host: { type: "string", description: "Router IP address" },
                user: { type: "string", description: "Username" },
                password: { type: "string", description: "Password" },
                secure: { type: "boolean", description: "Use secure connection (TLS/SSL)", default: false },
            },
            required: ["host", "user", "password"],
        },
    },
    {
        name: "mk-report",
        description: "Generates a comprehensive system report including resource usage, health, and interface traffic statistics.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "mk-get",
        description: "Returns a JSON array with the result of a MikroTik API /print command. For example /ip/route stand for /ip/route/print",
        inputSchema: {
            type: "object",
            properties: {
                sentence: {
                    type: "string",
                    description: "The API path (e.g., /ip/route, /interface). '/print' will be automatically appended."
                },
            },
            required: ["sentence"],
        },
    },
    {
        name: "mk-awr",
        description: "Generates an Automatic Workload Repository (AWR) style report for MikroTik, including performance metrics, security audit, and recommendations.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
];

