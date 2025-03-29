// Test script for GitHub MCP server
// 
// This script tests the basic functionality of the GitHub MCP server by:
// 1. Checking if GitHub CLI authentication is available
// 2. Testing listing of available tools
// 3. Testing repository search functionality
// 4. Testing file content retrieval (if authenticated)
//
// Usage: node test.js
//
// Note: For complete testing, make sure you're authenticated with GitHub CLI:
//   gh auth login
import { spawn } from 'child_process';
import { execSync } from 'child_process';

console.log('Testing GitHub MCP server...');

// Helper function to check if GitHub CLI is authenticated
const checkGitHubAuth = () => {
  try {
    const output = execSync('gh auth status').toString();
    if (output.includes('Logged in to')) {
      console.log('GitHub CLI is authenticated');
      return true;
    }
  } catch (error) {
    console.log('GitHub CLI is not authenticated');
    return false;
  }
  
  return false;
};

// Helper function to send requests to the MCP server
const sendMCPRequest = (serverProcess, request) => {
  return new Promise((resolve, reject) => {
    let responseData = '';
    let timeoutId;
    
    console.log(`Sending request: ${JSON.stringify(request).substring(0, 100)}...`);
    
    const messageHandler = (data) => {
      const chunk = data.toString();
      console.log(`Received chunk: ${chunk.substring(0, 50)}...`);
      responseData += chunk;
      
      try {
        const response = JSON.parse(responseData);
        console.log('Successfully parsed response');
        clearTimeout(timeoutId);
        serverProcess.stdout.removeListener('data', messageHandler);
        resolve(response);
      } catch (error) {
        // Probably incomplete JSON, continue collecting
        console.log('Incomplete JSON, waiting for more data...');
      }
    };
    
    // Set a timeout to prevent hanging
    timeoutId = setTimeout(() => {
      serverProcess.stdout.removeListener('data', messageHandler);
      reject(new Error(`Timeout waiting for response to ${request.method}. Partial response: ${responseData.substring(0, 200)}...`));
    }, 5000);
    
    serverProcess.stdout.on('data', messageHandler);
    serverProcess.stdin.write(JSON.stringify(request) + '\n');
  });
};

// Run tests in sequence
const runTests = async () => {
  // Check GitHub CLI auth
  const isAuthenticated = checkGitHubAuth();
  if (!isAuthenticated) {
    console.log('To fully test the GitHub server, please authenticate with GitHub CLI:');
    console.log('  gh auth login');
    console.log('Continuing with limited tests...');
  }
  
  // Start the server process
  const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', process.stderr]
  });
  
  try {
    // Test 1: List tools
    console.log('\nTest 1: Listing available tools...');
    const listToolsRequest = {
      id: "1",
      jsonrpc: "2.0",
      method: "tools/list",
      params: {}
    };
    
    const listToolsResponse = await sendMCPRequest(serverProcess, listToolsRequest);
    console.log('List tools response:', JSON.stringify(listToolsResponse).substring(0, 200) + '...');
    
    if (listToolsResponse && listToolsResponse.result && listToolsResponse.result.tools) {
      const toolNames = listToolsResponse.result.tools.map(t => t.name);
      console.log(`Found ${toolNames.length} tools: ${toolNames.slice(0, 5).join(', ')}${toolNames.length > 5 ? '...' : ''}`);
      console.log('✅ Tools listing test passed');
    } else {
      console.log('❌ Tools listing test failed: Unexpected response format');
      console.log(JSON.stringify(listToolsResponse, null, 2));
    }
    
    // Test 2: Search repositories
    console.log('\nTest 2: Searching repositories...');
    const searchRequest = {
      id: "2",
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "search_repositories",
        arguments: {
          query: "modelcontextprotocol/servers"
        }
      }
    };
    
    try {
      const searchResponse = await sendMCPRequest(serverProcess, searchRequest);
      console.log('Search response received:', JSON.stringify(searchResponse).substring(0, 200) + '...');
      
      if (searchResponse && searchResponse.result && searchResponse.result.content && searchResponse.result.content[0]) {
        const searchContent = JSON.parse(searchResponse.result.content[0].text);
        console.log(`Search found ${searchContent.total_count} repositories`);
        console.log('✅ Repository search test passed');
      } else {
        console.log('❌ Repository search test failed: Unexpected response format');
        console.log(JSON.stringify(searchResponse, null, 2));
      }
    } catch (error) {
      console.log('❌ Repository search test failed:', error);
    }
    
    // More tests only if authenticated
    if (isAuthenticated) {
      // Test 3: Getting file contents (public repo)
      console.log('\nTest 3: Getting file contents...');
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
        console.log('File response received:', JSON.stringify(fileResponse).substring(0, 200) + '...');
        
        if (fileResponse && fileResponse.result && fileResponse.result.content && fileResponse.result.content[0]) {
          const fileContent = JSON.parse(fileResponse.result.content[0].text);
          console.log(`Got file contents, file size: ${fileContent.size || 'unknown'} bytes`);
          console.log('✅ Get file contents test passed');
        } else {
          console.log('❌ Get file contents test failed: Unexpected response format');
          console.log(JSON.stringify(fileResponse, null, 2));
        }
      } catch (error) {
        console.log('❌ Get file contents test failed:', error);
      }
    }
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up
    serverProcess.kill();
  }
};

runTests();