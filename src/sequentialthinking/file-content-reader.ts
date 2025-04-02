/**
 * File Content Reader Module for Sequential Thinking
 * 
 * This module provides utilities to read and analyze full file contents
 * for the Sequential Thinking server.
 */

import * as fs from 'fs';
import * as path from 'path';
import { summarizeFileContent } from './file-analyzer.js';

// File extensions to include in content analysis
const CONTENT_ANALYSIS_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', 
  '.md', '.py', '.java', '.c', '.cpp', '.h', '.go',
  '.vue', '.svelte', '.php', '.rb', '.rs', '.scala'
];

// Maximum file size for content analysis (in bytes)
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// Cache for file content to reduce disk I/O
const fileContentCache: Map<string, { content: string; timestamp: number }> = new Map();

// Cache expiration time (5 minutes)
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

// Interface for open file data
export interface OpenFileInfo {
  path: string;
  relativePath: string;
  extension: string;
  size: number;
  content: string;
  summary: string;
}

/**
 * Reads and analyzes currently open files to provide full content
 * Returns both a summary and the complete file data
 */
export async function readOpenFiles(
  openFilePaths: string[],
  rootDir: string
): Promise<{ summary: string; fileData: OpenFileInfo[] }> {
  let result = `Open Files (${openFilePaths.length}):\n`;
  const fileData: OpenFileInfo[] = [];
  
  // Process files in parallel for better performance
  const fileProcessingTasks = openFilePaths.map(async (filePath) => {
    try {
      const relativePath = path.relative(rootDir, filePath);
      const stats = fs.statSync(filePath);
      const extension = path.extname(filePath);
      let content = '';
      let summary = '';
      let fileResult = `  ${relativePath} (${extension}, ${formatFileSize(stats.size)})\n`;
      
      // Check if file is suitable for content analysis
      const isAnalyzable = stats.size < MAX_FILE_SIZE && CONTENT_ANALYSIS_EXTENSIONS.includes(extension);
      
      if (isAnalyzable) {
        // Check cache first
        const cacheKey = `${filePath}:${stats.mtimeMs}`;
        const cachedData = fileContentCache.get(cacheKey);
        const now = Date.now();
        
        if (cachedData && (now - cachedData.timestamp < CACHE_EXPIRY_MS)) {
          // Use cached content
          console.log(`[CACHE] Using cached content for ${relativePath}`);
          content = cachedData.content;
        } else {
          // Read from disk and update cache
          console.log(`[CACHE] Reading from disk: ${relativePath}`);
          content = fs.readFileSync(filePath, 'utf8');
          fileContentCache.set(cacheKey, {
            content,
            timestamp: now
          });
        }
        
        // Create a summary
        summary = await summarizeFileContent(filePath);
        
        // Add summary to result string
        fileResult += `    Summary: ${summary.split('\n')[0]}\n`;
      } else if (stats.size >= MAX_FILE_SIZE) {
        fileResult += `    (File too large to include full content)\n`;
        summary = `File too large (${formatFileSize(stats.size)})`;
      } else {
        summary = `Non-text file (${extension})`;
      }
      
      return {
        fileInfo: {
          path: filePath,
          relativePath,
          extension,
          size: stats.size,
          content,
          summary
        },
        fileResult
      };
    } catch (error) {
      return {
        fileInfo: null,
        fileResult: `  ${filePath} (Error: Could not analyze file)\n`
      };
    }
  });
  
  // Wait for all file processing to complete
  const processedFiles = await Promise.all(fileProcessingTasks);
  
  // Add results to output
  for (const { fileInfo, fileResult } of processedFiles) {
    result += fileResult;
    if (fileInfo) {
      fileData.push(fileInfo);
    }
  }
  
  return { summary: result, fileData };
}

/**
 * Formats file size in a human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Prepare file content for inclusion in prompts
 * Handles token limitations and formats content appropriately
 * @param fileData Array of files with content
 * @param maxTotalTokens Maximum tokens to include
 * @param stepInfo Optional step information for chunked processing
 * @param contextFileNames Optional list of files that are directly relevant to the current context
 */
