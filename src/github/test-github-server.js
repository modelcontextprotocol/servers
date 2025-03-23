#!/usr/bin/env node
// GitHub MCP Server Test Script
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Banner
console.log(`${colors.bold}${colors.blue}╔════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.bold}${colors.blue}║        GitHub MCP Server Test          ║${colors.reset}`);
console.log(`${colors.bold}${colors.blue}╚════════════════════════════════════════╝${colors.reset}`);

// Check prerequisites
const checkPrerequisites = () => {
  console.log(`\n${colors.bold}Checking Prerequisites:${colors.reset}`);
  
  // Check if dist directory exists
  if (!existsSync(path.join(process.cwd(), 'dist'))) {
    console.log(`${colors.red}✘ Build files not found. Please run "npm run build" first.${colors.reset}`);
    process.exit(1);
  }
  console.log(`${colors.green}✓ Build files exist${colors.reset}`);
  
  // Check if GitHub CLI is installed
  try {
    execSync('gh --version', { stdio: 'ignore' });
    console.log(`${colors.green}✓ GitHub CLI is installed${colors.reset}`);
  } catch (error) {
    console.log(`${colors.yellow}! GitHub CLI not found. Limited testing will be available.${colors.reset}`);
    console.log(`  To install GitHub CLI: https://cli.github.com/`);
  }
  
  // Check GitHub CLI auth status
  let isAuthenticated = false;
  try {
    const output = execSync('gh auth status 2>&1').toString();
    if (output.includes('Logged in to')) {
      console.log(`${colors.green}✓ GitHub CLI is authenticated${colors.reset}`);
      isAuthenticated = true;
    } else {
      console.log(`${colors.yellow}! GitHub CLI is not authenticated${colors.reset}`);
      console.log(`  To authenticate: gh auth login`);
    }
  } catch (error) {
    console.log(`${colors.yellow}! GitHub CLI is not authenticated${colors.reset}`);
    console.log(`  To authenticate: gh auth login`);
  }
  
  return isAuthenticated;
};

// Helper function to send requests to the MCP server
const sendMCPRequest = (serverProcess, request) => {
  return new Promise((resolve, reject) => {
    let responseData = '';
    let timeoutId;
    
    console.log(`${colors.cyan}→ Sending request: ${colors.reset}${JSON.stringify(request).substring(0, 100)}...`);
    
    const messageHandler = (data) => {
      const chunk = data.toString();
      responseData += chunk;
      
      try {
        const response = JSON.parse(responseData);
        clearTimeout(timeoutId);
        serverProcess.stdout.removeListener('data', messageHandler);
        resolve(response);
      } catch (error) {
        // Probably incomplete JSON, continue collecting
      }
    };
    
    // Set a timeout to prevent hanging
    timeoutId = setTimeout(() => {
      serverProcess.stdout.removeListener('data', messageHandler);
      reject(new Error(`Timeout waiting for response to ${request.method}`));
    }, 10000);
    
    serverProcess.stdout.on('data', messageHandler);
    serverProcess.stdin.write(JSON.stringify(request) + '\n');
  });
};

// Run tests
const runTests = async (isAuthenticated) => {
  console.log(`\n${colors.bold}Starting Tests:${colors.reset}`);
  
  // Start the server process
  console.log(`${colors.cyan}→ Starting server...${colors.reset}`);
  const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', process.stderr]
  });
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // Test 1: List tools
    console.log(`\n${colors.bold}Test 1: Listing available tools${colors.reset}`);
    const listToolsRequest = {
      id: "1",
      jsonrpc: "2.0",
      method: "tools/list",
      params: {}
    };
    
    try {
      const listToolsResponse = await sendMCPRequest(serverProcess, listToolsRequest);
      
      if (listToolsResponse && listToolsResponse.result && listToolsResponse.result.tools) {
        const toolNames = listToolsResponse.result.tools.map(t => t.name);
        console.log(`${colors.green}✓ Found ${toolNames.length} tools${colors.reset}`);
        console.log(`  ${toolNames.slice(0, 5).join(', ')}${toolNames.length > 5 ? '...' : ''}`);
        testsPassed++;
      } else {
        console.log(`${colors.red}✘ Tools listing test failed: Unexpected response format${colors.reset}`);
        testsFailed++;
      }
    } catch (error) {
      console.log(`${colors.red}✘ Tools listing test failed: ${error.message}${colors.reset}`);
      testsFailed++;
    }
    
    // Test 2: Search repositories
    console.log(`\n${colors.bold}Test 2: Searching repositories${colors.reset}`);
    const searchRequest = {
      id: "2",
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "search_repositories",
        arguments: {
          query: "modelcontextprotocol"
        }
      }
    };
    
    try {
      const searchResponse = await sendMCPRequest(serverProcess, searchRequest);
      
      if (searchResponse && searchResponse.result && searchResponse.result.content && searchResponse.result.content[0]) {
        const searchContent = JSON.parse(searchResponse.result.content[0].text);
        console.log(`${colors.green}✓ Search found ${searchContent.total_count} repositories${colors.reset}`);
        testsPassed++;
      } else {
        console.log(`${colors.red}✘ Repository search test failed: Unexpected response format${colors.reset}`);
        testsFailed++;
      }
    } catch (error) {
      console.log(`${colors.red}✘ Repository search test failed: ${error.message}${colors.reset}`);
      testsFailed++;
    }
    
    // Test 3: Getting file contents (only if authenticated)
    if (isAuthenticated) {
      console.log(`\n${colors.bold}Test 3: Getting file contents${colors.reset}`);
      const getFileRequest = {
        id: "3",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "get_file_contents",
          arguments: {
            owner: "modelcontextprotocol",
            repo: "servers",
            path: "README.md"
          }
        }
      };
      
      try {
        const fileResponse = await sendMCPRequest(serverProcess, getFileRequest);
        
        if (fileResponse && fileResponse.result && fileResponse.result.content && fileResponse.result.content[0]) {
          const fileContent = JSON.parse(fileResponse.result.content[0].text);
          console.log(`${colors.green}✓ Got file contents, file size: ${fileContent.size || 'unknown'} bytes${colors.reset}`);
          testsPassed++;
        } else {
          console.log(`${colors.red}✘ Get file contents test failed: Unexpected response format${colors.reset}`);
          testsFailed++;
        }
      } catch (error) {
        console.log(`${colors.red}✘ Get file contents test failed: ${error.message}${colors.reset}`);
        testsFailed++;
      }
    }
    
    // Summary
    console.log(`\n${colors.bold}Test Summary:${colors.reset}`);
    console.log(`${colors.green}✓ Passed: ${testsPassed} tests${colors.reset}`);
    if (testsFailed > 0) {
      console.log(`${colors.red}✘ Failed: ${testsFailed} tests${colors.reset}`);
    }
    if (!isAuthenticated) {
      console.log(`${colors.yellow}! Note: Authentication tests were skipped${colors.reset}`);
      console.log(`  To enable all tests: gh auth login`);
    }
    
  } catch (error) {
    console.error(`${colors.red}Test execution failed: ${error.message}${colors.reset}`);
  } finally {
    // Clean up
    serverProcess.kill();
    console.log(`\n${colors.bold}Tests completed!${colors.reset}`);
  }
};

// Main execution
const isAuthenticated = checkPrerequisites();
runTests(isAuthenticated);