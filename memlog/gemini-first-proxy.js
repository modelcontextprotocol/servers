/**
 * Gemini-First Proxy for Sequential Thinking
 * 
 * This module implements a proxy that intercepts user input before it reaches Claude,
 * processes it with Gemini, and only passes the essential information to Claude.
 * 
 * This approach significantly reduces token usage by having Gemini handle the initial
 * processing and be content-aware of files and directories, with Claude only involved
 * at the end for final reasoning.
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

/**
 * GeminiFirstProxy class
 * Handles the interception and processing of user input before it reaches Claude
 */
export class GeminiFirstProxy {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    this.baseUrl = options.baseUrl || 'https://openrouter.ai/api/v1';
    this.model = options.model || 'google/gemini-2.0-flash-thinking-exp:free';
    this.fileSystemAwareness = new FileSystemAwareness();
    this.contextManager = new GeminiContextManager();
    
    if (!this.apiKey) {
      console.error('WARNING: No API key provided for GeminiFirstProxy. Set OPENROUTER_API_KEY environment variable or pass apiKey in options.');
    }
  }
  
  /**
   * Process user input through Gemini before passing to Claude
   * @param {string} userInput - The user's input
   * @param {object} options - Additional options
   * @returns {object} - Processed content for Claude
   */
  async processUserInput(userInput, options = {}) {
    try {
      // Check if input involves file system operations
      const needsFileSystemContext = this.needsFileSystemContext(userInput);
      
      // Get file system context if needed
      let fileSystemContext = null;
      if (needsFileSystemContext) {
        const path = this.extractPathFromInput(userInput) || '.';
        fileSystemContext = await this.fileSystemAwareness.getFileSystemContext(path);
      }
      
      // Create prompt for Gemini with appropriate context
      const prompt = this.createGeminiPrompt(userInput, fileSystemContext);
      
      // Send to Gemini for processing
      const geminiResponse = await this.sendToGemini(prompt);
      
      // Add to context manager
      this.contextManager.addToContext({
        input: userInput,
        response: geminiResponse,
        fileSystemContext: fileSystemContext,
        timestamp: new Date().toISOString()
      });
      
      // Prepare minimal response for Claude
      return this.prepareForClaude(geminiResponse, userInput);
    } catch (error) {
      console.error('Error in GeminiFirstProxy:', error);
      
      // Fallback to minimal processing if Gemini fails
      return this.fallbackProcessing(userInput);
    }
  }
  
  /**
   * Check if the input needs file system context
   * @param {string} input - The user input
   * @returns {boolean} - Whether file system context is needed
   */
  needsFileSystemContext(input) {
    const fileSystemKeywords = [
      'file', 'directory', 'folder', 'path', 'read', 'write', 'create',
      'delete', 'list', 'search', 'find', 'open', 'close', 'save',
      '.js', '.ts', '.json', '.md', '.txt', '.html', '.css', '.py'
    ];
    
    return fileSystemKeywords.some(keyword => 
      input.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  
  /**
   * Extract a file path from user input
   * @param {string} input - The user input
   * @returns {string|null} - Extracted path or null
   */
  extractPathFromInput(input) {
    // Simple regex to find potential file paths
    // This could be enhanced with more sophisticated NLP
    const pathRegex = /(?:in|at|from|to|path|file|directory|folder)[\s:]+['"]?([\w\/\.-]+)['"]?/i;
    const match = input.match(pathRegex);
    
    return match ? match[1] : null;
  }
  
  /**
   * Create a prompt for Gemini with appropriate context
   * @param {string} userInput - The user input
   * @param {object|null} fileSystemContext - File system context if available
   * @returns {string} - Formatted prompt for Gemini
   */
  createGeminiPrompt(userInput, fileSystemContext) {
    let prompt = `Process the following user input for the Sequential Thinking tool:\n\n${userInput}\n\n`;
    
    // Add context from previous interactions
    const context = this.contextManager.getContext();
    if (context.length > 0) {
      prompt += `\nContext from previous interactions:\n`;
      const recentContext = context.slice(-3); // Last 3 interactions
      recentContext.forEach((item, index) => {
        prompt += `\nInteraction ${index + 1}:\n`;
        prompt += `Input: ${item.input}\n`;
        prompt += `Response: ${item.response.summary}\n`;
      });
    }
    
    // Add file system context if available
    if (fileSystemContext) {
      prompt += `\nFile System Context:\n`;
      prompt += `Current Path: ${fileSystemContext.currentPath}\n`;
      prompt += `Files and Directories:\n`;
      
      fileSystemContext.files.forEach(file => {
        prompt += `- ${file.name} (${file.isDirectory ? 'Directory' : 'File'}, ${this.formatSize(file.size)})\n`;
      });
      
      // If there are too many files, summarize
      if (fileSystemContext.files.length > 10) {
        prompt += `\nDirectory Summary: ${fileSystemContext.files.length} total items, ${fileSystemContext.files.filter(f => f.isDirectory).length} directories, ${fileSystemContext.files.filter(f => !f.isDirectory).length} files\n`;
      }
    }
    
    // Add instructions for Gemini
    prompt += `\nInstructions:
1. Process this input to understand what the user is asking about the Sequential Thinking codebase
2. If file system operations are involved, use the provided file system context
3. Generate a concise summary of the input that captures the essential meaning
4. Identify key concepts, entities, and actions in the input
5. Provide a minimal response that Claude can use for final reasoning
6. Focus on preserving meaning while minimizing token usage

Your response should be structured as follows:
- Summary: A concise summary of the input
- Key Concepts: List of important concepts, entities, and actions
- Essential Information: Only the most critical information needed for reasoning
- Metadata: Any additional information that might be useful`;

    return prompt;
  }
  
  /**
   * Format file size in a human-readable way
   * @param {number} size - Size in bytes
   * @returns {string} - Formatted size
   */
  formatSize(size) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let formattedSize = size;
    let unitIndex = 0;
    
    while (formattedSize >= 1024 && unitIndex < units.length - 1) {
      formattedSize /= 1024;
      unitIndex++;
    }
    
    return `${formattedSize.toFixed(1)} ${units[unitIndex]}`;
  }
  
  /**
   * Send prompt to Gemini via OpenRouter
   * @param {string} prompt - The prompt to send
   * @returns {object} - Gemini's response
   */
  async sendToGemini(prompt) {
    if (!this.apiKey) {
      throw new Error('No API key provided for OpenRouter');
    }
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a preprocessing assistant for the Sequential Thinking tool. Your job is to process user input before it reaches Claude, focusing on preserving meaning while minimizing token usage.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.3,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://modelcontextprotocol.io',
            'X-Title': 'Sequential Thinking Gemini-First Proxy'
          }
        }
      );
      
      // Extract and parse the response
      const content = response.data.choices[0].message.content;
      
      // Parse the structured response
      // This is a simplified parsing - in a real implementation,
      // you would use a more robust parsing approach
      const sections = content.split(/\n+- /);
      
      return {
        raw: content,
        summary: this.extractSection(content, 'Summary'),
        keyConcepts: this.extractSection(content, 'Key Concepts'),
        essentialInformation: this.extractSection(content, 'Essential Information'),
        metadata: this.extractSection(content, 'Metadata'),
        originalLength: prompt.length,
        processedLength: content.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error sending to Gemini:', error);
      throw error;
    }
  }
  
  /**
   * Extract a section from Gemini's response
   * @param {string} content - The full response content
   * @param {string} sectionName - The name of the section to extract
   * @returns {string} - The extracted section content
   */
  extractSection(content, sectionName) {
    const regex = new RegExp(`${sectionName}:([\\s\\S]*?)(?=\\n+- |$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }
  
  /**
   * Prepare the response for Claude
   * @param {object} geminiResponse - Gemini's processed response
   * @param {string} originalInput - The original user input
   * @returns {object} - Minimal content for Claude
   */
  prepareForClaude(geminiResponse, originalInput) {
    // Create a minimal response that preserves essential meaning
    // but uses as few tokens as possible
    return {
      type: "gemini_processed",
      content: geminiResponse.summary,
      metadata: {
        processedByGemini: true,
        originalLength: originalInput.length,
        processedLength: geminiResponse.summary.length,
        compressionRatio: Math.round(geminiResponse.summary.length / originalInput.length * 100),
        keyConcepts: geminiResponse.keyConcepts.split(',').map(c => c.trim()),
        timestamp: geminiResponse.timestamp
      }
    };
  }
  
  /**
   * Fallback processing if Gemini fails
   * @param {string} userInput - The original user input
   * @returns {object} - Minimal processed content
   */
  fallbackProcessing(userInput) {
    // Use the adaptive fallback implementation if available
    // This is a simplified version for demonstration
    
    // Extract first sentence as a summary
    const firstSentenceMatch = userInput.match(/^[^.!?]+[.!?]/);
    const summary = firstSentenceMatch 
      ? firstSentenceMatch[0] 
      : userInput.substring(0, Math.min(100, userInput.length));
    
    // Extract key terms
    const keyTerms = this.extractKeyTerms(userInput);
    
    return {
      type: "fallback_processed",
      content: summary,
      metadata: {
        processedByGemini: false,
        fallbackMode: true,
        originalLength: userInput.length,
        processedLength: summary.length,
        compressionRatio: Math.round(summary.length / userInput.length * 100),
        keyConcepts: keyTerms,
        timestamp: new Date().toISOString()
      }
    };
  }
  
  /**
   * Extract key terms from text
   * @param {string} text - The text to analyze
   * @returns {string[]} - Array of key terms
   */
  extractKeyTerms(text) {
    const terms = [];
    
    // Extract capitalized terms
    const capitalizedRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    let match;
    while ((match = capitalizedRegex.exec(text)) !== null) {
      if (match[0] && match[0].length > 3) {
        terms.push(match[0]);
      }
    }
    
    // Extract technical terms
    const technicalRegex = /\b(?:algorithm|system|process|method|framework|architecture|component|module|function|class|interface|protocol|api|database|model|pattern|design|implementation|optimization|analysis)\b/gi;
    while ((match = technicalRegex.exec(text)) !== null) {
      terms.push(match[0]);
    }
    
    // Deduplicate and return
    return [...new Set(terms)];
  }
}

/**
 * FileSystemAwareness class
 * Provides file system context for Gemini
 */
class FileSystemAwareness {
  /**
   * Get file system context for a given path
   * @param {string} dirPath - The directory path
   * @returns {object} - File system context
   */
  async getFileSystemContext(dirPath = '.') {
    try {
      // Get files and directories
      const files = await fs.readdir(dirPath);
      
      // Get details for each file/directory
      const fileDetails = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(dirPath, file);
          try {
            const stats = await fs.stat(filePath);
            return {
              name: file,
              path: filePath,
              isDirectory: stats.isDirectory(),
              size: stats.size,
              modified: stats.mtime
            };
          } catch (error) {
            // Handle permission errors or other issues
            return {
              name: file,
              path: filePath,
              isDirectory: false,
              size: 0,
              error: error.message
            };
          }
        })
      );
      
      // Build directory structure
      const directoryStructure = this.buildDirectoryTree(fileDetails);
      
      return {
        currentPath: dirPath,
        files: fileDetails,
        directoryStructure
      };
    } catch (error) {
      console.error(`Error getting file system context for ${dirPath}:`, error);
      return {
        currentPath: dirPath,
        error: error.message,
        files: []
      };
    }
  }
  
  /**
   * Build a tree representation of the directory structure
   * @param {Array} files - Array of file details
   * @returns {object} - Directory tree
   */
  buildDirectoryTree(files) {
    // This is a simplified implementation
    // In a real implementation, you would build a more comprehensive tree
    const directories = files.filter(file => file.isDirectory);
    const regularFiles = files.filter(file => !file.isDirectory);
    
    return {
      directoryCount: directories.length,
      fileCount: regularFiles.length,
      totalCount: files.length,
      directories: directories.map(dir => dir.name),
      fileTypes: this.categorizeFileTypes(regularFiles)
    };
  }
  
  /**
   * Categorize files by type
   * @param {Array} files - Array of file details
   * @returns {object} - Categorized files
   */
  categorizeFileTypes(files) {
    const categories = {};
    
    files.forEach(file => {
      const ext = path.extname(file.name).toLowerCase();
      if (!categories[ext]) {
        categories[ext] = 0;
      }
      categories[ext]++;
    });
    
    return categories;
  }
  
  /**
   * Get file content if needed
   * @param {string} filePath - Path to the file
   * @returns {string} - File content
   */
  async getFileContent(filePath) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return `Error reading file: ${error.message}`;
    }
  }
}

/**
 * GeminiContextManager class
 * Manages context between thoughts
 */
class GeminiContextManager {
  constructor(options = {}) {
    this.context = [];
    this.maxContextItems = options.maxContextItems || 10;
  }
  
  /**
   * Add an item to the context
   * @param {object} item - The context item to add
   */
  addToContext(item) {
    this.context.push(item);
    if (this.context.length > this.maxContextItems) {
      this.context.shift();
    }
  }
  
  /**
   * Get the current context
   * @returns {Array} - The current context
   */
  getContext() {
    return this.context;
  }
  
  /**
   * Get a minimal context summary for Claude
   * @returns {object} - Minimal context summary
   */
  getMinimalContextForClaude() {
    if (this.context.length === 0) {
      return { contextSize: 0 };
    }
    
    return {
      contextSize: this.context.length,
      lastItemSummary: this.summarizeItem(this.context[this.context.length - 1])
    };
  }
  
  /**
   * Create a minimal summary of a context item
   * @param {object} item - The context item to summarize
   * @returns {object} - Summarized item
   */
  summarizeItem(item) {
    return {
      inputLength: item.input.length,
      responseLength: item.response.summary.length,
      timestamp: item.timestamp,
      hadFileSystemContext: !!item.fileSystemContext
    };
  }
  
  /**
   * Clear the context
   */
  clearContext() {
    this.context = [];
  }
}

// Example usage
async function testGeminiFirstProxy() {
  const proxy = new GeminiFirstProxy({
    apiKey: process.env.OPENROUTER_API_KEY
  });
  
  const testInput = "Analyze the Sequential Thinking codebase for potential enhancements, focusing on token optimization strategies.";
  
  console.log("Testing Gemini-First Proxy with input:", testInput);
  
  try {
    const result = await proxy.processUserInput(testInput);
    console.log("Processed result:", result);
    console.log("Compression ratio:", result.metadata.compressionRatio + "%");
    console.log("Key concepts:", result.metadata.keyConcepts);
  } catch (error) {
    console.error("Error testing proxy:", error);
  }
}

// Uncomment to test
// testGeminiFirstProxy().catch(console.error);

export default GeminiFirstProxy;
