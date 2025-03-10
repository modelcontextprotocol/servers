import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { TestContext } from 'vitest';
import * as actions from '../operations/actions.js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { GitHubAuthenticationError } from '../common/errors.js';

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log(`Loading environment from ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log('No .env file found, using existing environment variables');
  dotenv.config();
}

// Check for token and setup test flags
const hasToken = !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const tokenValue = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
const validTokenFormat = tokenValue.startsWith('ghp_') || tokenValue.startsWith('github_pat_');
const testOwner = process.env.E2E_TEST_OWNER || 'facebook';
const testRepo = process.env.E2E_TEST_REPO || 'react';

// Setup conditional testing
const runTests = hasToken;
const itWithToken = runTests ? it : it.skip;

describe('GitHub Actions API E2E Tests', () => {
  beforeAll(() => {
    if (!hasToken) {
      console.warn('⚠️ Skipping GitHub Actions E2E tests - GITHUB_PERSONAL_ACCESS_TOKEN not found');
      console.warn('To run these tests, please create a .env file with your GitHub token');
      return;
    } 
    
    if (!validTokenFormat) {
      console.warn('⚠️ Warning: Your GitHub token does not appear to be in the correct format');
      console.warn('Valid tokens typically start with "ghp_" or "github_pat_"');
      console.warn('You may encounter "Bad credentials" errors if the token is invalid');
    }
    
    console.log(`🔍 Running E2E tests against ${testOwner}/${testRepo}`);
  });

  afterEach((context: TestContext) => {
    // @ts-ignore - The error property exists at runtime even if not in the type definitions
    if (context.error instanceof GitHubAuthenticationError) {
      console.error('\n❌ Authentication Error: Bad Credentials');
      console.error('This means your GitHub token is invalid, expired, or lacks permissions');
      console.error('To fix this:');
      console.error('1. Go to https://github.com/settings/tokens');
      console.error('2. Generate a new Personal Access Token with the "workflow" scope');
      console.error('3. Update your .env file with the new token');
      console.error('4. Run the tests again\n');
    }
  });

  itWithToken('should list workflows from a real repository', async () => {
    const result = await actions.listWorkflows(testOwner, testRepo);
    expect(result).toBeDefined();
    expect(result.total_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.workflows)).toBe(true);
    console.log(`Found ${result.total_count} workflows`);
  });

  itWithToken('should fetch workflow runs from a real repository', async () => {
    const result = await actions.listWorkflowRuns(testOwner, testRepo);
    expect(result).toBeDefined();
    expect(result.total_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.workflow_runs)).toBe(true);
    console.log(`Found ${result.total_count} workflow runs`);
  });

  itWithToken('should fetch and potentially find failed runs', async () => {
    const result = await actions.getRecentFailedRuns(testOwner, testRepo, 3);
    expect(Array.isArray(result)).toBe(true);
    console.log(`Found ${result.length} failed workflow runs`);
    
    // We don't want to fail the test if there are no failures (that's good!)
    if (result.length > 0) {
      const failedRun = result[0];
      expect(failedRun.run).toBeDefined();
      expect(failedRun.run.id).toBeDefined();
      expect(failedRun.run.conclusion).toBe('failure');
      expect(Array.isArray(failedRun.failed_jobs)).toBe(true);
    }
  });
}); 