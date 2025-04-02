import { ThoughtProcessingState, ProcessingStage } from './types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Define directory for saving session states
const STATE_SAVE_DIR = path.join(os.homedir(), '.sequential-thinking', 'states');

// Ensure the state save directory exists
if (!fs.existsSync(STATE_SAVE_DIR)) {
  try {
    fs.mkdirSync(STATE_SAVE_DIR, { recursive: true });
    console.log(`Created state persistence directory: ${STATE_SAVE_DIR}`);
  } catch (error) {
    console.error(`Error creating state persistence directory: ${error instanceof Error ? error.message : String(error)}`);
    // Depending on requirements, might want to throw or handle differently
  }
}

/**
 * Retrieves or initializes the processing state for a given session ID from storage.
 * Placeholder implementation using local files.
 * @param sessionId The ID of the session.
 * @returns A Promise resolving to the ThoughtProcessingState for the session.
 */
export async function getOrInitProcessingState(
  sessionId: string
): Promise<ThoughtProcessingState> {
  const filePath = path.join(STATE_SAVE_DIR, `${sessionId}-state.json`);

  try {
    if (fs.existsSync(filePath)) {
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      const state = JSON.parse(fileContent) as ThoughtProcessingState;
      console.log(`Processing state loaded for session: ${sessionId}`);
      
      // Validate the loaded state structure
      if (!validateProcessingState(state)) {
        console.warn(`Invalid state structure for session ${sessionId}, initializing new state`);
        return initializeNewState(sessionId);
      }
      
      return state;
    }
  } catch (error) {
    console.error(`Error loading processing state for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    // Fall through to initialize if loading fails
  }

  return initializeNewState(sessionId);
}

/**
 * Validates a processing state to ensure it has the required structure.
 * @param state The state to validate.
 * @returns True if the state is valid, false otherwise.
 */
function validateProcessingState(state: any): boolean {
  if (!state || typeof state !== 'object') return false;
  
  // Check required properties
  if (typeof state.stage !== 'string') return false;
  if (!Array.isArray(state.workingMemory)) return false;
  if (typeof state.currentThoughtNumber !== 'number') return false;
  if (!state.sessionMetadata || typeof state.sessionMetadata !== 'object') return false;
  
  // Validate stage is a valid enum value
  const validStages = Object.values(ProcessingStage);
  if (!validStages.includes(state.stage as ProcessingStage)) return false;
  
  return true;
}

/**
 * Initializes a new processing state for a session.
 * @param sessionId The ID of the session.
 * @returns A new ThoughtProcessingState.
 */
function initializeNewState(sessionId: string): ThoughtProcessingState {
  console.warn(`Initializing new processing state for session: ${sessionId}`);
  
  const initialState: ThoughtProcessingState = {
    stage: ProcessingStage.PREPARATION,
    workingMemory: [],
    currentThoughtNumber: 0, // Will be updated when a thought is processed
    sessionMetadata: {
      createdAt: new Date().toISOString(),
      sessionId: sessionId
    },
  };
  
  return initialState;
}

/**
 * Saves the processing state for a given session ID to storage.
 * Placeholder implementation using local files.
 * @param sessionId The ID of the session.
 * @param state The ThoughtProcessingState to save.
 * @returns A Promise resolving when the state is saved.
 */
export async function saveProcessingState(
  sessionId: string,
  state: ThoughtProcessingState
): Promise<void> {
  const filePath = path.join(STATE_SAVE_DIR, `${sessionId}-state.json`);
  try {
    const stateJson = JSON.stringify(state, null, 2); // Pretty-print JSON
    await fs.promises.writeFile(filePath, stateJson, 'utf8');
    // console.log(`Processing state saved for session: ${sessionId} to ${filePath}`);
  } catch (error) {
    console.error(`Error saving processing state for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    // Handle error appropriately (e.g., retry, log, notify)
  }
}
