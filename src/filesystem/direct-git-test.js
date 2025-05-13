#!/usr/bin/env node

/**
 * Direct test for the Git integration feature
 * 
 * This script directly tests the Git validation functionality without going through 
 * the MCP server protocol, which simplifies testing.
 * 
 * Run with: node direct-git-test.js
 */

import { simpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Git validation utilities (copy from actual implementation)
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

// Check if the Git status allows modification based on configuration
async function validateGitStatus(filePath, requireCleanBranch) {
  const { isRepo, isClean, repoPath } = await isGitClean(filePath);
  
  if (isRepo && requireCleanBranch && !isClean) {
    throw new Error(
      `Git repository at ${repoPath} has uncommitted changes. ` + 
      `Server is configured to require a clean branch before allowing changes.`
    );
  }

  return { isRepo, isClean, repoPath };
}

// Simulate file operations with Git validation
async function writeFileWithGitCheck(filePath, content, requireCleanBranch) {
  try {
    await validateGitStatus(filePath, requireCleanBranch);
    await fs.writeFile(filePath, content);
    return { success: true, message: `Successfully wrote to ${filePath}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create test repository
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

// Run all the test cases
async function runTests() {
  try {
    console.log('Creating test repository...');
    const { repoPath, testFile } = await createTestRepo();

    // ====== TEST CASE 1: Write to clean repository with Git validation disabled ======
    console.log('\n====== TEST CASE 1: Write to clean repository with Git validation disabled ======');
    const result1 = await writeFileWithGitCheck(testFile, 'Modified content 1', false);
    console.log('Result:', result1);
    console.log('Expected: Should succeed because Git validation is disabled');

    // ====== TEST CASE 2: Modify file to make repository dirty ======
    console.log('\n====== TEST CASE 2: Modify file to make repository dirty ======');
    await fs.writeFile(testFile, 'Direct modification to make repo dirty');
    const gitStatus = await isGitClean(testFile);
    console.log('Git status:', gitStatus);
    console.log('Expected: isClean should be false');

    // ====== TEST CASE 3: Write to dirty repository with Git validation enabled ======
    console.log('\n====== TEST CASE 3: Write to dirty repository with Git validation enabled ======');
    const result3 = await writeFileWithGitCheck(testFile, 'Modified content 3', true);
    console.log('Result:', result3);
    console.log('Expected: Should fail because repository is dirty and Git validation is enabled');

    // ====== TEST CASE 4: Commit changes to make repository clean again ======
    console.log('\n====== TEST CASE 4: Commit changes to make repository clean again ======');
    const git = simpleGit(repoPath);
    await git.add('test.txt');
    await git.commit('Second commit');
    const cleanStatus = await isGitClean(testFile);
    console.log('Git status after commit:', cleanStatus);
    console.log('Expected: isClean should be true');

    // ====== TEST CASE 5: Write to clean repository with Git validation enabled ======
    console.log('\n====== TEST CASE 5: Write to clean repository with Git validation enabled ======');
    const result5 = await writeFileWithGitCheck(testFile, 'Modified content 5', true);
    console.log('Result:', result5);
    console.log('Expected: Should succeed because repository is clean and Git validation is enabled');

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
