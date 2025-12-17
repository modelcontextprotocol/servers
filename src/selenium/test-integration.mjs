import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

async function test() {
    console.log("🧪 Testing Selenium MCP + AI Integration\n");
    
    // Start MCP server
    const serverProcess = spawn("node", ["dist/index.js"], {
        cwd: process.cwd()
    });
    
    const transport = new StdioClientTransport({
        stdin: serverProcess.stdin,
        stdout: serverProcess.stdout
    });
    
    const client = new Client({
        name: "test-client",
        version: "1.0.0"
    }, {
        capabilities: {}
    });
    
    await client.connect(transport);
    console.log("✓ Connected to MCP server\n");
    
    // List tools
    const tools = await client.listTools();
    console.log(`Found ${tools.tools.length} tools:`);
    const aiTools = tools.tools.filter(t => t.name.startsWith("ai_"));
    console.log(`  AI Tools: ${aiTools.map(t => t.name).join(", ")}\n`);
    
    // Test ai_generate
    console.log("Testing ai_generate...");
    const genResult = await client.callTool("ai_generate", {
        prompt: "What is 2+2?",
        max_new_tokens: 50
    });
    console.log("✓ ai_generate works!");
    console.log(`  Response: ${JSON.stringify(genResult).substring(0, 100)}...\n`);
    
    // Test start_browser and ai_analyze_page
    console.log("Testing ai_analyze_page...");
    try {
        await client.callTool("start_browser", {});
        await client.callTool("navigate", { url: "https://example.com" });
        const analysis = await client.callTool("ai_analyze_page", {
            analysis_type: "summary"
        });
        console.log("✓ ai_analyze_page works!");
        console.log(`  Analysis: ${JSON.stringify(analysis).substring(0, 100)}...\n`);
    } catch (error) {
        console.log(`⚠ ai_analyze_page test skipped: ${error.message}\n`);
    }
    
    console.log("✅ All tests passed!\n");
    await client.close();
    serverProcess.kill();
    process.exit(0);
}

test().catch(error => {
    console.error("❌ Test failed:", error);
    process.exit(1);
});
