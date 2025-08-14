#!/usr/bin/env node

/**
 * Remote MCP Server pentru Academiadepolitie.com
 * Suportă HTTP/SSE transport pentru Claude Remote Connectors
 * Complet separat de implementarea locală MCP
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { authenticateRequest } from '../auth/oauth.js';
import { handleSSE } from './sse-handler.js';
import { tools } from './tools.js';
import * as oauthManager from './oauth-manager.js';
import * as dcr from './dcr.js';

// Pentru ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://claude.ai'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Servește fișiere statice din public
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  message: 'Too many requests from this IP'
});

app.use('/mcp', limiter);

// Health check endpoint
  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      service: "academiadepolitie-remote-mcp",
      version: "1.0.0",
      status: "ready",
      endpoints: {
        health: "/health",
        oauth_discovery: "/.well-known/oauth-authorization-server",
        oauth_authorize: "/oauth/authorize",
        oauth_token: "/oauth/token",
        mcp: "/mcp"
      }
    });
  });
  
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    service: 'academiadepolitie-remote-mcp',
    timestamp: new Date().toISOString()
  });
});

// OAuth 2.1 Discovery endpoints
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: 'https://mcp.academiadepolitie.com:8443',
    authorization_endpoint: 'https://mcp.academiadepolitie.com:8443/oauth/authorize',
    token_endpoint: 'https://mcp.academiadepolitie.com:8443/oauth/token',
    registration_endpoint: 'https://mcp.academiadepolitie.com:8443/oauth/register',
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: 'https://www.academiadepolitie.com/api/docs',
    ui_locales_supported: ['ro', 'en']
  });
});

// OpenID Configuration endpoint (pentru compatibilitate)
app.get('/.well-known/openid-configuration', (req, res) => {
  res.json({
    issuer: 'https://mcp.academiadepolitie.com:8443',
    authorization_endpoint: 'https://mcp.academiadepolitie.com:8443/oauth/authorize',
    token_endpoint: 'https://mcp.academiadepolitie.com:8443/oauth/token',
    registration_endpoint: 'https://mcp.academiadepolitie.com:8443/oauth/register',
    jwks_uri: 'https://mcp.academiadepolitie.com:8443/.well-known/jwks.json',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256']
  });
});

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: 'https://mcp.academiadepolitie.com:8443',
    authorization_servers: ['https://mcp.academiadepolitie.com:8443']
  });
});

/**
 * Proxy către oauth-bridge.php pentru OAuth endpoints
 */
