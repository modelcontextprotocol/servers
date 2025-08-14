/**
 * Dynamic Client Registration pentru Remote MCP
 * Permite Claude să se înregistreze automat
 */

import crypto from 'crypto';

// Store pentru clienți înregistrați
const registeredClients = new Map();

// Client pre-înregistrat pentru Claude
registeredClients.set('claude', {
  client_id: 'claude',
  client_secret: 'claude_secret_2025',
  client_name: 'Claude',
  redirect_uris: [
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'https://claude.anthropic.com/api/mcp/auth_callback'
  ],
  grant_types: ['authorization_code'],
  response_types: ['code'],
  scope: 'mcp',
  created_at: Date.now()
});

/**
 * Înregistrează un client nou
 */
export function registerClient(clientData) {
  const {
    client_name,
    redirect_uris,
    grant_types = ['authorization_code'],
    response_types = ['code'],
    scope = 'mcp',
    token_endpoint_auth_method = 'client_secret_post'
  } = clientData;
  
  // Validare
  if (!client_name || !redirect_uris || redirect_uris.length === 0) {
    return {
      error: 'invalid_client_metadata',
      error_description: 'client_name and redirect_uris are required'
    };
  }
  
  // Generează client credentials
  const client_id = 'client_' + crypto.randomBytes(16).toString('hex');
  const client_secret = crypto.randomBytes(32).toString('hex');
  
  // Salvează client
  const client = {
    client_id,
    client_secret,
    client_name,
    redirect_uris,
    grant_types,
    response_types,
    scope,
    token_endpoint_auth_method,
    created_at: Date.now(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0 // Never expires
  };
  
  registeredClients.set(client_id, client);
  
  console.log(`DCR: Registered new client: ${client_name} (${client_id})`);
  
  return client;
}

/**
 * Obține un client înregistrat
 */
export function getClient(clientId) {
  return registeredClients.get(clientId);
}

/**
 * Validează client credentials
 */
export function validateClient(clientId, clientSecret) {
  const client = registeredClients.get(clientId);
  
  if (!client) {
    return { valid: false, error: 'Client not found' };
  }
  
  // Pentru Claude, acceptăm fără secret
  if (clientId === 'claude') {
    return { valid: true, client };
  }
  
  if (clientSecret && client.client_secret !== clientSecret) {
    return { valid: false, error: 'Invalid client secret' };
  }
  
  return { valid: true, client };
}

/**
 * Validează redirect URI
 */
export function validateRedirectUri(clientId, redirectUri) {
  const client = registeredClients.get(clientId);
  
  if (!client) {
    return false;
  }
  
  // Pentru Claude, acceptăm orice redirect către claude.ai
  if (clientId === 'claude' && redirectUri.startsWith('https://claude.')) {
    return true;
  }
  
  return client.redirect_uris.includes(redirectUri);
}

/**
 * Șterge un client
 */
export function deleteClient(clientId) {
  const deleted = registeredClients.delete(clientId);
  if (deleted) {
    console.log(`DCR: Deleted client: ${clientId}`);
  }
  return deleted;
}