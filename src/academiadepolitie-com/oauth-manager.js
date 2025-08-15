/**
 * OAuth Manager pentru Remote MCP - Gestionează autentificarea și token-urile
 */

import crypto from 'crypto';
import fetch from 'node-fetch';

// Store pentru authorization codes și tokens (în producție ar fi Redis/DB)
const authCodes = new Map();
const accessTokens = new Map();
const sessions = new Map();

/**
 * Generează un code challenge pentru PKCE
 */
export function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Verifică code challenge pentru PKCE
 */
export function verifyCodeChallenge(verifier, challenge) {
  const expectedChallenge = generateCodeChallenge(verifier);
  return expectedChallenge === challenge;
}

/**
 * Generează authorization code
 */
export function generateAuthCode(userId, clientId, redirectUri, codeChallenge) {
  const code = 'code_' + crypto.randomBytes(32).toString('hex');
  
  // Salvează code-ul cu metadata (expiră în 10 minute)
  authCodes.set(code, {
    userId,
    clientId, 
    redirectUri,
    codeChallenge,
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000 // 10 minute
  });
  
  // Cleanup codes expirate
  setTimeout(() => authCodes.delete(code), 600000);
  
  return code;
}

/**
 * Validează authorization code
 */
export function validateAuthCode(code, clientId, redirectUri, codeVerifier) {
  const codeData = authCodes.get(code);
  
  if (!codeData) {
    return { valid: false, error: 'invalid_grant', description: 'Invalid authorization code' };
  }
  
  // Verifică expirarea
  if (Date.now() > codeData.expiresAt) {
    authCodes.delete(code);
    return { valid: false, error: 'invalid_grant', description: 'Authorization code expired' };
  }
  
  // Verifică client_id
  if (codeData.clientId !== clientId) {
    return { valid: false, error: 'invalid_client', description: 'Client ID mismatch' };
  }
  
  // Verifică redirect_uri
  if (codeData.redirectUri !== redirectUri) {
    return { valid: false, error: 'invalid_grant', description: 'Redirect URI mismatch' };
  }
  
  // Verifică PKCE challenge dacă există
  if (codeData.codeChallenge && codeVerifier) {
    if (!verifyCodeChallenge(codeVerifier, codeData.codeChallenge)) {
      return { valid: false, error: 'invalid_grant', description: 'PKCE verification failed' };
    }
  }
  
  // Code valid - șterge-l (single use)
  authCodes.delete(code);
  
  return { valid: true, userId: codeData.userId };
}

/**
 * Generează JWT access token cu audience validation (MCP Auth Spec 2025-06-18)
 */
export function generateAccessToken(userId, clientId, resourceUrl = 'https://mcp.academiadepolitie.com:8443') {
  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  
  // Salvează token cu metadata inclusiv audience
  accessTokens.set(token, {
    userId,
    clientId,
    audience: resourceUrl, // MCP Auth Spec 2025-06-18: audience OBLIGATORIU
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000 // 24 ore
  });
  
  // Cleanup după expirare
  setTimeout(() => accessTokens.delete(token), 86400000);
  
  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: 86400,
    scope: 'mcp',
    audience: resourceUrl // Include audience în response
  };
}

/**
 * Validează access token cu audience validation (MCP Auth Spec 2025-06-18)
 */
export function validateAccessToken(token, expectedAudience = 'https://mcp.academiadepolitie.com:8443') {
  // Elimină "Bearer " dacă există
  const cleanToken = token.replace('Bearer ', '');
  
  const tokenData = accessTokens.get(cleanToken);
  
  if (!tokenData) {
    return { valid: false, error: 'Invalid token' };
  }
  
  if (Date.now() > tokenData.expiresAt) {
    accessTokens.delete(cleanToken);
    return { valid: false, error: 'Token expired' };
  }
  
  // MCP Auth Spec 2025-06-18: Validare strictă audience
  if (tokenData.audience !== expectedAudience) {
    return { 
      valid: false, 
      error: `Token audience mismatch. Expected: ${expectedAudience}, Got: ${tokenData.audience}` 
    };
  }
  
  return { 
    valid: true, 
    userId: tokenData.userId,
    audience: tokenData.audience,
    clientId: tokenData.clientId
  };
}

/**
 * Creează sesiune pentru user
 */
export function createSession(userId, userData) {
  const sessionId = 'sess_' + crypto.randomBytes(32).toString('hex');
  
  sessions.set(sessionId, {
    userId,
    userData,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000 // 1 oră
  });
  
  // Cleanup după expirare
  setTimeout(() => sessions.delete(sessionId), 3600000);
  
  return sessionId;
}

/**
 * Verifică sesiune
 */
export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  
  return session;
}

/**
 * Verifică credențiale cu API-ul academiadepolitie.com
 */
export async function verifyCredentials(username, password) {
  // TEST TEMPORAR - pentru a verifica flow-ul OAuth
  // Acceptă credențiale de test pentru verificare
  if (username === 'test' && password === 'test123') {
    console.log('OAuth: Test user authenticated successfully');
    return {
      valid: true,
      user: {
        id: 4001,
        username: 'test', 
        email: 'test@academiadepolitie.com',
        name: 'Test User',
        api_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhY2FkZW1pYWRlcG9saXRpZS5jb20iLCJhdWQiOiJhcGktdXNlcnMiLCJpYXQiOjE3NTQ2NTAwMTgsImV4cCI6MTc4NjE4NjAxOCwidXNlcl9pZCI6NDAwMSwiZ3J1cCI6MywicGVybWlzc2lvbnMiOlsicHJvZmlsZSIsInNlYXJjaCIsImludGVyYWN0aXZlIiwicHJvZ3Jlc3MiXSwicmF0ZV9saW1pdCI6NTAwLCJlbmRwb2ludHMiOlsiZ2V0X3N0dWRlbnRfZGF0YSIsInNlYXJjaF9hcnRpY2xlcyIsImdldF9hcnRpY2xlX2NvbnRlbnQiLCJhZGRfbm90ZSIsInNlbmRfY2hhbGxlbmdlIiwidXBkYXRlX3JlYWRpbmdfcHJvZ3Jlc3MiXX0.n5Mwa_KZpfYyp2ym_SJZgpHpoCPJ1MdlLI90wpfOxmY'
      }
    };
  }
  
  // Pentru orice alte credențiale, încearcă API-ul real (care momentan nu funcționează)
  console.log(`OAuth: Authentication attempt for user: ${username}`);
  
  try {
    // Apelează API-ul intern pentru verificare credențiale
    const response = await fetch('https://www.academiadepolitie.com/api/internal/verify_login.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.API_KEY || ''
      },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      console.error('OAuth: API returned error status:', response.status);
      return { valid: false, error: 'Authentication failed' };
    }
    
    const data = await response.json();
    
    if (data.success && data.user) {
      console.log('OAuth: User authenticated via API:', data.user.username);
      return { 
        valid: true, 
        user: {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          name: data.user.name,
          api_token: data.user.api_token || data.user.token
        }
      };
    }
    
    return { valid: false, error: data.error || 'Invalid credentials' };
  } catch (error) {
    console.error('OAuth: Error verifying credentials:', error.message);
    // Returnează eroare
    return { valid: false, error: 'Authentication service unavailable' };
  }
}