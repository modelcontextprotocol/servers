/**
 * Session Management Service for Sequential Thinking
 *
 * This service handles session persistence, loading, saving, and session state management.
 */

import { SessionData } from './types.js';

export interface ISessionManagementService {
  loadSession(sessionId: string): Promise<SessionData | null>;
  saveSession(sessionData: SessionData): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  // ... other session management related methods
}

export class SessionManagementService implements ISessionManagementService {
  private storagePath: string;

  constructor(storagePath: string = './sessions') {
    this.storagePath = storagePath;
    // Ensure the sessions directory exists
    const fs = require('fs');
    if (!fs.existsSync(this.storagePath)) {
      try {
        fs.mkdirSync(this.storagePath, { recursive: true });
        console.log(`Created sessions directory at ${this.storagePath}`);
      } catch (error) {
        console.error(`Error creating sessions directory: ${error}`);
      }
    }
  }

  async loadSession(sessionId: string): Promise<SessionData | null> {
    console.log(`Loading session: ${sessionId}`);
    const fs = require('fs');
    const path = require('path');
    const sessionFilePath = path.join(this.storagePath, `${sessionId}.json`);
    
    try {
      if (!fs.existsSync(sessionFilePath)) {
        console.log(`Session file not found: ${sessionFilePath}`);
        return null;
      }
      
      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
      
      // Validate the loaded structure
      if (!this.validateSessionData(sessionData)) {
        console.error(`Invalid session data structure for session ${sessionId}`);
        return null;
      }
      
      return sessionData;
    } catch (error) {
      console.error(`Error loading session ${sessionId}: ${error}`);
      return null;
    }
  }

  async saveSession(sessionData: SessionData): Promise<void> {
    console.log(`Saving session: ${sessionData.id}`);
    const fs = require('fs');
    const path = require('path');
    const sessionFilePath = path.join(this.storagePath, `${sessionData.id}.json`);
    
    try {
      // Add timestamp if not present
      if (!sessionData.updatedAt) {
        sessionData.updatedAt = new Date().toISOString();
      }
      
      fs.writeFileSync(
        sessionFilePath, 
        JSON.stringify(sessionData, null, 2),
        'utf8'
      );
      
      console.log(`Session saved successfully to ${sessionFilePath}`);
    } catch (error) {
      console.error(`Error saving session ${sessionData.id}: ${error}`);
      throw new Error(`Failed to save session: ${error}`);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    console.log(`Deleting session: ${sessionId}`);
    const fs = require('fs');
    const path = require('path');
    const sessionFilePath = path.join(this.storagePath, `${sessionId}.json`);
    
    try {
      if (fs.existsSync(sessionFilePath)) {
        fs.unlinkSync(sessionFilePath);
        console.log(`Session deleted: ${sessionId}`);
      } else {
        console.log(`Session file not found for deletion: ${sessionFilePath}`);
      }
    } catch (error) {
      console.error(`Error deleting session ${sessionId}: ${error}`);
      throw new Error(`Failed to delete session: ${error}`);
    }
  }
  
  private validateSessionData(data: any): boolean {
    // Basic validation of session data structure
    if (!data || typeof data !== 'object') return false;
    if (!data.id || typeof data.id !== 'string') return false;
    if (!data.thoughtHistory || !Array.isArray(data.thoughtHistory)) return false;
    
    return true;
  }
}