export function prepareFileContentForPrompt(
  fileData: OpenFileInfo[],
  maxTotalTokens: number = 4000, // Default max tokens for file content
  stepInfo?: { mainStep: number, subStep: number }, // Optional step information for chunked processing
  contextFileNames?: string[] // Optional list of files that are directly relevant to the current context
): string {
  let result = '';
  let estimatedTokens = 0;
  // Use a more precise token estimation based on common GPT tokenizers
  // Different characters have different token costs, but this average works well
  const tokenEstimatePerChar = 0.3; // More conservative estimate: ~3.33 chars per token
  
  // Sort files by importance with advanced prioritization
  const sortedFiles = [...fileData].sort((a, b) => {
    // Calculate priority scores for both files
    let scoreA = 0;
    let scoreB = 0;
    
    // 1. Context-aware prioritization - highest priority for files currently relevant
    if (contextFileNames) {
      const isAInContext = contextFileNames.some(name => a.path.includes(name));
      const isBInContext = contextFileNames.some(name => b.path.includes(name));
      
      if (isAInContext) scoreA += 100;
      if (isBInContext) scoreB += 100;
    }
    
    // 2. Main files get high priority
    if (isMainFile(a.path)) scoreA += 50;
    if (isMainFile(b.path)) scoreB += 50;
    
    // 3. Type-based prioritization - code files get priority over assets or config
    scoreA += getFilePriorityByType(a.extension);
    scoreB += getFilePriorityByType(b.extension);
    
    // 4. Size consideration - smaller files more likely to fit in context window
    // We convert size to a smaller score component (max 10 points for tiny files)
    const sizeScoreA = Math.max(0, 10 - Math.floor(a.size / 1024 / 10));
    const sizeScoreB = Math.max(0, 10 - Math.floor(b.size / 1024 / 10));
    scoreA += sizeScoreA;
    scoreB += sizeScoreB;
    
    // Higher score = higher priority
    return scoreB - scoreA;
  });
  
  // Apply chunking logic if step info is provided
  let filesToProcess = sortedFiles;
  if (stepInfo) {
    console.log(`[DEBUG] Applying chunking logic for step ${stepInfo.mainStep}.${stepInfo.subStep}`);
    
    // Always include critical/important files first
    const criticalFiles = sortedFiles.filter(file => 
      isMainFile(file.path) || 
      file.path.includes('index') || 
      file.path.includes('main')
    );
    
    // Determine additional files to include based on substep
    const nonCriticalFiles = sortedFiles.filter(file => 
      !criticalFiles.some(cf => cf.path === file.path)
    );
    
    if (stepInfo.subStep === 0) {
      // For main steps, include critical files plus top few regular files
      const regularFiles = nonCriticalFiles.slice(0, 2);
      filesToProcess = [...criticalFiles, ...regularFiles];
      console.log(`[DEBUG] Main step ${stepInfo.mainStep}: Including ${criticalFiles.length} critical files + ${regularFiles.length} regular files`);
    } else {
      // For substeps, include critical files plus rotating subset of other files
      const startIdx = ((stepInfo.subStep - 1) * 2) % nonCriticalFiles.length;
      const endIdx = Math.min(startIdx + 2, nonCriticalFiles.length);
      const chunkFiles = nonCriticalFiles.slice(startIdx, endIdx);
      filesToProcess = [...criticalFiles, ...chunkFiles];
      console.log(`[DEBUG] Substep ${stepInfo.mainStep}.${stepInfo.subStep}: Including ${criticalFiles.length} critical files + ${chunkFiles.length} chunk files`);
    }
  }
  
  // Include most relevant parts of files with intelligent chunking
  for (const file of filesToProcess) {
    const fileTokens = Math.ceil(file.content.length * tokenEstimatePerChar);
    
    // If adding this file would exceed token limit, use intelligent chunking
    if (estimatedTokens + fileTokens > maxTotalTokens) {
      // For large files, try to extract the most informative sections rather than skipping entirely
      const chunks = intelligentlyChunkFileContent(file.content, maxTotalTokens - estimatedTokens, tokenEstimatePerChar);
      
      if (chunks.length > 0) {
        // Include partial content with the most important sections
        result += `\n\n## File: ${file.relativePath}\n${file.summary}\n\n\`\`\`${getLanguageFromExtension(file.extension)}\n${chunks.join('\n\n// [...code omitted for brevity...]\n\n')}\n\`\`\`\n`;
        estimatedTokens += Math.ceil(chunks.join('\n').length * tokenEstimatePerChar) + 100; // Add extra for formatting
      } else {
        // If we can't even fit chunks, just include the summary
        result += `\n\n## File: ${file.relativePath}\n${file.summary}\n(Content too large to include)\n`;
        estimatedTokens += Math.ceil(file.summary.length * tokenEstimatePerChar) + 50;
      }
    } else {
      // Include full content
      result += `\n\n## File: ${file.relativePath}\n${file.summary}\n\n\`\`\`${getLanguageFromExtension(file.extension)}\n${file.content}\n\`\`\`\n`;
      estimatedTokens += fileTokens;
    }
    
    // Stop if we're approaching the token limit
    if (estimatedTokens > maxTotalTokens * 0.9) {
      result += "\n\n(Some files omitted due to token limits)\n";
      break;
    }
  }
  
  return result;
}

