/**
 * Server-Sent Events (SSE) Handler pentru Remote MCP
 * Suportă streaming responses pentru Claude
 */

import { tools } from './tools.js';

/**
 * Handle SSE connections pentru streaming
 */
export function handleSSE(req, res) {
  // Setup SSE connection
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  
  // Send initial connection event
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ status: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  
  // Heartbeat pentru menținerea conexiunii
  const heartbeat = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: ${Date.now()}\n\n`);
  }, 30000);
  
  // Handle incoming messages prin request body
  handleStreamRequest(req.body, req.user, res);
  
  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    console.log('SSE connection closed');
  });
}

/**
 * Procesează request-uri streaming
 */
async function handleStreamRequest(request, user, res) {
  const { method, params, id } = request;
  
  try {
    switch (method) {
      case 'tools/list':
        // Send tool list
        const toolList = tools.getToolDefinitions();
        sendSSEMessage(res, 'result', {
          jsonrpc: '2.0',
          result: { tools: toolList },
          id
        });
        break;
        
      case 'tools/call':
        // Execute tool cu streaming updates
        const toolName = params?.name;
        const args = params?.arguments || {};
        
        if (!toolName) {
          sendSSEError(res, 'Invalid params: tool name required', id);
          return;
        }
        
        // Add user context
        args._user = user;
        
        // Send progress event
        sendSSEMessage(res, 'progress', {
          tool: toolName,
          status: 'executing'
        });
        
        try {
          const result = await tools.executeTool(toolName, args, (progress) => {
            // Stream progress updates
            sendSSEMessage(res, 'progress', progress);
          });
          
          // Send final result
          sendSSEMessage(res, 'result', {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            },
            id
          });
        } catch (toolError) {
          sendSSEError(res, toolError.message, id);
        }
        break;
        
      case 'prompts/list':
        // Pentru viitor - prompt templates
        sendSSEMessage(res, 'result', {
          jsonrpc: '2.0',
          result: { prompts: [] },
          id
        });
        break;
        
      case 'resources/list':
        // Pentru viitor - resources
        sendSSEMessage(res, 'result', {
          jsonrpc: '2.0',
          result: { resources: [] },
          id
        });
        break;
        
      default:
        sendSSEError(res, `Method ${method} not found`, id);
    }
  } catch (error) {
    sendSSEError(res, error.message, id);
  }
}

/**
 * Send SSE message
 */
function sendSSEMessage(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Send SSE error
 */
function sendSSEError(res, message, id) {
  sendSSEMessage(res, 'error', {
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: message
    },
    id: id || null
  });
}