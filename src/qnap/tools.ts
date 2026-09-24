export const tools = [
    {
        name: "qnap-connect",
        description: "Connect to a QNAP NAS and obtain a session ID.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "QNAP NAS host (e.g., http://10.1.1.241:8080)"
                },
                username: {
                    type: "string",
                    description: "Username"
                },
                password: {
                    type: "string",
                    description: "Password"
                }
            },
            required: ["host", "username", "password"]
        }
    },
    {
        name: "qnap-report",
        description: "Generate a QNAP system report including CPU, memory, disks and volume status.",
        inputSchema: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "qnap-dir",
        description: "List contents of a directory on the QNAP NAS.",
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Directory path (e.g., /Public)"
                }
            },
            required: ["path"]
        }
    },
    {
        name: "qnap-file-info",
        description: "Get detailed information about a file on the QNAP NAS.",
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Directory path where the file is located"
                },
                filename: {
                    type: "string",
                    description: "Name of the file"
                }
            },
            required: ["path", "filename"]
        }
    }
];
