#!/usr/bin/env node

/**
 * Simple test script for the Git integration feature
 * 
 * This script tests the basic Git status checking functionality.
 * 
 * Run with: node simple-git-test.js
 */

import { simpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Simple function to test the Git status checking
async function isGitClean(filePath) {
  try {
    // Find the containing git repository (if any)
    let currentPath = path.dirname(filePath);
    let repoPath = null;
    
    // Walk up the directory tree looking for a .git folder
    while (currentPath !== path.parse(currentPath).root) {
      try {
        const gitDir = path.join(currentPath, '.git');
        const gitDirStat = await fs.stat(gitDir);
        if (gitDirStat.isDirectory()) {
          repoPath = currentPath;
          break;
        }
      } catch {
        // .git directory not found at this level, continue up
      }
      
      currentPath = path.dirname(currentPath);
    }
    
    if (!repoPath) {
      return { isRepo: false, isClean: false, repoPath: null };
    }
    
    // Initialize git in the repository path
    const git = simpleGit(repoPath);
    
    // Check if the working directory is clean
    const status = await git.status();
    const isClean = status.isClean();
    
    return { isRepo: true, isClean, repoPath, status };
  } catch (error) {
    console.error('Error checking Git status:', error);
    return { isRepo: false, isClean: false, repoPath: null };
  }
}

async function createTestRepo() {
  // Create a temp directory
  const tempDir = path.join(os.tmpdir(), `git-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  console.log(`Created test directory: ${tempDir}`);
  
  // Initialize Git
  const git = simpleGit(tempDir);
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');
  
  // Create a test file
  const testFile = path.join(tempDir, 'test.txt');
  await fs.writeFile(testFile, 'Initial content');
  
  // Commit the file
  await git.add('test.txt');
  await git.commit('Initial commit');
  
  return { repoPath: tempDir, testFile };
}

async function runTests() {
  try {
    console.log('Creating test repository...');
    const { repoPath, testFile } = await createTestRepo();
    
    console.log('\nTEST 1: Check clean repository status');
    const cleanStatus = await isGitClean(testFile);
    console.log('Repository is clean:', cleanStatus.isClean);
    console.log('Status details:', JSON.stringify(cleanStatus.status, null, 2));
    
    console.log('\nTEST 2: Modify file and check dirty status');
    await fs.writeFile(testFile, 'Modified content');
    const dirtyStatus = await isGitClean(testFile);
    console.log('Repository is clean:', dirtyStatus.isClean);
    console.log('Status details:', JSON.stringify(dirtyStatus.status, null, 2));
    
    console.log('\nTEST 3: Commit changes and check clean status again');
    const git = simpleGit(repoPath);
    await git.add('test.txt');
    await git.commit('Second commit');
    const cleanAgainStatus = await isGitClean(testFile);
    console.log('Repository is clean:', cleanAgainStatus.isClean);
    console.log('Status details:', JSON.stringify(cleanAgainStatus.status, null, 2));
    
    // Clean up
    console.log('\nCleaning up test repository...');
    await fs.rm(repoPath, { recursive: true, force: true });
    console.log('Done!');
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// Run the tests
runTests();
