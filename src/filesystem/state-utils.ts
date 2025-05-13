import fs from "fs/promises";

// Define the state interface
interface PromptState {
  checkedThisPrompt: boolean;
  promptId: string | null;
  lastCheckTime: number;
}

// Define a location for the state file
const STATE_FILE_PATH = '/tmp/mcp-filesystem-state.json';

// State management functions
export async function getState(): Promise<PromptState> {
  try {
    const stateData = await fs.readFile(STATE_FILE_PATH, 'utf-8');
    return JSON.parse(stateData);
  } catch (error) {
    // If file doesn't exist or has invalid content, return default state
    return { checkedThisPrompt: false, promptId: null, lastCheckTime: 0 };
  }
}

export async function saveState(state: PromptState): Promise<void> {
  await fs.writeFile(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

// Reset the validation state
export async function resetValidationState(): Promise<void> {
  const state = await getState();
  if (state.checkedThisPrompt) {
    state.checkedThisPrompt = false;
    state.promptId = null;
    await saveState(state);
    // State reset for next prompt
  }
}

// Check if we've already validated in this prompt
export async function hasValidatedInPrompt(promptId?: string): Promise<boolean> {
  const state = await getState();
  
  // Generate a new promptId if one wasn't provided
  promptId = promptId || 'prompt-' + Date.now();
  
  // If this is a new prompt or too much time has passed, reset state
  const now = Date.now();
  const MAX_PROMPT_AGE = 60 * 1000; // 60 seconds
  
  if (state.promptId !== promptId || (now - state.lastCheckTime) > MAX_PROMPT_AGE) {
    state.checkedThisPrompt = false;
    state.promptId = promptId;
  }
  
  // Update last check time
  state.lastCheckTime = now;
  await saveState(state);
  
  return state.checkedThisPrompt;
}

// Mark that we've validated in this prompt
export async function markValidatedInPrompt(promptId?: string): Promise<void> {
  const state = await getState();
  state.checkedThisPrompt = true;
  state.promptId = promptId || 'prompt-' + Date.now();
  state.lastCheckTime = Date.now();
  await saveState(state);
  // Validation marked as complete for prompt
}