async function proxyToPHP(endpoint, req, res) {
  return new Promise((resolve, reject) => {
    // Prepare environment variables pentru PHP
    const env = { ...process.env };
    env.REQUEST_METHOD = req.method;
    env.REQUEST_URI = endpoint;
    env.QUERY_STRING = new URLSearchParams(req.query).toString();
    
    // Prepare input data pentru POST requests
    let inputData = '';
    if (req.method === 'POST') {
      inputData = JSON.stringify(req.body);
      env.CONTENT_TYPE = 'application/json';
      env.CONTENT_LENGTH = inputData.length.toString();
    }
    
    const php = spawn('php', ['/opt/mcp-server/oauth-bridge.php'], { 
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    php.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    php.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    php.on('close', (code) => {
      if (code === 0) {
        // Parse PHP output pentru headers și body
        const parts = output.split('\n\n');
        const headers = parts[0] || '';
        const body = parts.slice(1).join('\n\n');
        
        // Verifică pentru Location header (redirect) - IMPORTANT pentru OAuth!
        const locationMatch = headers.match(/Location:\s*(.+)/i);
        if (locationMatch) {
          const redirectUrl = locationMatch[1].trim();
          console.log('PHP Redirect detected:', redirectUrl);
          res.redirect(302, redirectUrl);
          resolve();
          return;
        }
        
        // Set response headers
        if (headers.includes('Content-Type: application/json')) {
          res.set('Content-Type', 'application/json');
        }
        
        // Send response
        if (!res.headersSent) { res.send(body || output); }
        resolve();
      } else {
        console.error('PHP Error:', errorOutput);
        res.status(500).json({ error: 'OAuth proxy error' });
        reject(new Error(errorOutput));
      }
    });
    
    // Send POST data to PHP if present
    if (inputData) {
      php.stdin.write(inputData);
    }
    php.stdin.end();
  });
}

// OAuth endpoints cu autentificare reală
app.get('/oauth/authorize', async (req, res) => {
  try {
    const { client_id, redirect_uri, state, code_challenge, resource } = req.query;
    
    // MCP Auth Spec 2025-06-18: resource parameter este OBLIGATORIU
    if (!client_id || !redirect_uri || !resource) {
      return res.status(400).json({ 
        error: 'invalid_request', 
        description: 'Missing required parameters: client_id, redirect_uri, and resource are mandatory per MCP Auth Spec 2025-06-18' 
      });
    }
    
    // Validare resource parameter - trebuie să fie URL-ul serverului nostru
    const expectedResource = 'https://mcp.academiadepolitie.com:8443';
    if (resource !== expectedResource) {
      return res.status(400).json({ 
        error: 'invalid_target', 
        description: `Invalid resource parameter. Expected: ${expectedResource}` 
      });
    }
    
    // Verifică dacă user-ul are sesiune activă
    const sessionId = req.cookies.mcp_session;
    const session = sessionId ? oauthManager.getSession(sessionId) : null;
    
    if (session && session.userId) {
      // User autentificat - generează authorization code
      const authCode = oauthManager.generateAuthCode(
        session.userId,
        client_id,
        redirect_uri,
        code_challenge
      );
      
      // Construiește URL redirect
      let callbackUrl = redirect_uri + '?code=' + encodeURIComponent(authCode);
      if (state) {
        callbackUrl += '&state=' + encodeURIComponent(state);
      }
      
      console.log(`OAuth: User ${session.userId} authorized, redirecting to:`, callbackUrl);
      
      // HTTP 302 redirect
      return res.redirect(302, callbackUrl);
    } else {
      // User neautentificat - redirect la login page
      const loginUrl = `/login.html?${new URLSearchParams({
        client_id,
        redirect_uri,
        state: state || '',
        code_challenge: code_challenge || ''
      }).toString()}`;
      
      console.log('OAuth: User not authenticated, redirecting to login:', loginUrl);
      return res.redirect(302, loginUrl);
    }
  } catch (error) {
    console.error('OAuth authorize error:', error);
    res.status(500).json({ error: 'server_error', description: error.message });
  }
});

// OAuth token exchange endpoint
app.post('/oauth/token', async (req, res) => {
  try {
    // Debug logging pentru Claude
    console.log('OAuth Token Request from Claude:');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Headers:', req.headers);
    
    const { grant_type, code, client_id, client_secret, redirect_uri, code_verifier, resource } = req.body;
    
    // Validare grant type
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ 
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported'
      });
    }
    
    // MCP Auth Spec 2025-06-18: resource parameter obligatoriu și în token request
    if (!code || !client_id || !resource) {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Missing required parameters: code, client_id, and resource are mandatory per MCP Auth Spec 2025-06-18'
      });
    }
    
    // Validare resource parameter - trebuie să fie URL-ul serverului nostru
    const expectedResource = 'https://mcp.academiadepolitie.com:8443';
    if (resource !== expectedResource) {
      return res.status(400).json({ 
        error: 'invalid_target', 
        error_description: `Invalid resource parameter. Expected: ${expectedResource}` 
      });
    }
    
    // Validare client cu DCR
    const clientValidation = dcr.validateClient(client_id, client_secret);
    if (!clientValidation.valid) {
      console.log('OAuth Token: Invalid client:', client_id);
      // MCP Auth Spec 2025-06-18: WWW-Authenticate header pentru 401
      res.set('WWW-Authenticate', `Bearer realm="https://mcp.academiadepolitie.com:8443", error="invalid_client", error_description="${clientValidation.error}"`);
      return res.status(401).json({
        error: 'invalid_client',
        error_description: clientValidation.error
      });
    }
    
    // Validează authorization code
    const validation = oauthManager.validateAuthCode(code, client_id, redirect_uri, code_verifier);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        error: validation.error,
        error_description: validation.description
      });
    }
    
    // Generează access token cu audience validation (MCP Auth Spec 2025-06-18)
    const tokenData = oauthManager.generateAccessToken(validation.userId, client_id, resource);
    
    console.log(`OAuth: Token generated for user ${validation.userId}`);
    
    // Returnează token
    res.json(tokenData);
  } catch (error) {
    console.error('OAuth token error:', error);
    res.status(500).json({ 
      error: 'server_error',
      error_description: error.message
    });
  }
});