/**
 * Determines if a file is a "main" file (like index.js, main.py, etc.)
 */
function isMainFile(filePath: string): boolean {
  const filename = path.basename(filePath).toLowerCase();
  const mainFilePatterns = [
    'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
    'server.js', 'server.ts', 'package.json', 'tsconfig.json'
  ];
  
  return mainFilePatterns.includes(filename);
}

/**
 * Intelligently chunk file content to extract the most important parts
 * This analyzes code structure to keep critical sections like function definitions,
 * class declarations, etc. while removing less important parts to fit within token limits
 * @param content The full file content
 * @param maxTokens Maximum tokens available for this content
 * @param tokenEstimatePerChar Token estimation ratio
 * @returns Array of the most important content chunks
 */
function intelligentlyChunkFileContent(content: string, maxTokens: number, tokenEstimatePerChar: number): string[] {
  if (!content || content.trim() === '') return [];
  
  // Identify potential chunks to extract in order of importance
  const lines = content.split('\n');
  const chunks: {text: string; importance: number}[] = [];
  
  // Track current chunk
  let currentChunk = '';
  let inBlock = false;
  let blockLevel = 0;
  let blockType = '';
  let importSection = '';
  let foundImports = false;
  
  // First pass: Collect imports separately as they're often critical
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Gather all import statements as they're usually important for context
    if (line.trim().startsWith('import ') || line.trim().startsWith('require(')) {
      importSection += line + '\n';
      foundImports = true;
    }
  }
  
  // Second pass: Identify code blocks and their importance
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip import lines as we've already handled them
    if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('require(')) {
      continue;
    }
    
    // Detect start of important blocks
    const isClassDeclaration = /^(export\s+)?(abstract\s+)?class\s+[A-Za-z0-9_]+/.test(trimmedLine);
    const isFunctionDeclaration = /^(export\s+)?(async\s+)?function\s+[A-Za-z0-9_]+/.test(trimmedLine) || 
                                 /^(export\s+)?(public|private|protected|static|async)\s+[A-Za-z0-9_]+\s*\(/.test(trimmedLine) ||
                                 /^\s*[A-Za-z0-9_]+\s*\([^)]*\)\s*=>/.test(line) ||
                                 /^\s*[A-Za-z0-9_]+\s*=\s*function\s*\(/.test(line);
    const isInterfaceDeclaration = /^(export\s+)?interface\s+[A-Za-z0-9_]+/.test(trimmedLine);
    const isTypeDeclaration = /^(export\s+)?type\s+[A-Za-z0-9_]+/.test(trimmedLine);
    const isConstDeclaration = /^(export\s+)?const\s+[A-Za-z0-9_]+/.test(trimmedLine) && line.includes('=');
    
    // Track code block depth with braces
    if (trimmedLine.includes('{')) {
      if (!inBlock) {
        inBlock = true;
        currentChunk = line + '\n';
        
        if (isClassDeclaration) blockType = 'class';
        else if (isFunctionDeclaration) blockType = 'function';
        else if (isInterfaceDeclaration) blockType = 'interface';
        else if (isTypeDeclaration) blockType = 'type';
        else blockType = 'other';
      } else {
        currentChunk += line + '\n';
      }
      blockLevel += (trimmedLine.match(/{/g) || []).length;
    } 
    // Handle closing braces
    else if (trimmedLine.includes('}')) {
      currentChunk += line + '\n';
      blockLevel -= (trimmedLine.match(/}/g) || []).length;
      
      // If we've closed the entire block, add it to chunks
      if (blockLevel <= 0) {
        let importance = 0;
        // Assign importance based on block type
        if (blockType === 'class') importance = 100;
        else if (blockType === 'function') importance = 90;
        else if (blockType === 'interface') importance = 80;
        else if (blockType === 'type') importance = 70;
        else importance = 30;
        
        // Give extra importance to export declarations
        if (currentChunk.includes('export ')) importance += 20;
        
        chunks.push({
          text: currentChunk,
          importance
        });
        
        inBlock = false;
        currentChunk = '';
        blockType = '';
      }
    } 
    // Important standalone statements (not inside a block)
    else if (!inBlock) {
      if (isConstDeclaration || isTypeDeclaration) {
        // Capture variable declarations with their assignments
        let constChunk = line + '\n';
        let j = i + 1;
        // For multiline declarations
        while (j < lines.length && lines[j].trim() !== '' && !lines[j].includes(';') && !lines[j].trim().startsWith('//')) {
          constChunk += lines[j] + '\n';
          j++;
        }
        if (j < lines.length && lines[j].includes(';')) {
          constChunk += lines[j] + '\n';
        }
        
        chunks.push({
          text: constChunk,
          importance: isConstDeclaration ? 60 : 65
        });
        
        i = j; // Skip processed lines
      } 
      // Comments that might be documentation
      else if (trimmedLine.startsWith('/**') || trimmedLine.startsWith('//')) {
        let commentChunk = line + '\n';
        let j = i + 1;
        
        // Collect entire comment block
        while (j < lines.length && 
              (lines[j].trim().startsWith('*') || lines[j].trim().startsWith('//'))) {
          commentChunk += lines[j] + '\n';
          j++;
        }
        
        // Include the line after the comment if it's a declaration (likely the thing being documented)
        if (j < lines.length) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith('function') || 
              nextLine.startsWith('class') || 
              nextLine.startsWith('interface') ||
              nextLine.startsWith('export') ||
              /^(public|private|protected)\s/.test(nextLine)) {
            commentChunk += lines[j] + '\n';
            j++;
          }
        }
        
        // Only keep substantial comments
        if (commentChunk.split('\n').length > 2 || commentChunk.includes('@param') || commentChunk.includes('@returns')) {
          chunks.push({
            text: commentChunk,
            importance: 40
          });
        }
        
        i = j - 1; // Skip processed lines
      }
      // Continue building current non-block content
      else if (trimmedLine !== '') {
        currentChunk += line + '\n';
      }
    } 
    // Add lines to the current block
    else {
      currentChunk += line + '\n';
    }
  }
  
  // Sort chunks by importance
  chunks.sort((a, b) => b.importance - a.importance);
  
  // Add imports first if found
  const finalChunks: string[] = [];
  if (foundImports) {
    finalChunks.push(importSection);
  }
  
  // Start with most important chunks and add until we reach the token limit
  let tokenCount = Math.ceil(importSection.length * tokenEstimatePerChar);
  
  for (const chunk of chunks) {
    const chunkTokens = Math.ceil(chunk.text.length * tokenEstimatePerChar);
    
    if (tokenCount + chunkTokens <= maxTokens) {
      finalChunks.push(chunk.text);
      tokenCount += chunkTokens;
    } else if (finalChunks.length === 0) {
      // If we haven't added any chunks yet, add at least one (the most important)
      // even if it exceeds the token limit
      finalChunks.push(chunk.text);
      break;
    } else {
      break; // Stop if we've reached the token limit
    }
  }
  
  return finalChunks;
}

