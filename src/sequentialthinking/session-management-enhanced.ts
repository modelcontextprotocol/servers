/**
 * Session Management Service for Sequential Thinking MCP Server
 * 
 * This module provides enhanced session management functionality with
 * persistence, recovery, and cleanup mechanisms.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { get } from './config/config.js';
import { logger } from './config/logger.js';
import { SessionError, ErrorType, ErrorSeverity, withErrorHandling } from './config/errors.js';
import { ThoughtData, BranchRecord } from './types.js';

// Session data interface
export interface SessionData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thoughtHistory: ThoughtData[];
  branches: BranchRecord;
  metadata: Record<string, any>;
}

/**
 * Session Management Service class
 */
export class SessionManagementService {
  private static instance: SessionManagementService;
  private sessions: Map<string, SessionData>;
  private saveDir: string;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    this.sessions = new Map<string, SessionData>();
    this.saveDir = get<string>('server.saveDir', path.join(process.cwd(), 'data', 'sessions'));
    
    // Create save directory if it doesn't exist
    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }
    
    // Start auto-save interval
    const autoSaveMinutes = get<number>('server.autoSaveMinutes', 5);
    if (autoSaveMinutes > 0) {
      this.startAutoSave(autoSaveMinutes);
    }
    
    // Start cleanup interval
    const cleanupHours = get<number>('server.sessionCleanupHours', 24);
    if (cleanupHours > 0) {
      this.startCleanup(cleanupHours);
    }
    
    // Load existing sessions
    this.loadSessions();
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): SessionManagementService {
    if (!SessionManagementService.instance) {
      SessionManagementService.instance = new SessionManagementService();
    }
    return SessionManagementService.instance;
  }
  
  /**
   * Create a new session
   * @param name Optional session name
   * @param metadata Optional session metadata
   * @returns The created session data
   */
  public createSession(name?: string, metadata?: Record<string, any>): SessionData {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    
    const session: SessionData = {
      id: sessionId,
      name: name || `Session ${sessionId.substring(0, 8)}`,
      createdAt: now,
      updatedAt: now,
      thoughtHistory: [],
      branches: {},
      metadata: metadata || {}
    };
    
    this.sessions.set(sessionId, session);
    logger.info(`Created new session: ${sessionId}`, { name: session.name });
    
    // Save the session
    this.saveSession(sessionId);
    
    return session;
  }
  
  /**
   * Get a session by ID
   * @param sessionId The session ID
   * @returns The session data
   */
  public getSession(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new SessionError(
        `Session not found: ${sessionId}`,
        ErrorType.SESSION_NOT_FOUND,
        ErrorSeverity.ERROR
      );
    }
    
    return session;
  }
  
  /**
   * Update a session
   * @param sessionId The session ID
   * @param updates Partial session data to update
   * @returns The updated session data
   */
  public updateSession(sessionId: string, updates: Partial<SessionData>): SessionData {
    const session = this.getSession(sessionId);
    
    // Update session data
    const updatedSession: SessionData = {
      ...session,
      ...updates,
      id: sessionId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };
    
    this.sessions.set(sessionId, updatedSession);
    logger.debug(`Updated session: ${sessionId}`);
    
    // Save the session
    this.saveSession(sessionId);
    
    return updatedSession;
  }
  
  /**
   * Delete a session
   * @param sessionId The session ID
   * @returns Whether the session was deleted
   */
  public deleteSession(sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) {
      return false;
    }
    
    this.sessions.delete(sessionId);
    logger.info(`Deleted session: ${sessionId}`);
    
    // Delete session file
    const sessionFile = path.join(this.saveDir, `${sessionId}.json`);
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
    
    return true;
  }
  
  /**
   * List all sessions
   * @returns Array of session data
   */
  public listSessions(): SessionData[] {
    return Array.from(this.sessions.values());
  }
  
  /**
   * Save a session to disk
   * @param sessionId The session ID
   */
  public saveSession(sessionId: string): void {
    try {
      const session = this.getSession(sessionId);
      const sessionFile = path.join(this.saveDir, `${sessionId}.json`);
      
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
      logger.debug(`Saved session to disk: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to save session ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Load sessions from disk
   */
  private loadSessions(): void {
    try {
      if (!fs.existsSync(this.saveDir)) {
        return;
      }
      
      const files = fs.readdirSync(this.saveDir);
      const sessionFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(this.saveDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const session = JSON.parse(data) as SessionData;
          
          // Validate session data
          if (!session.id || !session.createdAt) {
            logger.warn(`Invalid session data in file: ${file}`);
            continue;
          }
          
          this.sessions.set(session.id, session);
          logger.debug(`Loaded session from disk: ${session.id}`);
        } catch (error) {
          logger.warn(`Failed to load session file: ${file}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      logger.info(`Loaded ${this.sessions.size} sessions from disk`);
    } catch (error) {
      logger.error('Failed to load sessions from disk', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Start auto-save interval
   * @param minutes Minutes between auto-saves
   */
  private startAutoSave(minutes: number): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    this.autoSaveInterval = setInterval(() => {
      this.saveAllSessions();
    }, minutes * 60 * 1000);
    
    logger.info(`Auto-save started (interval: ${minutes} minutes)`);
  }
  
  /**
   * Save all sessions to disk
   */
  private saveAllSessions(): void {
    logger.debug(`Auto-saving ${this.sessions.size} sessions`);
    
    for (const sessionId of this.sessions.keys()) {
      this.saveSession(sessionId);
    }
  }
  
  /**
   * Start cleanup interval
   * @param hours Hours between cleanups
   */
  private startCleanup(hours: number): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupSessions();
    }, hours * 60 * 60 * 1000);
    
    logger.info(`Session cleanup started (interval: ${hours} hours)`);
  }
  
  /**
   * Clean up old sessions
   */
  private cleanupSessions(): void {
    const maxAgeDays = get<number>('server.sessionMaxAgeDays', 30);
    if (maxAgeDays <= 0) {
      return;
    }
    
    const now = new Date();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const updatedAt = new Date(session.updatedAt);
      const ageMs = now.getTime() - updatedAt.getTime();
      
      if (ageMs > maxAgeMs) {
        this.deleteSession(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old sessions`);
    }
  }
  
  /**
   * Add a thought to a session
   * @param sessionId The session ID
   * @param thought The thought data
   * @returns The updated session data
   */
  public addThought(sessionId: string, thought: ThoughtData): SessionData {
    const session = this.getSession(sessionId);
    
    // Add thought to history
    const updatedThoughtHistory = [...session.thoughtHistory, thought];
    
    // Update branches if applicable
    let updatedBranches = { ...session.branches };
    
    if (thought.branchId) {
      // Add to existing branch or create new branch
      const branchThoughts = updatedBranches[thought.branchId] || [];
      updatedBranches[thought.branchId] = [...branchThoughts, thought];
    }
    
    // Update session
    return this.updateSession(sessionId, {
      thoughtHistory: updatedThoughtHistory,
      branches: updatedBranches
    });
  }
  
  /**
   * Create a new branch in a session
   * @param sessionId The session ID
   * @param branchId The branch ID
   * @param startThoughtNumber The thought number to branch from
   * @returns The updated session data
   */
  public createBranch(sessionId: string, branchId: string, startThoughtNumber: number): SessionData {
    const session = this.getSession(sessionId);
    
    // Check if branch already exists
    if (session.branches[branchId]) {
      throw new SessionError(
        `Branch already exists: ${branchId}`,
        ErrorType.SESSION_ERROR,
        ErrorSeverity.ERROR
      );
    }
    
    // Check if start thought exists
    const startThought = session.thoughtHistory.find(t => t.thoughtNumber === startThoughtNumber);
    if (!startThought) {
      throw new SessionError(
        `Start thought not found: ${startThoughtNumber}`,
        ErrorType.SESSION_ERROR,
        ErrorSeverity.ERROR
      );
    }
    
    // Create new branch
    const updatedBranches = {
      ...session.branches,
      [branchId]: []
    };
    
    // Update session
    return this.updateSession(sessionId, {
      branches: updatedBranches
    });
  }
  
  /**
   * Merge a branch back into the main thought history
   * @param sessionId The session ID
   * @param branchId The branch ID to merge
   * @param mergePoint The thought number to merge at
   * @returns The updated session data
   */
  public mergeBranch(sessionId: string, branchId: string, mergePoint: number): SessionData {
    const session = this.getSession(sessionId);
    
    // Check if branch exists
    const branchThoughts = session.branches[branchId];
    if (!branchThoughts) {
      throw new SessionError(
        `Branch not found: ${branchId}`,
        ErrorType.SESSION_ERROR,
        ErrorSeverity.ERROR
      );
    }
    
    // Check if merge point exists
    const mergePointExists = session.thoughtHistory.some(t => t.thoughtNumber === mergePoint);
    if (!mergePointExists) {
      throw new SessionError(
        `Merge point not found: ${mergePoint}`,
        ErrorType.SESSION_ERROR,
        ErrorSeverity.ERROR
      );
    }
    
    // Create updated thought history
    const updatedThoughtHistory = [
      ...session.thoughtHistory.filter(t => t.thoughtNumber <= mergePoint),
      ...branchThoughts.map((thought: ThoughtData) => ({
        ...thought,
        mergeBranchId: branchId,
        mergeBranchPoint: mergePoint
      }))
    ];
    
    // Remove the merged branch
    const { [branchId]: _, ...remainingBranches } = session.branches;
    
    // Update session
    return this.updateSession(sessionId, {
      thoughtHistory: updatedThoughtHistory,
      branches: remainingBranches
    });
  }
  
  /**
   * Clean up resources when shutting down
   */
  public shutdown(): void {
    // Save all sessions
    this.saveAllSessions();
    
    // Clear intervals
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.info('Session management service shut down');
  }
}

// Export singleton instance
export const sessionManager = SessionManagementService.getInstance();

// Export convenience functions with error handling
export const createSession = withErrorHandling(
  (name?: string, metadata?: Record<string, any>) => sessionManager.createSession(name, metadata)
);

export const getSession = withErrorHandling(
  (sessionId: string) => sessionManager.getSession(sessionId)
);

export const updateSession = withErrorHandling(
  (sessionId: string, updates: Partial<SessionData>) => sessionManager.updateSession(sessionId, updates)
);

export const deleteSession = withErrorHandling(
  (sessionId: string) => sessionManager.deleteSession(sessionId)
);

export const listSessions = withErrorHandling(
  () => sessionManager.listSessions()
);

export const addThought = withErrorHandling(
  (sessionId: string, thought: ThoughtData) => sessionManager.addThought(sessionId, thought)
);

export const createBranch = withErrorHandling(
  (sessionId: string, branchId: string, startThoughtNumber: number) => 
    sessionManager.createBranch(sessionId, branchId, startThoughtNumber)
);

export const mergeBranch = withErrorHandling(
  (sessionId: string, branchId: string, mergePoint: number) => 
    sessionManager.mergeBranch(sessionId, branchId, mergePoint)
);
