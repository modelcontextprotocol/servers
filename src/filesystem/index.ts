#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { simpleGit, SimpleGit } from 'simple-git';

// Import state utilities
import { getState, saveState, hasValidatedInPrompt, markValidatedInPrompt, resetValidationState, hasValidatedRepo, markRepoValidated } from './state-utils.js';

// Command line argument parsing
const args = process.argv.slice(2);

// Configuration options
type GitConfig = {
  requireCleanBranch: boolean;
  checkedThisPrompt: boolean;
};

const gitConfig: GitConfig = {
  requireCleanBranch: false,
  checkedThisPrompt: false
};

// Extract any options from the command line arguments
const directoryArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--require-clean-branch') {
    gitConfig.requireCleanBranch = true;
  } else {
    directoryArgs.push(arg);
  }
}

if (directoryArgs.length === 0) {
  console.error("Usage: mcp-server-filesystem [--git] [--require-clean-branch] <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = directoryArgs.map(dir =>
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(directoryArgs.map(async (dir) => {
  try {
    const stats = await fs.stat(expandHome(dir));
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Git validation utilities
async function isGitClean(filePath: string): Promise<{isRepo: boolean, isClean: boolean, repoPath: string | null}> {
  try {
    // Find the containing git repository (if any)
    // First, check if the provided path itself is a git repository
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    let currentPath = resolvedPath;
    let repoPath = null;
    
    // Get file stats to check if it's a directory or file
    try {
      const stats = await fs.stat(resolvedPath);
      // If it's a file, start from its parent directory
      if (!stats.isDirectory()) {
        currentPath = path.dirname(resolvedPath);
      }
    } catch (error) {
      // If path doesn't exist, start from its parent directory
      currentPath = path.dirname(resolvedPath);
    }
    
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
    // Consider a repo clean only if it has no modified, deleted, or untracked files
    // status.isClean() only checks for modified tracked files, but we want to also check for untracked files
    const isClean = status.isClean() && status.not_added.length === 0;
    
    return { isRepo: true, isClean, repoPath };
  } catch (error) {
    // Error checking Git status
    return { isRepo: false, isClean: false, repoPath: null };
  }
}

// Check if the Git status allows modification
// With the Repository-Aware-Check-Per-Prompt approach, validation is performed
// the first time each repository is accessed in a prompt
async function validateGitStatus(filePath: string, promptId?: string): Promise<void> {
  if (!gitConfig.requireCleanBranch) {
    return; // Git validation is disabled
  }
  
  const { isRepo, isClean, repoPath } = await isGitClean(filePath);
  
  // When requireCleanBranch is set, we require the file to be in a Git repository
  if (!isRepo) {
    throw new Error(
      "The file " + filePath + " is not in a Git repository. " +
      "This server is configured to require files to be in Git repositories with clean branches."
      );
  }
  
  // Skip if we've already checked this repo in this prompt
  const hasValidated = await hasValidatedRepo(repoPath, promptId);
  if (hasValidated) {
    // Skip validation - this repo was already validated in this prompt
    return;
  }
  
  // We require the repository to be clean
  if (!isClean) {
      throw new Error(
        "Git repository at " + repoPath + " has uncommitted changes. " + 
        "This server is configured to require a clean branch before allowing changes."
      );
  }
  
  // Mark that we've checked this repo in this prompt
  await markRepoValidated(repoPath, promptId);
  
  // Also mark general validation for backward compatibility
  await markValidatedInPrompt(promptId);
}

// Git validation utilities
// Security utilities
async function validatePath(requestedPath: string, skipGitCheck: boolean = false, promptId?: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    
    // Perform Git validation if required
    if (!skipGitCheck && gitConfig.requireCleanBranch) {
      await validateGitStatus(realPath, promptId);
    }
    
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      
      // Perform Git validation on the parent directory for new files
      if (!skipGitCheck && gitConfig.requireCleanBranch) {
        await validateGitStatus(parentDir, promptId);
      }
      
      return absolute;
    } catch (validationError) {
      if (validationError instanceof Error) {
        throw validationError; // Re-throw Git validation errors
      }
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with')
});

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format')
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([])
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

const GetGitStatusArgsSchema = z.object({
  path: z.string(),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool implementations
async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  promptId?: string
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      try {
        // Validate each path before processing (skip Git check for search)
        await validatePath(fullPath, true, promptId);

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(pattern => {
          const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });

        if (shouldExclude) {
          continue;
        }

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    'original',
    'modified'
  );
}

async function applyFileEdits(
  filePath: string,
  edits: Array<{oldText: string, newText: string}>,
  dryRun = false
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));

  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }

    // Otherwise, try line-by-line matching with flexibility for whitespace
    const oldLines = normalizedOld.split('\n');
    const contentLines = modifiedContent.split('\n');
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      });

      if (isMatch) {
        // Preserve original indentation of first line
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
        const newLines = normalizedNew.split('\n').map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();
          // For subsequent lines, try to preserve relative indentation
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
          const newIndent = line.match(/^\s*/)?.[0] || '';
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
          }
          return line;
        });

        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join('\n');
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
    }
  }

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }

  return formattedDiff;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description:
          "Read the complete contents of a file from the file system. " +
          "Handles various text encodings and provides detailed error messages " +
          "if the file cannot be read. Use this tool when you need to examine " +
          "the contents of a single file. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: "read_multiple_files",
        description:
          "Read the contents of multiple files simultaneously. This is more " +
          "efficient than reading files one by one when you need to analyze " +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          "the entire operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
      },
      {
        name: "write_file",
        description:
          "Create a new file or completely overwrite an existing file with new content. " +
          "Use with caution as it will overwrite existing files without warning. " +
          "Handles text content with proper encoding. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
      },
      {
        name: "edit_file",
        description:
          "Make line-based edits to a text file. Each edit replaces exact line sequences " +
          "with new content. Returns a git-style diff showing the changes made. " +
          "Only works within allowed directories.",
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
      },
      {
        name: "create_directory",
        description:
          "Create a new directory or ensure a directory exists. Can create multiple " +
          "nested directories in one operation. If the directory already exists, " +
          "this operation will succeed silently. Perfect for setting up directory " +
          "structures for projects or ensuring required paths exist. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory",
        description:
          "Get a detailed listing of all files and directories in a specified path. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is essential for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "directory_tree",
        description:
            "Get a recursive tree view of files and directories as a JSON structure. " +
            "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
            "Files have no children array, while directories always have a children array (which may be empty). " +
            "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Can move files between directories " +
          "and rename them in a single operation. If the destination exists, the " +
          "operation will fail. Works across different directories and can be used " +
          "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
      },
      {
        name: "search_files",
        description:
          "Recursively search for files and directories matching a pattern. " +
          "Searches through all subdirectories from the starting path. The search " +
          "is case-insensitive and matches partial names. Returns full paths to all " +
          "matching items. Great for finding files when you don't know their exact location. " +
          "Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: "get_file_info",
        description:
          "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
          "information including size, creation time, last modified time, permissions, " +
          "and type. This tool is perfect for understanding file characteristics " +
          "without reading the actual content. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: "list_allowed_directories",
        description:
          "Returns the list of directories that this server is allowed to access. " +
          "Use this to understand which directories are available before trying to access files.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "git_status",
        description:
          "Checks if a path is within a Git repository and returns its status. " +
          "Provides information about the repository cleanliness and current configuration. " +
          "Useful for understanding if changes will be allowed based on the server's Git integration settings.",
        inputSchema: zodToJsonSchema(GetGitStatusArgsSchema) as ToolInput,
      },
    ],
  };
});


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Generate a unique prompt ID for this request that remains stable across multiple calls
  // We'll use a combination of the current hour and minute to make it stable for a short period
  const now = new Date();
  const promptId = `prompt-${now.getTime()}`;
  
  try {
    const { name, arguments: args } = request.params;

    // Get the response from the appropriate tool handler
    let response;
    
    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, true, promptId); // Skip Git check for read-only operation
        const content = await fs.readFile(validPath, "utf-8");
        response = {
          content: [{ type: "text", text: content }],
        };
        break;
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath, true, promptId); // Skip Git check for read-only operation
              const content = await fs.readFile(validPath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        response = {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
        break;
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, false, promptId); // Git check is now performed in validatePath
        
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        response = {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
        break;
      }

      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }
        
        // If this is a dry run, skip Git check
        const validPath = await validatePath(parsed.data.path, parsed.data.dryRun, promptId);
        
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
        response = {
          content: [{ type: "text", text: result }],
        };
        break;
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, false, promptId); // Git check is now performed in validatePath
        
        await fs.mkdir(validPath, { recursive: true });
        response = {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
        break;
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, true, promptId); // Skip Git check for read-only operation
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        response = {
          content: [{ type: "text", text: formatted }],
        };
        break;
      }

        case "directory_tree": {
            const parsed = DirectoryTreeArgsSchema.safeParse(args);
            if (!parsed.success) {
                throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
            }

            interface TreeEntry {
                name: string;
                type: 'file' | 'directory';
                children?: TreeEntry[];
            }

            async function buildTree(currentPath: string): Promise<TreeEntry[]> {
                const validPath = await validatePath(currentPath, true, promptId); // Skip Git check for read-only operation
                const entries = await fs.readdir(validPath, {withFileTypes: true});
                const result: TreeEntry[] = [];

                for (const entry of entries) {
                    const entryData: TreeEntry = {
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file'
                    };

                    if (entry.isDirectory()) {
                        const subPath = path.join(currentPath, entry.name);
                        entryData.children = await buildTree(subPath);
                    }

                    result.push(entryData);
                }

                return result;
            }

            const treeData = await buildTree(parsed.data.path);
            response = {
                content: [{
                    type: "text",
                    text: JSON.stringify(treeData, null, 2)
                }],
            };
            break;
        }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source, false, promptId); // Git check is now performed in validatePath
        const validDestPath = await validatePath(parsed.data.destination, false, promptId); // Git check is now performed in validatePath
        
        await fs.rename(validSourcePath, validDestPath);
        response = {
          content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
        };
        break;
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, true, promptId); // Skip Git check for read-only operation
        const results = await searchFiles(validPath, parsed.data.pattern, parsed.data.excludePatterns, promptId);
        response = {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
        break;
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, true, promptId); // Skip Git check for read-only operation
        const info = await getFileStats(validPath);
        response = {
          content: [{ type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n") }],
        };
        break;
      }

      case "list_allowed_directories": {
        response = {
          content: [{
            type: "text",
            text: `Allowed directories:\n${allowedDirectories.join('\n')}`
          }],
        };
        break;
      }
      
      case "git_status": {
        const parsed = GetGitStatusArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for git_status: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, true, promptId); // Skip Git check for read-only operation
        
        // Get Git status information
        const gitStatus = await isGitClean(validPath);
        
        if (!gitStatus.isRepo) {
          response = {
            content: [{ type: "text", text: `The path ${parsed.data.path} is not in a Git repository.` }],
          };
          break;
        }
        
        // If it's a repository, get additional info using simple-git
        const git = simpleGit(gitStatus.repoPath!);
        const status = await git.status();
        const branch = status.current;
        const statusSummary = [
          `Repository: ${gitStatus.repoPath}`,
          `Current branch: ${branch}`,
          `Status: ${gitStatus.isClean ? 'Clean' : 'Dirty'}`,
          `Git integration enabled: ${gitConfig.requireCleanBranch ? 'Yes' : 'No'}`,
          `Require clean branch: ${gitConfig.requireCleanBranch ? 'Yes' : 'No'}`,
        ];
        
        // Add info about tracked files
        if (status.files.length > 0) {
          statusSummary.push('\nChanged files:');
          for (const file of status.files) {
            statusSummary.push(`  ${file.path} [${file.working_dir}]`);
          }
        }
        
        response = {
          content: [{ type: "text", text: statusSummary.join('\n') }],
        };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    // Reset validation state after successful response, but preserve state within the same prompt
    await resetValidationState(promptId);
    
    return response;
  } catch (error) {
    // Reset validation state even on error, but preserve state within the same prompt
    await resetValidationState(promptId);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
  
  if (gitConfig.requireCleanBranch) {
    console.error("Git integration: Enabled");
    console.error("Git require clean branch: Yes - Files will only be modified after a validation on the first operation in each prompt");
  } else {
    console.error("Git integration: Disabled");
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
