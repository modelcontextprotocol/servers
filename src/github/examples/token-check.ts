#!/usr/bin/env npx tsx
/**
 * Token Check Tool for GitHub Actions Integration
 * 
 * This script helps verify that your GitHub token is valid and has
 * the correct permissions to access GitHub Actions.
 */

import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log(`Loading environment from ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log('No .env file found, using existing environment variables');
  dotenv.config();
}

// Get token from environment
const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!token) {
  console.error('❌ ERROR: No GitHub token found in environment variables');
  console.error('Please create a .env file with your GitHub token:');
  console.error('GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here');
  process.exit(1);
}

// Test for token format
if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
  console.warn('⚠️ WARNING: Your token does not match the expected format');
  console.warn('Valid tokens usually start with "ghp_" or "github_pat_"');
  console.warn('This might still work, but be aware of potential issues');
}

// Types for GitHub API responses
interface GitHubErrorResponse {
  message?: string;
  [key: string]: any;
}

interface GitHubUserResponse {
  login: string;
  id: number;
  [key: string]: any;
}

interface GitHubWorkflowsResponse {
  total_count: number;
  workflows: any[];
  [key: string]: any;
}

// Helper function for GitHub API requests
async function githubRequest(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'GitHub-Token-Check-Tool'
      }
    });

    const data = await response.json() as any;
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, error };
  }
}

async function checkToken() {
  console.log('🔍 Checking GitHub token...');
  
  // Test basic authentication
  const userResponse = await githubRequest('https://api.github.com/user');
  
  if (userResponse.status !== 200) {
    console.error('❌ Authentication failed');
    console.error(`Status: ${userResponse.status}`);
    console.error('Message:', (userResponse.data as GitHubErrorResponse)?.message || 'Unknown error');
    
    if (userResponse.status === 401) {
      console.error('\nYour token is invalid or has expired. Please generate a new one at:');
      console.error('https://github.com/settings/tokens');
    }
    
    process.exit(1);
  }
  
  const userData = userResponse.data as GitHubUserResponse;
  console.log('✅ Authentication successful!');
  console.log(`Authenticated as: ${userData.login}`);
  
  // Check workflow scope by testing access to workflows
  const testRepo = 'facebook/react'; // Public repo to test against
  console.log(`\n🔍 Checking workflow permissions using ${testRepo}...`);
  
  const workflowsResponse = await githubRequest(`https://api.github.com/repos/${testRepo}/actions/workflows`);
  
  if (workflowsResponse.status !== 200) {
    console.error('❌ Workflow access failed');
    console.error(`Status: ${workflowsResponse.status}`);
    console.error('Message:', (workflowsResponse.data as GitHubErrorResponse)?.message || 'Unknown error');
    
    if (workflowsResponse.status === 403) {
      console.error('\nYour token does not have the "workflow" scope. Please generate a new token with the workflow scope at:');
      console.error('https://github.com/settings/tokens');
    }
    
    process.exit(1);
  }
  
  const workflowsData = workflowsResponse.data as GitHubWorkflowsResponse;
  console.log('✅ Workflow access is working!');
  console.log(`Found ${workflowsData.total_count} workflows in ${testRepo}`);
  
  console.log('\n🎉 Your GitHub token is valid and has the correct permissions!');
  console.log('You can now use the GitHub Actions integration.');
}

// Run the token check
checkToken().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
}); 