// OAuth login endpoint
app.post('/oauth/login', async (req, res) => {
  try {
    const { username, password, remember, client_id, redirect_uri, state, code_challenge } = req.body;
    
    // Verifică credențialele
    const authResult = await oauthManager.verifyCredentials(username, password);
    
    if (!authResult.valid) {
      // MCP Auth Spec 2025-06-18: WWW-Authenticate header pentru 401
      res.set('WWW-Authenticate', `Bearer realm="https://mcp.academiadepolitie.com:8443", error="invalid_credentials"`);
      return res.status(401).json({ 
        error: authResult.error || 'Invalid credentials'
      });
    }
    
    // Creează sesiune
    const sessionId = oauthManager.createSession(authResult.user.id, authResult.user);
    
    // Setează cookie sesiune
    res.cookie('mcp_session', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000 // 30 zile sau 1 oră
    });
    
    // Generează authorization code
    const authCode = oauthManager.generateAuthCode(
      authResult.user.id,
      client_id,
      redirect_uri,
      code_challenge
    );
    
    // Construiește URL redirect
    let callbackUrl = redirect_uri + '?code=' + encodeURIComponent(authCode);
    if (state) {
      callbackUrl += '&state=' + encodeURIComponent(state);
    }
    
    console.log(`OAuth: User ${authResult.user.username} logged in successfully`);
    
    // Returnează URL pentru redirect
    res.json({ 
      success: true,
      redirect_url: callbackUrl
    });
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({ 
      error: 'Authentication service error'
    });
  }
});

// Dynamic Client Registration endpoint
app.post('/oauth/register', async (req, res) => {
  try {
    console.log('DCR Request:', JSON.stringify(req.body, null, 2));
    
    const result = dcr.registerClient(req.body);
    
    if (result.error) {
      return res.status(400).json(result);
    }
    
    // Return client registration response
    res.status(201).json(result);
  } catch (error) {
    console.error('DCR Error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error.message
    });
  }
});

app.all('/oauth/login', async (req, res) => {
  try {
    await proxyToPHP('/oauth/login', req, res);
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// TEST endpoint pentru MCP Inspector (fără autentificare)
app.post('/mcp-test', async (req, res) => {
  try {
    const testUser = {
      id: 4001,
      username: 'test',
      api_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhY2FkZW1pYWRlcG9saXRpZS5jb20iLCJhdWQiOiJhcGktdXNlcnMiLCJpYXQiOjE3NTQ2NTAwMTgsImV4cCI6MTc4NjE4NjAxOCwidXNlcl9pZCI6NDAwMSwiZ3J1cCI6MywicGVybWlzc2lvbnMiOlsicHJvZmlsZSIsInNlYXJjaCIsImludGVyYWN0aXZlIiwicHJvZ3Jlc3MiXSwicmF0ZV9saW1pdCI6NTAwLCJlbmRwb2ludHMiOlsiZ2V0X3N0dWRlbnRfZGF0YSIsInNlYXJjaF9hcnRpY2xlcyIsImdldF9hcnRpY2xlX2NvbnRlbnQiLCJhZGRfbm90ZSIsInNlbmRfY2hhbGxlbmdlIiwidXBkYXRlX3JlYWRpbmdfcHJvZ3Jlc3MiXX0.n5Mwa_KZpfYyp2ym_SJZgpHpoCPJ1MdlLI90wpfOxmY'
    };
    const result = await handleJSONRPC(req.body, testUser);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: error.code || -32603,
        message: error.message
      },
      id: req.body.id || null
    });
  }
});

// MCP Protocol endpoints (HTTP + SSE)
app.post('/mcp', authenticateRequest, async (req, res) => {
  const acceptHeader = req.headers.accept || '';
  
  // Verifică dacă clientul vrea SSE
  if (acceptHeader.includes('text/event-stream')) {
    // Upgrade la SSE pentru streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    handleSSE(req, res);
  } else {
    // Regular HTTP JSON-RPC response
    try {
      const result = await handleJSONRPC(req.body, req.user);
      res.json(result);
    } catch (error) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: error.code || -32603,
          message: error.message
        },
        id: req.body.id || null
      });
    }
  }
});

// JSON-RPC handler pentru regular HTTP
async function handleJSONRPC(request, user) {
  const { method, params, id } = request;
  
  switch (method) {
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        result: {
          tools: tools.getToolDefinitions()
        },
        id
      };
      
    case 'tools/call':
      const toolName = params?.name;
      const args = params?.arguments || {};
      
      if (!toolName) {
        throw new McpError(ErrorCode.InvalidParams, 'Tool name required');
      }
      
      // Adaugă user context la args
      args._user = user;
      
      const result = await tools.executeTool(toolName, args);
      
      return {
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
      };
      
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Method ${method} not found`);
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Remote MCP Server running on port ${PORT}`);
  console.log(`🔒 OAuth endpoints ready at https://mcp.academiadepolitie.com:8443`);
  console.log(`📡 Accepting connections from: ${process.env.ALLOWED_ORIGINS}`);
  console.log(`🔐 PHP OAuth Bridge: /opt/mcp-server/oauth-bridge.php`);
  console.log(`\n✅ Ready for Claude Remote Connectors!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});