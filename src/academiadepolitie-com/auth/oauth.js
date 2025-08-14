/**
 * OAuth 2.1 Implementation pentru Remote MCP
 * Conform specificațiilor Claude Remote Connectors
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Store pentru auth codes și tokens (în producție folosește Redis/DB)
const authStore = new Map();
const tokenStore = new Map();

/**
 * Middleware pentru autentificare request-uri
 */
export async function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid authorization header'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Verifică JWT token (generat de PHP oauth-bridge.php)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Token-urile PHP sunt self-contained, nu au nevoie de store
    // Verificăm doar dacă nu a expirat
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }
    
    // Adaugă user info la request conform structurii PHP
    req.user = {
      userId: decoded.userId || decoded.sub,
      username: decoded.username,
      email: decoded.email,
      permissions: ['read', 'write', 'tools'], // Default permissions
      scope: 'mcp_access'
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: error.message
    });
  }
}

/**
 * Authorization endpoint - inițiază OAuth flow
 */
export async function handleAuthorize(req, res) {
  const {
    response_type,
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    scope
  } = req.query;
  
  // Validări
  if (response_type !== 'code') {
    return res.status(400).json({
      error: 'unsupported_response_type',
      error_description: 'Only authorization code flow is supported'
    });
  }
  
  if (!code_challenge || code_challenge_method !== 'S256') {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'PKCE with S256 is required'
    });
  }
  
  // Verifică client_id
  if (client_id !== process.env.OAUTH_CLIENT_ID) {
    return res.status(400).json({
      error: 'invalid_client',
      error_description: 'Unknown client'
    });
  }
  
  // În producție, aici ar fi UI pentru login/consent
  // Pentru demo, generăm direct auth code
  const authCode = crypto.randomBytes(32).toString('base64url');
  
  // Salvează auth code cu PKCE challenge
  authStore.set(authCode, {
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    scope: scope || 'read write',
    expiresAt: Date.now() + 600000, // 10 minute
    userId: null // Se va seta după autentificare user
  });
  
  // Pentru demo, redirect direct cu code
  // În producție, aici ar fi login form
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.append('code', authCode);
  if (state) {
    redirectUrl.searchParams.append('state', state);
  }
  
  res.redirect(redirectUrl.toString());
}

/**
 * Token endpoint - schimbă auth code pentru access token
 */
export async function handleToken(req, res) {
  const {
    grant_type,
    code,
    redirect_uri,
    code_verifier,
    client_id,
    client_secret,
    refresh_token
  } = req.body;
  
  // Verifică client credentials
  if (client_id !== process.env.OAUTH_CLIENT_ID || 
      client_secret !== process.env.OAUTH_CLIENT_SECRET) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication failed'
    });
  }
  
  if (grant_type === 'authorization_code') {
    // Exchange auth code pentru token
    const authData = authStore.get(code);
    
    if (!authData) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code'
      });
    }
    
    // Verifică PKCE
    const challenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');
      
    if (challenge !== authData.codeChallenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed'
      });
    }
    
    // Verifică redirect_uri
    if (redirect_uri !== authData.redirectUri) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Redirect URI mismatch'
      });
    }
    
    // Șterge auth code (single use)
    authStore.delete(code);
    
    // Generează tokens
    const accessToken = generateAccessToken(authData);
    const refreshToken = generateRefreshToken(authData);
    
    // Salvează în token store
    tokenStore.set(accessToken, {
      userId: authData.userId,
      scope: authData.scope,
      expiresAt: Date.now() + 3600000 // 1 oră
    });
    
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: authData.scope
    });
    
  } else if (grant_type === 'refresh_token') {
    // Refresh token flow
    // TODO: Implementează refresh token logic
    res.status(501).json({
      error: 'unsupported_grant_type',
      error_description: 'Refresh token not yet implemented'
    });
  } else {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code and refresh_token are supported'
    });
  }
}

/**
 * Generează access token JWT
 */
function generateAccessToken(authData) {
  // În producție, userId vine din sesiunea de autentificare
  const payload = {
    iss: 'https://mcp.academiadepolitie.com',
    aud: 'mcp-api',
    user_id: authData.userId || 4001, // Hardcodat pentru test
    scope: authData.scope,
    permissions: ['read', 'write', 'tools']
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '1h'
  });
}

/**
 * Generează refresh token
 */
function generateRefreshToken(authData) {
  return crypto.randomBytes(32).toString('base64url');
}