/**
 * Get priority score for a file based on its extension type
 * Higher score = higher priority in context
 */
function getFilePriorityByType(extension: string): number {
  // Normalize extension format
  const ext = extension.toLowerCase().replace(/^\./,'');
  
  // Prioritize by file type
  const priorities: Record<string, number> = {
    // Core code files - highest priority
    'ts': 40,
    'js': 40,
    'tsx': 38,
    'jsx': 38,
    'py': 38,
    'java': 35,
    'cpp': 35,
    'c': 35,
    'go': 35,
    'rs': 35,
    'php': 30,
    'rb': 30,
    'scala': 30,
    
    // UI related files
    'html': 25,
    'css': 20,
    'scss': 20,
    'vue': 30,
    'svelte': 30,
    
    // Config files - medium priority
    'json': 25,
    'yaml': 22,
    'yml': 22,
    'xml': 20,
    'toml': 20,
    
    // Documentation
    'md': 15,
    'txt': 10,
    'rst': 10,
    
    // Other
    'csv': 5,
    'sql': 18
  };
  
  return priorities[ext] || 0; // Default to lowest priority if not found
}

/**
 * Get language identifier from file extension for syntax highlighting
 */
function getLanguageFromExtension(extension: string): string {
  const mapping: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.json': 'json',
    '.html': 'html',
    '.css': 'css',
    '.md': 'markdown',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.go': 'go'
  };
  
  return mapping[extension] || 'text';
}
