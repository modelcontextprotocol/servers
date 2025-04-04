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
  listSessions(): Promise<{ id: string; name: string; createdAt: string }[]>;
  // ... other session management related methods
 }
 
 // Use fs.promises for async operations
 import { promises as fsPromises, existsSync, mkdirSync } from 'fs';
 import * as path from 'path';
 
 export class SessionManagementService implements ISessionManagementService {
   private storagePath: string;
 
   // Accept storage path, default remains but will be overridden from index.ts
   constructor(storagePath: string) { 
     this.storagePath = storagePath;
     // Ensure the sessions directory exists (using synchronous methods for constructor)
     if (!existsSync(this.storagePath)) {
       try {
         mkdirSync(this.storagePath, { recursive: true });
         console.log(`Created sessions directory at ${this.storagePath}`);
       } catch (error) {
         console.error(`Error creating sessions directory: ${error}`);
      }
    }
  }

   async loadSession(sessionId: string): Promise<SessionData | null> {
     console.log(`Loading session: ${sessionId}`);
     const sessionFilePath = path.join(this.storagePath, `${sessionId}.json`);
     
     try {
       // Use existsSync for check, but readFile for async read
       if (!existsSync(sessionFilePath)) { 
         console.log(`Session file not found: ${sessionFilePath}`);
         return null;
       }
       
       const fileContent = await fsPromises.readFile(sessionFilePath, 'utf8');
       const sessionData = JSON.parse(fileContent);
       
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
     const sessionFilePath = path.join(this.storagePath, `${sessionData.id}.json`);
     
     try {
       let dataToSave = { ...sessionData };
 
       // Preserve original createdAt if session exists
       if (existsSync(sessionFilePath)) {
         try {
           const existingContent = await fsPromises.readFile(sessionFilePath, 'utf8');
           const existingData = JSON.parse(existingContent) as SessionData;
           if (existingData.createdAt) {
             dataToSave.createdAt = existingData.createdAt; // Keep original creation time
           }
         } catch (readError) {
           console.warn(`Could not read existing session file to preserve createdAt: ${readError}`);
           // Proceed without preserving createdAt if read fails
         }
       }
 
       // Ensure createdAt is set if it's missing (for new sessions)
       if (!dataToSave.createdAt) {
         dataToSave.createdAt = new Date().toISOString();
       }
 
       // Always update updatedAt
       dataToSave.updatedAt = new Date().toISOString(); 
       
       // Use async writeFile
       await fsPromises.writeFile(
         sessionFilePath, 
         JSON.stringify(dataToSave, null, 2), // Save the potentially modified data
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
     const sessionFilePath = path.join(this.storagePath, `${sessionId}.json`);
     
     try {
       // Use existsSync for check, but unlink for async delete
       if (existsSync(sessionFilePath)) { 
         await fsPromises.unlink(sessionFilePath);
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
 
   // Add listSessions method
   async listSessions(): Promise<{ id: string; name: string; createdAt: string }[]> {
     const sessions: { id: string; name: string; createdAt: string }[] = [];
     try {
       const files = await fsPromises.readdir(this.storagePath);
       for (const file of files) {
         if (file.endsWith('.json')) {
           try {
             const filePath = path.join(this.storagePath, file);
             const fileContent = await fsPromises.readFile(filePath, 'utf8');
             const sessionData = JSON.parse(fileContent) as SessionData;
             // Basic validation before adding
             if (sessionData.id && sessionData.name && sessionData.createdAt) {
               sessions.push({
                 id: sessionData.id,
                 name: sessionData.name,
                 createdAt: sessionData.createdAt
               });
             } else {
                console.warn(`Skipping invalid session file: ${file}`);
             }
           } catch (readError) {
             console.error(`Error reading session file ${file}: ${readError}`);
           }
         }
       }
     } catch (listError) {
       console.error(`Error listing sessions in ${this.storagePath}: ${listError}`);
       // Depending on requirements, might want to throw or return empty list
     }
     return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort newest first
   }
 }
