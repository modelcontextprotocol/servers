/**
 * Test script for the enhanced session management service
 * 
 * This script tests the functionality of the session management service including
 * session creation, persistence, thought management, and branch operations.
 */

import { 
  SessionManagementService,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  listSessions,
  addThought,
  createBranch,
  mergeBranch,
  SessionData // Import SessionData type
} from '../session-management-enhanced.js';
import { ThoughtData } from '../types.js';

// Get singleton instance for direct testing
const sessionManager = SessionManagementService.getInstance();

// Wrap tests in an async function to use await
async function runTests() {
  // Test session creation
  console.log('Testing session creation...');
  const session = await createSession('Test Session', { testKey: 'testValue' });
  console.log('Session created:', session.id);
  console.log('Session name:', session.name);
  console.log('Session metadata:', session.metadata);

  // Test getting session
  console.log('\nTesting getSession()...');
  const retrievedSession = await getSession(session.id);
  console.log('Retrieved session ID matches:', retrievedSession.id === session.id);
  console.log('Retrieved session name:', retrievedSession.name);

  // Test updating session
  console.log('\nTesting updateSession()...');
  const updatedSession = await updateSession(session.id, {
    name: 'Updated Test Session',
    metadata: { ...session.metadata, updatedKey: 'updatedValue' }
  });
  console.log('Updated session name:', updatedSession.name);
  console.log('Updated session metadata:', updatedSession.metadata);

  // Test adding thoughts
  console.log('\nTesting addThought()...');

  // Create a thought
  const thought1: ThoughtData = {
    thought: 'This is the first thought',
    thoughtNumber: 1,
    totalThoughts: 1,
    nextThoughtNeeded: true
  };

  // Add thought to session
  const sessionWithThought = await addThought(session.id, thought1);
  console.log('Session thought history length:', sessionWithThought.thoughtHistory.length);
  console.log('First thought:', sessionWithThought.thoughtHistory[0].thought);

  // Add another thought
  const thought2: ThoughtData = {
    thought: 'This is the second thought',
    thoughtNumber: 2,
    totalThoughts: 2,
    nextThoughtNeeded: true
  };

  const sessionWithTwoThoughts = await addThought(session.id, thought2);
  console.log('Session thought history length:', sessionWithTwoThoughts.thoughtHistory.length);
  console.log('Second thought:', sessionWithTwoThoughts.thoughtHistory[1].thought);

  // Test branch creation
  console.log('\nTesting createBranch()...');
  const branchId = 'test-branch-1';
  const sessionWithBranch = await createBranch(session.id, branchId, 1);
  console.log('Branch created:', branchId);
  console.log('Branches in session:', Object.keys(sessionWithBranch.branches));

  // Add thought to branch
  console.log('\nTesting adding thought to branch...');
  const branchThought: ThoughtData = {
    thought: 'This is a branch thought',
    thoughtNumber: 1,
    totalThoughts: 1,
    nextThoughtNeeded: true,
    branchId: branchId,
    branchFromThought: 1
  };

  const sessionWithBranchThought = await addThought(session.id, branchThought);
  console.log('Branch thought added');
  console.log('Thoughts in branch:', sessionWithBranchThought.branches[branchId].length);
  console.log('Branch thought:', sessionWithBranchThought.branches[branchId][0].thought);

  // Test branch merging
  console.log('\nTesting mergeBranch()...');
  const mergedSession = await mergeBranch(session.id, branchId, 2);
  console.log('Branch merged');
  console.log('Total thoughts after merge:', mergedSession.thoughtHistory.length);
  console.log('Last thought (from branch):', mergedSession.thoughtHistory[mergedSession.thoughtHistory.length - 1].thought);
  console.log('Branch still exists:', branchId in mergedSession.branches);

  // Test listing sessions
  console.log('\nTesting listSessions()...');
  const allSessions = await listSessions();
  console.log('Number of sessions:', allSessions.length);
  console.log('Our session is in the list:', allSessions.some((s: SessionData) => s.id === session.id));

  // Test session deletion
  console.log('\nTesting deleteSession()...');
  const deleted = await deleteSession(session.id);
  console.log('Session deleted:', deleted);

  // Verify session is gone
  console.log('\nVerifying session deletion...');
  const remainingSessions = await listSessions();
  console.log('Number of sessions after deletion:', remainingSessions.length);
  console.log('Our session is gone:', !remainingSessions.some((s: SessionData) => s.id === session.id));

  // Test error handling for non-existent session
  console.log('\nTesting error handling for non-existent session...');
  try {
    await getSession('non-existent-session-id');
    console.error('Error was not thrown as expected');
  } catch (error) {
    console.log('Error was caught as expected');
    console.log('Error message:', error instanceof Error ? error.message : String(error));
  }

  console.log('\nSession management test completed successfully');
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
